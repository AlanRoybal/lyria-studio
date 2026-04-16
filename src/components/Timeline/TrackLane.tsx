import { useCallback } from 'react'
import type { Track } from '@/types/timeline'
import { useTimelineStore } from '@/store/timelineStore'
import { useSessionStore } from '@/store/sessionStore'
import { Clip } from './Clip'
import { LiveCaptureClip } from './LiveCaptureClip'
import { EnvelopeEditor } from './EnvelopeEditor'

interface TrackLaneProps {
  track: Track
  totalWidthPx: number
  trackIndex: number
  allTrackIds: string[]
}

export function TrackLane({ track, totalWidthPx, trackIndex, allTrackIds }: TrackLaneProps) {
  const scrollOffsetSec = useTimelineStore((s) => s.scrollOffsetSec)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const durationSec = useTimelineStore((s) => s.durationSec)
  const automationMode = useTimelineStore((s) => s.automationMode)
  const setTrackAutomation = useTimelineStore((s) => s.setTrackAutomation)
  const activeTrackId = useTimelineStore((s) => s.activeTrackId)
  const setActiveTrack = useTimelineStore((s) => s.setActiveTrack)
  const setSelectedClip = useTimelineStore((s) => s.setSelectedClip)
  const setPlayhead = useTimelineStore((s) => s.setPlayhead)
  const isCapturing = useSessionStore((s) => s.isCapturing)
  const captureStartSec = useSessionStore((s) => s.captureStartSec)

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      setActiveTrack(track.id)
      // Only seek if clicking the lane background, not a clip
      if ((e.target as HTMLElement).closest('.group')) return
      setSelectedClip(null)
      const rect = e.currentTarget.getBoundingClientRect()
      const x = e.clientX - rect.left
      const sec = scrollOffsetSec + x / zoomLevel
      setPlayhead(sec)
    },
    [track.id, scrollOffsetSec, zoomLevel, setActiveTrack, setSelectedClip, setPlayhead]
  )

  return (
    <div
      className="relative h-20 cursor-pointer border-b border-studio-border"
      style={{
        width: totalWidthPx,
        backgroundColor: track.color + '08',
      }}
      onClick={handleClick}
    >
      {/* Track color accent */}
      <div
        className="absolute left-0 top-0 h-full w-0.5"
        style={{ backgroundColor: track.color + '40' }}
      />

      {/* Track-level automation lane — sits beneath clips so clicks on clips hit clip envelope */}
      <div
        className="pointer-events-none absolute left-0 top-0 h-full"
        style={{ width: totalWidthPx }}
      >
        <EnvelopeEditor
          points={track.volumeAutomation}
          onChange={(pts) => setTrackAutomation(track.id, pts)}
          width={totalWidthPx}
          height={80}
          color={track.color}
          interactive={automationMode}
          timeToX={(t) => (t - scrollOffsetSec) * zoomLevel}
          xToTime={(x) => scrollOffsetSec + x / zoomLevel}
          timeMin={0}
          timeMax={durationSec}
        />
      </div>

      {track.clips.map((clip) => (
        <Clip
          key={clip.id}
          clip={clip}
          zoomLevel={zoomLevel}
          scrollOffsetSec={scrollOffsetSec}
          trackIndex={trackIndex}
          allTrackIds={allTrackIds}
        />
      ))}

      {isCapturing && track.id === activeTrackId && (
        <LiveCaptureClip
          captureStartSec={captureStartSec}
          scrollOffsetSec={scrollOffsetSec}
          zoomLevel={zoomLevel}
          color={track.color}
        />
      )}
    </div>
  )
}
