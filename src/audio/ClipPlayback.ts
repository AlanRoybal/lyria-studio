import type { Clip, AutomationPoint } from '@/types/timeline'
import { sampleEnvelope, sortPoints } from './Automation'

const reversedBufferCache = new WeakMap<AudioBuffer, WeakMap<object, AudioBuffer>>()
const pitchedBufferCache = new WeakMap<object, Map<string, AudioBuffer>>()

export function getClipSourceDurationSec(clip: Clip): number {
  return clip.durationSec * (clip.speed ?? 1)
}

export function getClipTotalBufferSec(clip: Clip): number {
  return clip.audioBuffer?.duration ?? (clip.cropStartSec + getClipSourceDurationSec(clip))
}

export function mirrorClipCropStartSec(clip: Clip): number {
  return Math.max(0, getClipTotalBufferSec(clip) - getClipSourceDurationSec(clip) - clip.cropStartSec)
}

export function reverseAutomationPoints(
  points: AutomationPoint[] | undefined,
  durationSec: number
): AutomationPoint[] | undefined {
  if (!points?.length) return undefined

  return sortPoints(
    points.map((point) => ({
      ...point,
      timeSec: Math.max(0, Math.min(durationSec, durationSec - point.timeSec)),
    }))
  )
}

export function getClipPlaybackBuffer(
  clip: Clip,
  audioContext: AudioContext | OfflineAudioContext
): AudioBuffer | null {
  const buffer = clip.audioBuffer
  if (!buffer) return null
  if (!clip.isReversed) return buffer

  let perContext = reversedBufferCache.get(buffer)
  if (!perContext) {
    perContext = new WeakMap<object, AudioBuffer>()
    reversedBufferCache.set(buffer, perContext)
  }

  const cached = perContext.get(audioContext)
  if (cached) return cached

  const reversed = audioContext.createBuffer(
    buffer.numberOfChannels,
    buffer.length,
    buffer.sampleRate
  )

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const source = buffer.getChannelData(channel)
    const target = reversed.getChannelData(channel)
    for (let i = 0, j = source.length - 1; i < source.length; i++, j--) {
      target[i] = source[j]
    }
  }

  perContext.set(audioContext, reversed)
  return reversed
}

function linearSample(data: Float32Array, index: number): number {
  if (index <= 0) return data[0] ?? 0
  if (index >= data.length - 1) return data[data.length - 1] ?? 0
  const lo = Math.floor(index)
  const hi = lo + 1
  const frac = index - lo
  return data[lo] * (1 - frac) + data[hi] * frac
}

function hasAutomation(points?: AutomationPoint[]): boolean {
  return !!points?.some((point) => Math.abs(point.value) > 0.0001)
}

function buildPitchCacheKey(
  clip: Clip,
  trackPitchAutomation: AutomationPoint[] | undefined,
  sampleRate: number
): string {
  return JSON.stringify({
    sampleRate,
    cropStartSec: clip.cropStartSec,
    durationSec: clip.durationSec,
    speed: clip.speed ?? 1,
    isReversed: clip.isReversed ?? false,
    clipPitchAutomation: clip.pitchAutomation ?? [],
    trackPitchAutomation: trackPitchAutomation ?? [],
    clipStartSec: clip.startSec,
  })
}

export function getPitchProcessedPlaybackBuffer(
  clip: Clip,
  trackPitchAutomation: AutomationPoint[] | undefined,
  audioContext: AudioContext | OfflineAudioContext
): AudioBuffer | null {
  const hasPitch = hasAutomation(clip.pitchAutomation) || hasAutomation(trackPitchAutomation)
  if (!hasPitch) return null

  const playbackBuffer = getClipPlaybackBuffer(clip, audioContext)
  if (!playbackBuffer) return null

  let perContext = pitchedBufferCache.get(playbackBuffer)
  if (!perContext) {
    perContext = new Map<string, AudioBuffer>()
    pitchedBufferCache.set(playbackBuffer, perContext)
  }

  const cacheKey = buildPitchCacheKey(clip, trackPitchAutomation, audioContext.sampleRate)
  const cached = perContext.get(cacheKey)
  if (cached) return cached

  const sourceRate = playbackBuffer.sampleRate
  const targetRate = audioContext.sampleRate
  const outputLength = Math.max(1, Math.round(clip.durationSec * targetRate))
  const output = audioContext.createBuffer(
    playbackBuffer.numberOfChannels,
    outputLength,
    targetRate
  )

  const speed = clip.speed ?? 1
  const grainSize = 2048
  const hopSize = Math.max(256, Math.floor(grainSize / 4))
  const window = new Float32Array(grainSize)
  for (let i = 0; i < grainSize; i++) {
    window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (grainSize - 1))
  }

  for (let channel = 0; channel < playbackBuffer.numberOfChannels; channel++) {
    const source = playbackBuffer.getChannelData(channel)
    const target = output.getChannelData(channel)
    const weights = new Float32Array(outputLength)

    for (let outPos = 0; outPos < outputLength; outPos += hopSize) {
      const centerTimeSec = Math.min(
        clip.durationSec,
        (outPos + grainSize / 2) / targetRate
      )
      const semitones =
        sampleEnvelope(trackPitchAutomation, clip.startSec + centerTimeSec, 0) +
        sampleEnvelope(clip.pitchAutomation, centerTimeSec, 0)
      const pitchRatio = Math.pow(2, semitones / 12)
      const centerSourceSec = clip.cropStartSec + centerTimeSec * speed
      const centerSourceIndex = centerSourceSec * sourceRate

      for (let i = 0; i < grainSize; i++) {
        const outIndex = outPos + i
        if (outIndex >= outputLength) break

        const offsetSamples = i - grainSize / 2
        const sourceIndex =
          centerSourceIndex + (offsetSamples * sourceRate * speed * pitchRatio) / targetRate
        const sample = linearSample(source, sourceIndex)
        const weight = window[i]
        target[outIndex] += sample * weight
        weights[outIndex] += weight
      }
    }

    for (let i = 0; i < outputLength; i++) {
      if (weights[i] > 0.00001) target[i] /= weights[i]
    }
  }

  perContext.set(cacheKey, output)
  return output
}
