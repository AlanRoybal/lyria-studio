import type { Clip, AutomationPoint } from '@/types/timeline'
import { sortPoints } from './Automation'

const reversedBufferCache = new WeakMap<AudioBuffer, WeakMap<object, AudioBuffer>>()

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
