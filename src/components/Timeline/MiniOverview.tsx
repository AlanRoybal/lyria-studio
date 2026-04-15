import { useEffect, useRef } from 'react'
import { useTimelineStore } from '@/store/timelineStore'

const TRACK_HEIGHT = 8
const TRACK_GAP = 2

export function MiniOverview() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const tracks = useTimelineStore((s) => s.tracks)
  const durationSec = useTimelineStore((s) => s.durationSec)
  const playheadSec = useTimelineStore((s) => s.playheadSec)
  const scrollOffsetSec = useTimelineStore((s) => s.scrollOffsetSec)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const setPlayhead = useTimelineStore((s) => s.setPlayhead)
  const setScrollOffset = useTimelineStore((s) => s.setScrollOffset)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = '#111113'
    ctx.fillRect(0, 0, width, height)

    const secToPx = (sec: number) => (sec / durationSec) * width

    // Draw clips per track
    tracks.forEach((track, trackIdx) => {
      const y = 4 + trackIdx * (TRACK_HEIGHT + TRACK_GAP)
      for (const clip of track.clips) {
        const x = secToPx(clip.startSec)
        const w = Math.max(2, secToPx(clip.durationSec))
        ctx.fillStyle = track.color + 'cc'
        ctx.fillRect(x, y, w, TRACK_HEIGHT)
      }
    })

    // Viewport indicator
    const viewportWidthSec = canvas.parentElement
      ? (canvas.parentElement.clientWidth - 200) / zoomLevel
      : 30
    const vpX = secToPx(scrollOffsetSec)
    const vpW = Math.max(4, secToPx(viewportWidthSec))
    ctx.fillStyle = 'rgba(255,255,255,0.08)'
    ctx.fillRect(vpX, 0, vpW, height)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'
    ctx.lineWidth = 1
    ctx.strokeRect(vpX, 0, vpW, height)

    // Playhead
    const phX = secToPx(playheadSec)
    ctx.strokeStyle = '#ef4444'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(phX, 0)
    ctx.lineTo(phX, height)
    ctx.stroke()
  }, [tracks, durationSec, playheadSec, scrollOffsetSec, zoomLevel])

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const clickedSec = (x / canvas.width) * durationSec
    setPlayhead(clickedSec)
    setScrollOffset(clickedSec - 5)
  }

  return (
    <div className="relative h-full w-full border-b border-studio-border bg-studio-panel">
      <canvas
        ref={canvasRef}
        width={2000}
        height={64}
        onClick={handleClick}
        className="h-full w-full cursor-pointer"
        style={{ imageRendering: 'crisp-edges' }}
      />
      <div className="pointer-events-none absolute left-2 top-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest text-zinc-300 backdrop-blur-sm">
        Overview
      </div>
    </div>
  )
}
