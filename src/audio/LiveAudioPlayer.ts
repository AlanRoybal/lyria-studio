/**
 * Streams PCM16 LE stereo chunks from Lyria Realtime into the Web Audio API.
 * Also supports capture mode: buffers chunks into a RecordingPipeline so they
 * can be finalized into an AudioBuffer and dropped onto the timeline.
 */

import { RecordingPipeline } from './RecordingPipeline'

const SAMPLE_RATE = 48000
const CHANNELS = 2
// How far ahead to schedule when recovering from an underrun.
// Large enough to absorb IPC jitter; small enough not to feel sluggish.
const UNDERRUN_RECOVERY_SEC = 0.3

export class LiveAudioPlayer {
  private ctx: AudioContext | null = null
  private gainNode: GainNode | null = null
  private scheduledUntil = 0
  private active = false
  private onSamples: ((samples: number[]) => void) | null = null

  // Capture state
  private pipeline: RecordingPipeline | null = null
  private captureStartSec = 0

  // Most recent decoded vocals clip (one-shot REST result). Kept so the user
  // can choose to commit it to the timeline via the dedicated capture button.
  private lastVocalsBuffer: AudioBuffer | null = null

  start(onSamples?: (samples: number[]) => void) {
    // Always create a fresh context so there's no stale scheduledUntil or
    // suspended-state from a previous session. Close the old one first.
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
      this.gainNode = null
    }
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    this.gainNode = this.ctx.createGain()
    this.gainNode.connect(this.ctx.destination)
    this.scheduledUntil = 0
    this.active = true
    this.onSamples = onSamples ?? null
    // Electron's Chromium autoplay policy can leave a new AudioContext
    // suspended when created after an async boundary. Resume explicitly.
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((e) => console.error('[LiveAudioPlayer] resume failed:', e))
    }
    // Re-sync scheduledUntil if the context is ever suspended mid-stream so
    // that chunks after a resume don't pile up at a stale timestamp.
    this.ctx.onstatechange = () => {
      if (this.ctx?.state === 'running') {
        // Let the next chunk recalculate from the current time.
        this.scheduledUntil = 0
      }
    }
  }

  stop() {
    this.active = false
    this.pipeline = null
    this.lastVocalsBuffer = null
    if (this.ctx) {
      this.ctx.close()
      this.ctx = null
      this.gainNode = null
    }
  }

  /** Most recently decoded vocals clip, or null if none received yet. */
  getLatestVocalsBuffer(): AudioBuffer | null {
    return this.lastVocalsBuffer
  }

  clearLatestVocalsBuffer(): void {
    this.lastVocalsBuffer = null
  }

  destroy() {
    this.stop()
  }

  /** Begin buffering incoming chunks for clip capture. */
  startCapture(playheadSec: number) {
    this.pipeline = new RecordingPipeline()
    this.captureStartSec = playheadSec
  }

  /**
   * Stop capture and return the assembled AudioBuffer + waveform cache.
   * Returns null if no audio was captured.
   */
  stopCapture(): { audioBuffer: AudioBuffer; waveformCache: Float32Array; startSec: number } | null {
    const p = this.pipeline
    this.pipeline = null
    if (!p || p.isEmpty || !this.ctx) return null

    const audioBuffer = p.finalize(this.ctx)
    const waveformCache = p.buildWaveformCache(audioBuffer, 500)
    return { audioBuffer, waveformCache, startSec: this.captureStartSec }
  }

  get isCapturing() {
    return this.pipeline !== null
  }

  getLiveCaptureDurationSec(): number {
    return this.pipeline?.getDurationSec() ?? 0
  }

  getLiveCaptureWaveform(targetPoints = 500): number[] {
    return this.pipeline?.getLiveWaveformSnapshot(targetPoints) ?? []
  }

  /**
   * Feed a base64-encoded PCM16 LE stereo chunk (48 kHz).
   */
  feedChunk(base64: string) {
    if (!this.active || !this.ctx || !this.gainNode) return

    // Resume the context if it was suspended (autoplay policy may have blocked it).
    // scheduledUntil will be reset via onstatechange once the context is running again.
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch((e) => console.error('[LiveAudioPlayer] resume in feedChunk failed:', e))
    }

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    const view = new DataView(bytes.buffer)
    const totalInt16 = bytes.length / 2
    const frameSamples = Math.floor(totalInt16 / CHANNELS)

    const audioBuffer = this.ctx.createBuffer(CHANNELS, frameSamples, SAMPLE_RATE)
    const left = audioBuffer.getChannelData(0)
    const right = audioBuffer.getChannelData(1)

    const waveformStep = 64
    const waveformSamples: number[] = []

    for (let i = 0; i < totalInt16; i++) {
      const int16 = view.getInt16(i * 2, true)
      const float = int16 / 32768.0
      const frame = i >> 1
      if (i % 2 === 0) {
        left[frame] = float
        if (frame % waveformStep === 0) waveformSamples.push(float)
      } else {
        right[frame] = float
      }
    }

    // Feed into capture pipeline if active
    if (this.pipeline) {
      this.pipeline.appendChunk(Array.from(left), Array.from(right))
    }

    // Schedule for playback.
    // Chain directly onto the previous chunk when ahead of the playhead so there
    // are no gaps between consecutive chunks.  Only fall back to the recovery
    // offset when we've actually underrun (buffer ran dry), which re-establishes
    // a comfortable buffer without adding latency on every single chunk.
    const now = this.ctx.currentTime
    const startAt = this.scheduledUntil > now
      ? this.scheduledUntil
      : now + UNDERRUN_RECOVERY_SEC
    const source = this.ctx.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.gainNode)
    source.start(startAt)
    this.scheduledUntil = startAt + audioBuffer.duration

    if (waveformSamples.length > 0) {
      this.onSamples?.(waveformSamples)
    }
  }

  get isActive() {
    return this.active
  }

  /**
   * Decode and play a one-shot base64-encoded audio clip (e.g. WAV/MP3 returned
   * by the Lyria REST API). Played on top of any ongoing streamed audio.
   */
  async playClip(base64: string): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      this.gainNode = this.ctx.createGain()
      this.gainNode.connect(this.ctx.destination)
      this.active = true
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume().catch((e) =>
          console.error('[LiveAudioPlayer] resume failed:', e)
        )
      }
    }
    if (!this.gainNode) return

    if (this.ctx.state === 'suspended') {
      await this.ctx.resume().catch((e) =>
        console.error('[LiveAudioPlayer] resume in playClip failed:', e)
      )
    }

    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)

    try {
      const buffer = await this.ctx.decodeAudioData(bytes.buffer.slice(0))
      this.lastVocalsBuffer = buffer
      const source = this.ctx.createBufferSource()
      source.buffer = buffer
      source.connect(this.gainNode)
      source.start(this.ctx.currentTime)
    } catch (err) {
      console.error('[LiveAudioPlayer] Failed to decode vocals clip:', err)
    }
  }
}

export const liveAudioPlayer = new LiveAudioPlayer()
