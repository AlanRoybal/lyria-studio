import type { Track } from '@/types/timeline'
import { sampleEnvelope } from './Automation'
import { getClipPlaybackBuffer } from './ClipPlayback'

export class AudioEngine {
  private ctx: AudioContext | null = null
  private scheduledSources: AudioBufferSourceNode[] = []
  private scheduledGains: GainNode[] = []
  private startContextTime = 0
  private startTimelineSec = 0
  private animFrameId: number | null = null
  private onPlayheadUpdate: ((sec: number) => void) | null = null

  getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      this.ctx = new AudioContext({ sampleRate: 48000 })
    }
    return this.ctx
  }

  play(
    tracks: Track[],
    fromSec: number,
    onPlayheadUpdate: (sec: number) => void
  ): void {
    this.stop()

    const ctx = this.getContext()
    if (ctx.state === 'suspended') ctx.resume()

    this.startContextTime = ctx.currentTime
    this.startTimelineSec = fromSec
    this.onPlayheadUpdate = onPlayheadUpdate

    const hasSolo = tracks.some((t) => t.soloed)

    for (const track of tracks) {
      if (track.muted) continue
      if (hasSolo && !track.soloed) continue

      for (const clip of track.clips) {
        const playbackBuffer = getClipPlaybackBuffer(clip, ctx)
        if (!playbackBuffer) continue
        // Skip clips that end before the playhead
        if (clip.startSec + clip.durationSec <= fromSec) continue

        const source = ctx.createBufferSource()
        source.buffer = playbackBuffer
        const speed = clip.speed ?? 1
        source.playbackRate.value = speed

        const gain = ctx.createGain()
        source.connect(gain)
        gain.connect(ctx.destination)

        // When in AudioContext time to start this source
        const contextStartTime = this.startContextTime + Math.max(0, clip.startSec - fromSec)
        // How far into the clip to start (if playhead is mid-clip)
        const clipOffset = Math.max(0, fromSec - clip.startSec)
        // Combine clip-level crop offset with any mid-clip seek offset
        const bufferOffset = (clip.cropStartSec ?? 0) + clipOffset * speed
        // Duration passed to start() is in source-buffer seconds.
        const remaining = (clip.durationSec - clipOffset) * speed

        // ── Volume envelope scheduling ──────────────────────────────────────
        const clipAudibleStart = Math.max(fromSec, clip.startSec)
        const clipAudibleEnd = clip.startSec + clip.durationSec

        const gainAt = (timelineSec: number) => {
          const trackEnv = sampleEnvelope(track.volumeAutomation, timelineSec)
          const clipEnv = sampleEnvelope(clip.volumeAutomation, timelineSec - clip.startSec)
          return track.volume * trackEnv * clipEnv
        }

        // Collect all breakpoint times within the playback window
        const breakpointTimes = new Set<number>([clipAudibleStart, clipAudibleEnd])
        for (const p of track.volumeAutomation ?? []) {
          if (p.timeSec > clipAudibleStart && p.timeSec < clipAudibleEnd) {
            breakpointTimes.add(p.timeSec)
          }
        }
        for (const p of clip.volumeAutomation ?? []) {
          const abs = clip.startSec + p.timeSec
          if (abs > clipAudibleStart && abs < clipAudibleEnd) {
            breakpointTimes.add(abs)
          }
        }
        const sortedTimes = Array.from(breakpointTimes).sort((a, b) => a - b)

        gain.gain.setValueAtTime(gainAt(sortedTimes[0]), contextStartTime)
        for (let i = 1; i < sortedTimes.length; i++) {
          const t = sortedTimes[i]
          const ctxTime = contextStartTime + (t - clipAudibleStart)
          gain.gain.linearRampToValueAtTime(gainAt(t), ctxTime)
        }

        const initialPitch = sampleEnvelope(
          clip.pitchAutomation,
          clipAudibleStart - clip.startSec
        )
        source.detune.setValueAtTime(initialPitch * 100, contextStartTime)
        for (const p of clip.pitchAutomation ?? []) {
          const abs = clip.startSec + p.timeSec
          if (abs < clipAudibleStart || abs > clipAudibleEnd) continue
          const ctxTime = contextStartTime + (abs - clipAudibleStart)
          source.detune.linearRampToValueAtTime(p.value * 100, ctxTime)
        }

        source.start(contextStartTime, bufferOffset, remaining)

        this.scheduledSources.push(source)
        this.scheduledGains.push(gain)
      }
    }

    // RAF loop for playhead position updates
    const tick = () => {
      const elapsed = ctx.currentTime - this.startContextTime
      this.onPlayheadUpdate?.(this.startTimelineSec + elapsed)
      this.animFrameId = requestAnimationFrame(tick)
    }
    this.animFrameId = requestAnimationFrame(tick)
  }

  pause(): void {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId)
      this.animFrameId = null
    }
    for (const src of this.scheduledSources) {
      try { src.stop() } catch { /* already stopped */ }
    }
    this.scheduledSources = []
    this.scheduledGains = []
    this.ctx?.suspend()
  }

  stop(): void {
    this.pause()
  }

  /** Returns the current playhead position without a RAF loop (for one-shot reads) */
  getCurrentTimeSec(): number {
    if (!this.ctx) return 0
    return this.startTimelineSec + (this.ctx.currentTime - this.startContextTime)
  }

  get isPlaying(): boolean {
    return this.animFrameId !== null
  }
}

export const audioEngine = new AudioEngine()
