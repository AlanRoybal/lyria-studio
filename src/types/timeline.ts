export interface AutomationPoint {
  timeSec: number   // clip-envelope: relative to clip start; track-envelope: absolute timeline time
  value: number
}

export interface Clip {
  id: string
  trackId: string
  startSec: number
  durationSec: number
  cropStartSec: number  // offset into the audio buffer where playback begins
  audioBuffer: AudioBuffer | null
  waveformCache: Float32Array | null
  label: string
  color: string
  speed?: number
  volumeAutomation?: AutomationPoint[]
  pitchAutomation?: AutomationPoint[]
}

export interface Track {
  id: string
  name: string
  color: string
  muted: boolean
  soloed: boolean
  volume: number
  clips: Clip[]
  volumeAutomation?: AutomationPoint[]
}

export const TRACK_COLORS = [
  '#22c55e', // green
  '#3b82f6', // blue
  '#f59e0b', // amber
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#10b981', // emerald
] as const
