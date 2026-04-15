import type { Track } from '@/types/timeline'
import { sampleEnvelope } from './Automation'

const SAMPLE_RATE = 48000

function computeMixDuration(tracks: Track[]): number {
  let max = 0
  for (const t of tracks) {
    for (const c of t.clips) {
      max = Math.max(max, c.startSec + c.durationSec)
    }
  }
  return max
}

export async function renderMixdown(tracks: Track[]): Promise<AudioBuffer> {
  const durationSec = computeMixDuration(tracks)
  if (durationSec <= 0) throw new Error('No clips to export')

  const ctx = new OfflineAudioContext({
    numberOfChannels: 2,
    length: Math.ceil(durationSec * SAMPLE_RATE),
    sampleRate: SAMPLE_RATE,
  })

  const hasSolo = tracks.some((t) => t.soloed)

  for (const track of tracks) {
    if (track.muted) continue
    if (hasSolo && !track.soloed) continue

    for (const clip of track.clips) {
      if (!clip.audioBuffer) continue

      const source = ctx.createBufferSource()
      source.buffer = clip.audioBuffer
      const speed = clip.speed ?? 1
      source.playbackRate.value = speed

      const gain = ctx.createGain()
      source.connect(gain)
      gain.connect(ctx.destination)

      const clipStart = clip.startSec
      const clipEnd = clip.startSec + clip.durationSec
      const bufferOffset = clip.cropStartSec ?? 0

      const gainAt = (timelineSec: number) => {
        const trackEnv = sampleEnvelope(track.volumeAutomation, timelineSec)
        const clipEnv = sampleEnvelope(clip.volumeAutomation, timelineSec - clip.startSec)
        return track.volume * trackEnv * clipEnv
      }

      const breakpointTimes = new Set<number>([clipStart, clipEnd])
      for (const p of track.volumeAutomation ?? []) {
        if (p.timeSec > clipStart && p.timeSec < clipEnd) breakpointTimes.add(p.timeSec)
      }
      for (const p of clip.volumeAutomation ?? []) {
        const abs = clip.startSec + p.timeSec
        if (abs > clipStart && abs < clipEnd) breakpointTimes.add(abs)
      }
      const sortedTimes = [...breakpointTimes].sort((a, b) => a - b)

      gain.gain.setValueAtTime(gainAt(sortedTimes[0]), clipStart)
      for (let i = 1; i < sortedTimes.length; i++) {
        const t = sortedTimes[i]
        gain.gain.linearRampToValueAtTime(gainAt(t), t)
      }

      const initialPitch = sampleEnvelope(clip.pitchAutomation, 0)
      source.detune.setValueAtTime(initialPitch * 100, clipStart)
      for (const p of clip.pitchAutomation ?? []) {
        const abs = clip.startSec + p.timeSec
        if (abs < clipStart || abs > clipEnd) continue
        source.detune.linearRampToValueAtTime(p.value * 100, abs)
      }

      source.start(clipStart, bufferOffset, clip.durationSec * speed)
    }
  }

  return await ctx.startRendering()
}

function writeString(view: DataView, offset: number, str: string): void {
  for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i))
}

export function encodeWav(buffer: AudioBuffer): Blob {
  const numCh = buffer.numberOfChannels
  const numSamples = buffer.length
  const sampleRate = buffer.sampleRate
  const bytesPerSample = 2
  const blockAlign = numCh * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign
  const ab = new ArrayBuffer(44 + dataSize)
  const view = new DataView(ab)

  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataSize, true)
  writeString(view, 8, 'WAVE')
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, numCh, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, byteRate, true)
  view.setUint16(32, blockAlign, true)
  view.setUint16(34, 16, true)
  writeString(view, 36, 'data')
  view.setUint32(40, dataSize, true)

  const channels: Float32Array[] = []
  for (let i = 0; i < numCh; i++) channels.push(buffer.getChannelData(i))

  let offset = 44
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numCh; ch++) {
      const s = Math.max(-1, Math.min(1, channels[ch][i]))
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
      offset += 2
    }
  }

  return new Blob([ab], { type: 'audio/wav' })
}

export type RecorderFormat = { blob: Blob; extension: string; mimeType: string }

type MediaExportCandidate = { mime: string; ext: string; label: string }

const MEDIA_EXPORT_CANDIDATES: MediaExportCandidate[] = [
  { mime: 'audio/mp4;codecs=mp4a.40.2', ext: 'mp4', label: 'MP4 (AAC)' },
  { mime: 'audio/mp4', ext: 'mp4', label: 'MP4' },
  { mime: 'audio/webm;codecs=opus', ext: 'webm', label: 'WebM (Opus)' },
  { mime: 'audio/webm', ext: 'webm', label: 'WebM' },
]

export function getSupportedMediaExportFormat(): MediaExportCandidate | null {
  if (typeof MediaRecorder === 'undefined') return null
  return MEDIA_EXPORT_CANDIDATES.find((candidate) => MediaRecorder.isTypeSupported(candidate.mime)) ?? null
}

export async function recordMediaFromBuffer(
  buffer: AudioBuffer,
  onProgress?: (ratio: number) => void
): Promise<RecorderFormat> {
  const chosen = getSupportedMediaExportFormat()
  if (!chosen) throw new Error('No supported MediaRecorder audio format available')

  const ctx = new AudioContext({ sampleRate: buffer.sampleRate })
  const dest = ctx.createMediaStreamDestination()
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.connect(dest)

  const recorder = new MediaRecorder(dest.stream, { mimeType: chosen.mime })
  const chunks: Blob[] = []
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data)
  }

  return new Promise<RecorderFormat>((resolve, reject) => {
    recorder.onstop = () => {
      ctx.close().catch(() => {})
      resolve({
        blob: new Blob(chunks, { type: chosen.mime }),
        extension: chosen.ext,
        mimeType: chosen.mime,
      })
    }
    recorder.onerror = (e) => {
      ctx.close().catch(() => {})
      reject(e)
    }

    recorder.start(250)
    const startCtxTime = ctx.currentTime + 0.05
    src.start(startCtxTime)

    const tick = () => {
      const elapsed = ctx.currentTime - startCtxTime
      onProgress?.(Math.max(0, Math.min(1, elapsed / buffer.duration)))
      if (elapsed >= buffer.duration) {
        try { recorder.stop() } catch { /* noop */ }
      } else {
        requestAnimationFrame(tick)
      }
    }
    requestAnimationFrame(tick)
  })
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function saveBlob(
  blob: Blob,
  suggestedName: string,
  filters?: Array<{ name: string; extensions: string[] }>
): Promise<{ canceled: boolean; filePath?: string }> {
  const arrayBuffer = await blob.arrayBuffer()
  return window.store.saveFile(suggestedName, new Uint8Array(arrayBuffer), filters)
}
