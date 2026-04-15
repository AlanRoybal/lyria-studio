import { useEffect, useRef, useState } from 'react'
import { liveAudioPlayer } from '@/audio/LiveAudioPlayer'
import { drawWaveform } from '@/audio/WaveformRenderer'

const UPDATE_INTERVAL_MS = 80 // ~12fps waveform refresh

interface LiveCaptureClipProps {
  captureStartSec: number
  scrollOffsetSec: number
  zoomLevel: number
  color: string
}

export function LiveCaptureClip({
  captureStartSec,
  scrollOffsetSec,
  zoomLevel,
  color,
}: LiveCaptureClipProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [durationSec, setDurationSec] = useState(0)
  const rafRef = useRef<number>(0)
  const lastUpdateRef = useRef(0)

  useEffect(() => {
    const tick = (timestamp: number) => {
      rafRef.current = requestAnimationFrame(tick)
      if (timestamp - lastUpdateRef.current < UPDATE_INTERVAL_MS) return
      lastUpdateRef.current = timestamp

      const duration = liveAudioPlayer.getLiveCaptureDurationSec()
      setDurationSec(duration)

      const canvas = canvasRef.current
      if (canvas && duration > 0) {
        const widthPx = Math.max(8, duration * zoomLevel)
        canvas.width = widthPx
        const waveform = liveAudioPlayer.getLiveCaptureWaveform(500)
        drawWaveform(canvas, waveform, color, { filled: true })
      }
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [zoomLevel, color])

  const leftPx = (captureStartSec - scrollOffsetSec) * zoomLevel
  const widthPx = Math.max(8, durationSec * zoomLevel)

  return (
    <div
      className="pointer-events-none absolute top-1 overflow-hidden rounded"
      style={{
        left: leftPx,
        width: widthPx,
        height: 'calc(100% - 8px)',
        backgroundColor: color + '1a',
        border: `1px solid ${color}55`,
      }}
    >
      {/* Waveform canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
        style={{ opacity: 0.65 }}
      />

      {/* REC label */}
      <div
        className="absolute left-1.5 top-0.5 flex items-center gap-1 text-[10px] font-medium"
        style={{ color }}
      >
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />
        REC
      </div>

      {/* Growing right edge indicator */}
      <div
        className="absolute right-0 top-0 h-full w-0.5 animate-pulse"
        style={{ backgroundColor: color + 'cc' }}
      />
    </div>
  )
}
