import { useCallback, useRef, useEffect } from 'react'
import { useTimelineStore } from '@/store/timelineStore'
import { audioEngine } from '@/audio/AudioEngine'
import { TrackHeader } from './TrackHeader'
import { TrackLane } from './TrackLane'
import { TimeRuler } from './TimeRuler'
import { Playhead } from './Playhead'

const HEADER_WIDTH = 200
const SCROLL_MARGIN = 0.15 // scroll when playhead is within 15% of right edge

export function Timeline() {
  const tracks = useTimelineStore((s) => s.tracks)
  const playheadSec = useTimelineStore((s) => s.playheadSec)
  const isPlaying = useTimelineStore((s) => s.isPlaying)
  const scrollOffsetSec = useTimelineStore((s) => s.scrollOffsetSec)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const durationSec = useTimelineStore((s) => s.durationSec)
  const activeTrackId = useTimelineStore((s) => s.activeTrackId)
  const { addTrack, setZoom, setScrollOffset } = useTimelineStore()

  const totalWidthPx = durationSec * zoomLevel
  const playheadPx = (playheadSec - scrollOffsetSec) * zoomLevel

  const lanesRef = useRef<HTMLDivElement>(null)
  const allTrackIds = tracks.map((t) => t.id)

  // ── Auto-scroll to keep playhead visible during playback ──────────────────
  useEffect(() => {
    if (!isPlaying) return
    const lanes = lanesRef.current
    if (!lanes) return

    const visibleWidthSec = lanes.clientWidth / zoomLevel
    const rightThreshold = scrollOffsetSec + visibleWidthSec * (1 - SCROLL_MARGIN)

    if (playheadSec > rightThreshold) {
      // Jump so playhead lands at the left quarter of the view
      setScrollOffset(playheadSec - visibleWidthSec * 0.25)
    }
  }, [playheadSec, isPlaying, scrollOffsetSec, zoomLevel, setScrollOffset])

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault()
      if (e.ctrlKey || e.metaKey) {
        const laneX = e.clientX - HEADER_WIDTH
        const cursorSec = scrollOffsetSec + laneX / zoomLevel
        const factor = e.deltaY > 0 ? 0.85 : 1.18
        const newZoom = Math.max(20, Math.min(500, zoomLevel * factor))
        const newScroll = Math.max(0, cursorSec - laneX / newZoom)
        setZoom(newZoom)
        setScrollOffset(newScroll)
      } else {
        const delta = e.deltaX !== 0 ? e.deltaX : e.deltaY
        setScrollOffset(scrollOffsetSec + delta / zoomLevel)
      }
    },
    [scrollOffsetSec, zoomLevel, setZoom, setScrollOffset]
  )

  const totalTracksHeight = tracks.length * 80 + 28

  const handlePlayheadMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      const lanes = lanesRef.current
      if (!lanes) return

      const wasPlaying = useTimelineStore.getState().isPlaying
      if (wasPlaying) audioEngine.pause()

      const rect = lanes.getBoundingClientRect()
      const { setPlayhead, setScrollOffset } = useTimelineStore.getState()

      const onMove = (ev: MouseEvent) => {
        const s = useTimelineStore.getState()
        const x = ev.clientX - rect.left
        // Allow scrubbing past the visible edge by nudging the scroll
        if (x < 0) setScrollOffset(s.scrollOffsetSec + x / s.zoomLevel)
        else if (x > rect.width)
          setScrollOffset(s.scrollOffsetSec + (x - rect.width) / s.zoomLevel)
        const sec = Math.max(0, s.scrollOffsetSec + x / s.zoomLevel)
        setPlayhead(sec)
      }

      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
        if (wasPlaying) {
          const { tracks: currentTracks, playheadSec: resumeSec } =
            useTimelineStore.getState()
          audioEngine.play(currentTracks, resumeSec, (sec) => {
            useTimelineStore.getState().setPlayhead(sec)
          }, () => {
            useTimelineStore.getState().setIsPlaying(false)
          })
        }
      }

      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    []
  )

  return (
    <div className="flex h-full flex-col border-t border-studio-border bg-studio-bg" data-tour-id="timeline">
      <div className="flex h-full overflow-hidden" onWheel={handleWheel}>
        {/* Left: track headers */}
        <div className="z-10 flex-shrink-0 overflow-hidden" style={{ width: HEADER_WIDTH }}>
          <div className="h-7 border-b border-studio-border bg-studio-panel" />
          {tracks.map((track) => (
            <TrackHeader key={track.id} track={track} isActive={track.id === activeTrackId} />
          ))}
          <button
            onClick={addTrack}
            className="flex h-10 w-full items-center justify-center gap-1 border-b border-studio-border bg-studio-panel text-xs text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
          >
            <span className="text-base leading-none">+</span> Add Track
          </button>
        </div>

        {/* Right: scrollable lanes */}
        <div className="relative flex-1 overflow-hidden" ref={lanesRef}>
          <TimeRuler totalWidthPx={totalWidthPx} />

          <div className="relative" style={{ width: totalWidthPx }}>
            {tracks.map((track, idx) => (
              <TrackLane
                key={track.id}
                track={track}
                totalWidthPx={totalWidthPx}
                trackIndex={idx}
                allTrackIds={allTrackIds}
              />
            ))}
          </div>

          <div className="pointer-events-none absolute inset-0" style={{ top: 0 }}>
            <Playhead
              positionPx={playheadPx}
              height={totalTracksHeight}
              onMouseDown={handlePlayheadMouseDown}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
