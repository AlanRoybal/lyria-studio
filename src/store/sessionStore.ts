import { create } from 'zustand'
import type { ConnectionStatus } from '@/types/lyria'

interface SessionState {
  apiKey: string
  connectionStatus: ConnectionStatus
  errorMessage: string | null
  recordingDurationSec: number
  liveWaveformSamples: number[]
  isCapturing: boolean
  captureStartSec: number

  setApiKey(key: string): void
  setConnectionStatus(status: ConnectionStatus, error?: string): void
  appendLiveWaveform(samples: number[]): void
  resetLiveWaveform(): void
  setRecordingDuration(sec: number): void
  setIsCapturing(v: boolean): void
  setCaptureStartSec(sec: number): void
}

export const useSessionStore = create<SessionState>((set) => ({
  apiKey: '',
  connectionStatus: 'disconnected',
  errorMessage: null,
  recordingDurationSec: 0,
  liveWaveformSamples: [],
  isCapturing: false,
  captureStartSec: 0,

  setApiKey: (key) => set({ apiKey: key }),

  setConnectionStatus: (status, error) =>
    set({ connectionStatus: status, errorMessage: error ?? null }),

  appendLiveWaveform: (samples) =>
    set((s) => ({
      liveWaveformSamples: [...s.liveWaveformSamples, ...samples].slice(-3000),
    })),

  resetLiveWaveform: () => set({ liveWaveformSamples: [] }),

  setRecordingDuration: (sec) => set({ recordingDurationSec: sec }),

  setIsCapturing: (v) => set({ isCapturing: v }),

  setCaptureStartSec: (sec) => set({ captureStartSec: sec }),
}))
