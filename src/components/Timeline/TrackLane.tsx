import { useCallback, useState } from 'react'
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
  const setTrackPitchAutomation = useTimelineStore((s) => s.setTrackPitchAutomation)
  const activeTrackId = useTimelineStore((s) => s.activeTrackId)
  const setActiveTrack = useTimelineStore((s) => s.setActiveTrack)
  const setSelectedClip = useTimelineStore((s) => s.setSelectedClip)
  const setPlayhead = useTimelineStore((s) => s.setPlayhead)
  const isCapturing = useSessionStore((s) => s.isCapturing)
  const captureStartSec = useSessionStore((s) => s.captureStartSec)
  const [automationLane, setAutomationLane] = useState<'volume' | 'pitch'>('volume')
  const trackVolumeColor = '#34d399'
  const trackPitchColor = '#f472b6'

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
          onChange={() => {}}
          width={totalWidthPx}
          height={80}
          color={trackVolumeColor}
          interactive={false}
          timeToX={(t) => (t - scrollOffsetSec) * zoomLevel}
          xToTime={(x) => scrollOffsetSec + x / zoomLevel}
          timeMin={0}
          timeMax={durationSec}
        />
        <EnvelopeEditor
          points={track.pitchAutomation}
          onChange={() => {}}
          width={totalWidthPx}
          height={80}
          color={trackPitchColor}
          interactive={false}
          timeToX={(t) => (t - scrollOffsetSec) * zoomLevel}
          xToTime={(x) => scrollOffsetSec + x / zoomLevel}
          timeMin={0}
          timeMax={durationSec}
          valueMin={-12}
          valueMax={12}
        />
      </div>

      <div
        className="absolute left-0 top-0 h-full"
        style={{ width: totalWidthPx, pointerEvents: automationMode ? 'auto' : 'none' }}
      >
        <EnvelopeEditor
          points={automationLane === 'pitch' ? track.pitchAutomation : track.volumeAutomation}
          onChange={(pts) =>
            automationLane === 'pitch'
              ? setTrackPitchAutomation(track.id, pts)
              : setTrackAutomation(track.id, pts)
          }
          width={totalWidthPx}
          height={80}
          color={automationLane === 'pitch' ? trackPitchColor : trackVolumeColor}
          interactive={automationMode}
          timeToX={(t) => (t - scrollOffsetSec) * zoomLevel}
          xToTime={(x) => scrollOffsetSec + x / zoomLevel}
          timeMin={0}
          timeMax={durationSec}
          valueMin={automationLane === 'pitch' ? -12 : 0}
          valueMax={automationLane === 'pitch' ? 12 : 1}
        />
      </div>

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
                ? 'bg-emerald-300 text-black'
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
                ? 'bg-pink-300 text-black'
                : 'bg-black/40 text-zinc-300 hover:bg-black/60'
            }`}
          >
            Pitch
          </button>
        </div>
      )}

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
