import { useEffect, useRef, useCallback, useState } from 'react'
import { Gauge } from 'lucide-react'
import { createPortal } from 'react-dom'
import type { Clip as ClipType } from '@/types/timeline'
import { useTimelineStore } from '@/store/timelineStore'
import { drawWaveform } from '@/audio/WaveformRenderer'
import { EnvelopeEditor } from './EnvelopeEditor'

const TRACK_HEIGHT_PX = 80 // must match TrackLane h-20

interface ClipProps {
  clip: ClipType
  zoomLevel: number
  scrollOffsetSec: number
  trackIndex: number
  allTrackIds: string[]
}

export function Clip({ clip, zoomLevel, scrollOffsetSec, trackIndex, allTrackIds }: ClipProps) {
  const clipRef = useRef<HTMLDivElement>(null)
  const speedButtonRef = useRef<HTMLButtonElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const {
    duplicateClip,
    moveClip,
    removeClip,
    updateClip,
    setClipAutomation,
    setClipPitchAutomation,
  } = useTimelineStore()
  const automationMode = useTimelineStore((s) => s.automationMode)
  const [automationLane, setAutomationLane] = useState<'volume' | 'pitch'>('volume')
  const [isSpeedOpen, setIsSpeedOpen] = useState(false)
  const [speedPanelPosition, setSpeedPanelPosition] = useState<{ top: number; left: number } | null>(null)
  const playbackSpeed = clip.speed ?? 1

  const leftPx = (clip.startSec - scrollOffsetSec) * zoomLevel
  const widthPx = Math.max(8, clip.durationSec * zoomLevel)

  // Total audio buffer duration — needed to compute crop fractions for waveform
  const sourceDurationSec = clip.durationSec * playbackSpeed
  const totalBufferSec = clip.audioBuffer?.duration ?? (clip.cropStartSec + sourceDurationSec)
  const cropStartFraction = totalBufferSec > 0 ? clip.cropStartSec / totalBufferSec : 0
  const cropEndFraction = totalBufferSec > 0 ? (clip.cropStartSec + sourceDurationSec) / totalBufferSec : 1

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !clip.waveformCache) return
    canvas.width = Math.max(8, widthPx)
    drawWaveform(canvas, clip.waveformCache, clip.color, {
      filled: true,
      cropStartFraction,
      cropEndFraction,
    })
  }, [clip.waveformCache, clip.color, widthPx, cropStartFraction, cropEndFraction])

  useEffect(() => {
    if (!isSpeedOpen) return

    const updateSpeedPanelPosition = () => {
      const rect = speedButtonRef.current?.getBoundingClientRect()
      if (!rect) return
      setSpeedPanelPosition({
        top: rect.bottom + 6,
        left: rect.right - 160,
      })
    }

    updateSpeedPanelPosition()

    const handlePointerDown = (event: MouseEvent) => {
      if (!clipRef.current?.contains(event.target as Node)) {
        setIsSpeedOpen(false)
      }
    }

    window.addEventListener('resize', updateSpeedPanelPosition)
    window.addEventListener('scroll', updateSpeedPanelPosition, true)
    document.addEventListener('mousedown', handlePointerDown)
    return () => {
      window.removeEventListener('resize', updateSpeedPanelPosition)
      window.removeEventListener('scroll', updateSpeedPanelPosition, true)
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [isSpeedOpen])

  // ── Drag to move (horizontal + cross-track vertical) ──────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).dataset.resize) return // let resize handle it
      e.stopPropagation()

      const shouldDuplicate = e.altKey
      const startX = e.clientX
      const startY = e.clientY
      const startSec = clip.startSec
      const el = e.currentTarget as HTMLElement

      const onMove = (ev: MouseEvent) => {
        const deltaSec = (ev.clientX - startX) / zoomLevel
        const newStart = Math.max(0, startSec + deltaSec)
        // Visual feedback
        const yDelta = ev.clientY - startY
        const trackShift = Math.round(yDelta / TRACK_HEIGHT_PX)
        const targetIdx = Math.max(0, Math.min(allTrackIds.length - 1, trackIndex + trackShift))
        el.style.left = `${(newStart - scrollOffsetSec) * zoomLevel}px`
        el.style.top = `${4 + (targetIdx - trackIndex) * TRACK_HEIGHT_PX}px`
      }

      const onUp = (ev: MouseEvent) => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        el.style.left = ''
        el.style.top = ''

        const deltaSec = (ev.clientX - startX) / zoomLevel
        const newStart = Math.max(0, startSec + deltaSec)
        const yDelta = ev.clientY - startY
        const trackShift = Math.round(yDelta / TRACK_HEIGHT_PX)
        const targetIdx = Math.max(0, Math.min(allTrackIds.length - 1, trackIndex + trackShift))
        if (shouldDuplicate) {
          duplicateClip(clip.id, allTrackIds[targetIdx], newStart)
        } else {
          moveClip(clip.id, allTrackIds[targetIdx], newStart)
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [clip.id, clip.startSec, zoomLevel, scrollOffsetSec, duplicateClip, moveClip, trackIndex, allTrackIds]
  )

  // ── Left-edge crop resize ──────────────────────────────────────────────────
  const handleLeftResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const startX = e.clientX
      const startStartSec = clip.startSec
      const startCropSec = clip.cropStartSec
      const startDuration = clip.durationSec
      const maxCropSec = totalBufferSec - 0.1 * playbackSpeed

      const onMove = (ev: MouseEvent) => {
        const deltaSec = (ev.clientX - startX) / zoomLevel
        const newCrop = Math.max(0, Math.min(maxCropSec, startCropSec + deltaSec * playbackSpeed))
        const actualDelta = (newCrop - startCropSec) / playbackSpeed
        updateClip(clip.id, {
          startSec: Math.max(0, startStartSec + actualDelta),
          cropStartSec: newCrop,
          durationSec: Math.max(0.1, startDuration - actualDelta),
        })
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [clip.id, clip.startSec, clip.cropStartSec, clip.durationSec, totalBufferSec, zoomLevel, updateClip, playbackSpeed]
  )

  // ── Right-edge crop resize ─────────────────────────────────────────────────
  const handleRightResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      const startX = e.clientX
      const startDuration = clip.durationSec
      const maxDuration = (totalBufferSec - clip.cropStartSec) / playbackSpeed

      const onMove = (ev: MouseEvent) => {
        const deltaSec = (ev.clientX - startX) / zoomLevel
        updateClip(clip.id, {
          durationSec: Math.max(0.1, Math.min(maxDuration, startDuration + deltaSec)),
        })
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [clip.id, clip.durationSec, clip.cropStartSec, totalBufferSec, zoomLevel, updateClip, playbackSpeed]
  )

  const handleSpeedChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      e.stopPropagation()
      const nextSpeed = Math.max(0.5, Math.min(2, parseFloat(e.target.value) || 1))
      const currentSourceDuration = clip.durationSec * playbackSpeed
      updateClip(clip.id, {
        speed: nextSpeed,
        durationSec: Math.max(0.1, currentSourceDuration / nextSpeed),
      })
    },
    [clip.id, clip.durationSec, playbackSpeed, updateClip]
  )

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      removeClip(clip.id)
    },
    [clip.id, removeClip]
  )

  return (
    <div
      ref={clipRef}
      className="group absolute top-1 cursor-grab select-none overflow-visible rounded active:cursor-grabbing"
      style={{
        left: leftPx,
        width: widthPx,
        height: 'calc(100% - 8px)',
        backgroundColor: clip.color + '33',
        border: `1px solid ${clip.color}66`,
      }}
      onMouseDown={handleMouseDown}
      onContextMenu={handleContextMenu}
    >
      {/* Waveform */}
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full"
        style={{ opacity: 0.7 }}
      />

      {/* Label */}
      <div
        className="pointer-events-none absolute left-1.5 top-0.5 truncate text-[10px] font-medium"
        style={{ color: clip.color, maxWidth: widthPx - 46 }}
      >
        {clip.label}
      </div>

      <button
        ref={speedButtonRef}
        type="button"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation()
          setIsSpeedOpen((open) => !open)
        }}
        className="absolute right-1 top-1 z-10 hidden h-5 items-center gap-1 rounded bg-black/55 px-1.5 text-[9px] font-semibold text-zinc-200 group-hover:inline-flex"
      >
        <Gauge size={10} />
        <span>{playbackSpeed.toFixed(2).replace(/\.00$/, '')}x</span>
      </button>

      {isSpeedOpen && speedPanelPosition && createPortal(
        <div
          className="fixed z-50 w-40 rounded-md border border-zinc-700 bg-zinc-950/95 p-2 shadow-lg backdrop-blur"
          style={speedPanelPosition}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="mb-1 flex items-center justify-between gap-2 text-[9px] uppercase tracking-wider text-zinc-300">
            <span>Clip Speed</span>
            <span>{playbackSpeed.toFixed(2).replace(/\.00$/, '')}x</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={2}
            step={0.01}
            value={playbackSpeed}
            onChange={handleSpeedChange}
            className="h-1.5 w-full cursor-pointer"
            style={{ accentColor: clip.color }}
          />
          <div className="mt-1 flex justify-between text-[9px] text-zinc-500">
            <span>0.5x</span>
            <span>2x</span>
          </div>
        </div>,
        document.body
      )}

      {/* Right-click hint on hover */}
      <div className="pointer-events-none absolute inset-0 hidden items-center justify-center group-hover:flex">
        <div className="rounded bg-black/40 px-1 py-0.5 text-[9px] text-white/60">
          option-drag to duplicate, right-click to delete
        </div>
      </div>

      {/* Resize handle — left edge */}
      <div
        data-resize="true"
        className="absolute left-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: clip.color + '99' }}
        onMouseDown={handleLeftResizeMouseDown}
      />

      {/* Resize handle — right edge */}
      <div
        data-resize="true"
        className="absolute right-0 top-0 h-full w-2 cursor-ew-resize opacity-0 transition-opacity group-hover:opacity-100"
        style={{ backgroundColor: clip.color + '99' }}
        onMouseDown={handleRightResizeMouseDown}
      />

      {automationMode && (
        <div className="absolute bottom-1 left-1 z-10 flex gap-1">
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setAutomationLane('volume')
            }}
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              automationLane === 'volume'
                ? 'bg-amber-300 text-black'
                : 'bg-black/40 text-zinc-300 hover:bg-black/60'
            }`}
          >
            Vol
          </button>
          <button
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation()
              setAutomationLane('pitch')
            }}
            className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider ${
              automationLane === 'pitch'
                ? 'bg-sky-300 text-black'
                : 'bg-black/40 text-zinc-300 hover:bg-black/60'
            }`}
          >
            Pitch
          </button>
        </div>
      )}

      <EnvelopeEditor
        points={automationLane === 'pitch' ? clip.pitchAutomation : clip.volumeAutomation}
        onChange={(pts) =>
          automationLane === 'pitch'
            ? setClipPitchAutomation(clip.id, pts)
            : setClipAutomation(clip.id, pts)
        }
        width={widthPx}
        height={Math.max(8, TRACK_HEIGHT_PX - 16)}
        color={automationLane === 'pitch' ? '#7dd3fc' : '#fef3c7'}
        interactive={automationMode}
        timeToX={(t) => t * zoomLevel}
        xToTime={(x) => x / zoomLevel}
        timeMin={0}
        timeMax={clip.durationSec}
        valueMin={automationLane === 'pitch' ? -12 : 0}
        valueMax={automationLane === 'pitch' ? 12 : 1}
      />
    </div>
  )
}
