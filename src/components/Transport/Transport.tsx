import { useEffect, useRef, useCallback } from 'react'
import {
  Play,
  Pause,
  Square,
  SkipBack,
  Scissors,
  Circle,
  Activity,
  Shuffle,
} from 'lucide-react'
import { useTimelineStore } from '@/store/timelineStore'
import { useSessionStore } from '@/store/sessionStore'
import { audioEngine } from '@/audio/AudioEngine'
import { drawWaveform } from '@/audio/WaveformRenderer'
import { Tooltip } from '@/components/ui/Tooltip'
import { ExportButton } from '@/components/Export/ExportButton'

interface TransportProps {
  onStartLive: () => void
  onStopLive: () => void
  onCaptureInstrumentals: () => void
  onCaptureVocals: () => void
}

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = Math.floor(sec % 60)
  const frames = Math.floor((sec % 1) * 30)
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}:${String(frames).padStart(2, '0')}`
}

export function Transport({
  onStartLive,
  onStopLive,
  onCaptureInstrumentals,
  onCaptureVocals,
}: TransportProps) {
  const {
    playheadSec,
    isPlaying,
    isRecording,
    tracks,
    bpm,
    activeTrackId,
    selectedClipId,
    automationMode,
    setIsPlaying,
    setPlayhead,
    setBpm,
    splitClipAtPlayhead,
    toggleClipReverse,
    setAutomationMode,
  } = useTimelineStore()

  const selectedClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === selectedClipId)
  const canSplit = (() => {
    const track = tracks.find((t) => t.id === activeTrackId)
    if (!track) return false
    return track.clips.some(
      (c) => playheadSec > c.startSec && playheadSec < c.startSec + c.durationSec
    )
  })()
  const { liveWaveformSamples, connectionStatus, isCapturing } = useSessionStore()
  const liveCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = liveCanvasRef.current
    if (!canvas || !isRecording || liveWaveformSamples.length === 0) return
    drawWaveform(canvas, liveWaveformSamples, isCapturing ? '#ef4444' : '#a78bfa')
  }, [liveWaveformSamples, isRecording, isCapturing])

  const handlePlay = useCallback(() => {
    if (isPlaying) {
      audioEngine.pause()
      setIsPlaying(false)
    } else {
      audioEngine.play(tracks, playheadSec, (sec) => {
        useTimelineStore.getState().setPlayhead(sec)
      })
      setIsPlaying(true)
    }
  }, [isPlaying, tracks, playheadSec, setIsPlaying])

  const handleStop = useCallback(() => {
    audioEngine.stop()
    setIsPlaying(false)
    setPlayhead(0)
  }, [setIsPlaying, setPlayhead])

  const handleSkipBack = useCallback(() => {
    const wasPlaying = isPlaying
    audioEngine.stop()
    setPlayhead(0)
    if (wasPlaying) {
      setTimeout(() => {
        audioEngine.play(tracks, 0, (sec) => {
          useTimelineStore.getState().setPlayhead(sec)
        })
        setIsPlaying(true)
      }, 50)
    }
  }, [isPlaying, tracks, setPlayhead, setIsPlaying])

  const handleLive = useCallback(() => {
    if (isRecording) onStopLive()
    else onStartLive()
  }, [isRecording, onStartLive, onStopLive])

  const isConnecting = connectionStatus === 'connecting'

  return (
    <div className="flex items-center gap-3 border-b border-t border-studio-border bg-studio-panel px-4">
      {/* Transport buttons */}
      <div className="flex items-center gap-1" data-tour-id="transport-playback">
        <Tooltip text="Skip to start">
          <button
            onClick={handleSkipBack}
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <SkipBack size={16} />
          </button>
        </Tooltip>

        <Tooltip text={isPlaying ? 'Pause (Space)' : 'Play (Space)'}>
          <button
            onClick={handlePlay}
            disabled={isRecording}
            className={`flex h-8 w-8 items-center justify-center rounded text-sm font-bold transition-colors ${
              isPlaying
                ? 'bg-emerald-700 text-white'
                : 'text-zinc-300 hover:bg-zinc-800 hover:text-white'
            } disabled:opacity-40`}
          >
            {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} fill="currentColor" />}
          </button>
        </Tooltip>

        <Tooltip text="Stop (Esc)">
          <button
            onClick={handleStop}
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white"
          >
            <Square size={14} fill="currentColor" />
          </button>
        </Tooltip>

        <Tooltip text="Split clip at playhead (S)">
          <button
            onClick={() => splitClipAtPlayhead()}
            disabled={!canSplit}
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          >
            <Scissors size={14} />
          </button>
        </Tooltip>

        <Tooltip text={selectedClip ? 'Reverse selected clip' : 'Select a clip to reverse it'}>
          <button
            onClick={() => selectedClip && toggleClipReverse(selectedClip.id)}
            disabled={!selectedClip}
            aria-label="Reverse selected clip"
            className="flex h-8 w-8 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
          >
            <Shuffle size={14} />
          </button>
        </Tooltip>

        <Tooltip text={automationMode ? 'Exit automation mode' : 'Edit volume and clip pitch automation (click to add points, right-click to remove)'}>
          <button
            onClick={() => setAutomationMode(!automationMode)}
            className={`flex h-8 items-center gap-1 rounded px-2 text-xs font-semibold transition-colors ${
              automationMode
                ? 'bg-amber-500 text-black'
                : 'text-zinc-400 hover:bg-zinc-800 hover:text-white'
            }`}
          >
            <Activity size={12} />
            AUTO
          </button>
        </Tooltip>
      </div>

      <div className="flex items-center gap-1">
        <Tooltip text={isRecording ? 'Stop live session (R)' : 'Start live music stream (R)'}>
          <button
            onClick={handleLive}
            disabled={isConnecting || isPlaying}
            data-tour-id="transport-live"
            className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-all ${
              isRecording
                ? 'bg-violet-600 text-white shadow-lg shadow-violet-500/30'
                : isConnecting
                ? 'cursor-not-allowed bg-zinc-800 text-zinc-400'
                : 'text-violet-400 hover:bg-zinc-800 hover:text-violet-300'
            } disabled:opacity-40`}
          >
            <span className={`h-2 w-2 rounded-full ${isRecording ? 'bg-white animate-pulse' : 'bg-violet-400'}`} />
            {isConnecting ? 'CONNECTING…' : isRecording ? 'LIVE' : 'GO LIVE'}
          </button>
        </Tooltip>

        <ExportButton />

        {/* Capture buttons — only visible while live */}
        {isRecording && (
          <>
            <Tooltip
              text={
                isCapturing
                  ? 'Stop instrumentals capture → save clip to timeline'
                  : 'Start capturing the realtime instrumentals stream'
              }
            >
              <button
                onClick={onCaptureInstrumentals}
                className={`flex h-8 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition-all ${
                  isCapturing
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/30'
                    : 'border border-emerald-800 text-emerald-400 hover:bg-emerald-950/50 hover:text-emerald-300'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    isCapturing ? 'bg-white animate-pulse' : 'bg-emerald-500'
                  }`}
                />
                {isCapturing ? (
                  'CAPTURING INSTR…'
                ) : (
                  <>
                    <Circle size={10} fill="currentColor" /> INSTR
                  </>
                )}
              </button>
            </Tooltip>

            <Tooltip text="Save the latest generated vocals clip to the timeline">
              <button
                onClick={onCaptureVocals}
                className="flex h-8 items-center gap-1.5 rounded border border-rose-800 px-2.5 text-xs font-semibold text-rose-400 transition-all hover:bg-rose-950/50 hover:text-rose-300"
              >
                <span className="h-2 w-2 rounded-full bg-rose-500" />
                <Circle size={10} fill="currentColor" /> VOCALS
              </button>
            </Tooltip>
          </>
        )}
      </div>

      <div className="h-5 w-px bg-studio-border" />

      {/* Time display */}
      <div className="font-mono text-sm text-zinc-200">{formatTime(playheadSec)}</div>

      <div className="h-5 w-px bg-studio-border" />

      {/* BPM */}
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">BPM</span>
        <input
          type="number"
          value={bpm}
          onChange={(e) => setBpm(parseInt(e.target.value) || 120)}
          min={20}
          max={300}
          className="h-7 w-14 rounded border border-studio-border bg-studio-card px-2 text-center text-xs font-mono text-zinc-200 outline-none focus:border-violet-500"
        />
      </div>

      <div className="h-5 w-px bg-studio-border" />

      {/* Live waveform / status */}
      <div className="flex flex-1 items-center gap-2">
        {isRecording ? (
          <>
            <canvas ref={liveCanvasRef} width={240} height={32} className="rounded bg-zinc-900" />
            <span className={`text-[10px] font-semibold ${isCapturing ? 'text-red-400' : 'text-violet-400'}`}>
              {isCapturing ? 'capturing' : 'streaming'}
            </span>
          </>
        ) : (
          <div className="flex items-center gap-1 text-[10px] text-zinc-600">
            {isPlaying ? (
              <>
                <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
                <span className="text-emerald-600">Playing</span>
              </>
            ) : connectionStatus === 'error' ? (
              <span className="text-red-500">
                {useSessionStore.getState().errorMessage ?? 'Error'}
              </span>
            ) : (
              <span>Ready</span>
            )}
          </div>
          )}
      </div>

    </div>
  )
}
