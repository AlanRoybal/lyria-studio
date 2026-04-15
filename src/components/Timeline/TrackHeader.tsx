import { useCallback, useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import type { Track } from '@/types/timeline'
import { useTimelineStore } from '@/store/timelineStore'
import { Tooltip } from '@/components/ui/Tooltip'

interface TrackHeaderProps {
  track: Track
  isActive: boolean
}

export function TrackHeader({ track, isActive }: TrackHeaderProps) {
  const { updateTrack, removeTrack, setActiveTrack } = useTimelineStore()
  const [isEditingName, setIsEditingName] = useState(false)
  const [nameDraft, setNameDraft] = useState(track.name)
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus()
      nameInputRef.current?.select()
    }
  }, [isEditingName])

  useEffect(() => {
    if (!isEditingName) setNameDraft(track.name)
  }, [track.name, isEditingName])

  const commitName = useCallback(() => {
    const trimmed = nameDraft.trim()
    if (trimmed && trimmed !== track.name) {
      updateTrack(track.id, { name: trimmed })
    } else {
      setNameDraft(track.name)
    }
    setIsEditingName(false)
  }, [nameDraft, track.id, track.name, updateTrack])

  const handleNameKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault()
        commitName()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setNameDraft(track.name)
        setIsEditingName(false)
      }
    },
    [commitName, track.name]
  )

  const toggleMute = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      updateTrack(track.id, { muted: !track.muted })
    },
    [track.id, track.muted, updateTrack]
  )

  const toggleSolo = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      updateTrack(track.id, { soloed: !track.soloed })
    },
    [track.id, track.soloed, updateTrack]
  )

  const handleVolumeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateTrack(track.id, { volume: parseFloat(e.target.value) })
    },
    [track.id, updateTrack]
  )

  const handleRemove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      removeTrack(track.id)
    },
    [track.id, removeTrack]
  )

  return (
    <div
      className={`flex h-20 w-full cursor-pointer select-none items-center gap-2 border-b border-studio-border px-2 transition-colors ${
        isActive ? 'bg-zinc-800' : 'bg-studio-panel hover:bg-zinc-900'
      }`}
      onClick={() => setActiveTrack(track.id)}
    >
      {/* Color bar */}
      <div
        className="h-12 w-1 flex-shrink-0 rounded-full"
        style={{ backgroundColor: track.color }}
      />

      {/* Track name + volume */}
      <div className="min-w-0 flex-1">
        {isEditingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            onClick={(e) => e.stopPropagation()}
            className="w-full rounded border border-studio-border bg-zinc-900 px-1 py-0.5 text-xs font-semibold outline-none focus:border-violet-500"
            style={{ color: track.color }}
          />
        ) : (
          <Tooltip text="Double-click to rename">
            <div
              onDoubleClick={(e) => {
                e.stopPropagation()
                setIsEditingName(true)
              }}
              className="truncate rounded px-1 py-0.5 text-xs font-semibold hover:bg-zinc-800/60"
              style={{ color: track.color }}
            >
              {track.name}
            </div>
          </Tooltip>
        )}
        <Tooltip text={`Volume: ${Math.round(track.volume * 100)}%`} position="bottom">
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={track.volume}
            onChange={handleVolumeChange}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 h-1 w-full cursor-pointer"
            style={{ accentColor: track.color }}
          />
        </Tooltip>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-1">
        <Tooltip text={track.muted ? 'Unmute track' : 'Mute track'}>
          <button
            onClick={toggleMute}
            className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold transition-colors ${
              track.muted
                ? 'bg-yellow-600 text-white'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
            }`}
          >
            M
          </button>
        </Tooltip>
        <Tooltip text={track.soloed ? 'Unsolo track' : 'Solo track'}>
          <button
            onClick={toggleSolo}
            className={`flex h-5 w-5 items-center justify-center rounded text-[9px] font-bold transition-colors ${
              track.soloed
                ? 'bg-amber-500 text-white'
                : 'bg-zinc-700 text-zinc-400 hover:bg-zinc-600'
            }`}
          >
            S
          </button>
        </Tooltip>
        <Tooltip text="Delete track" position="bottom">
          <button
            onClick={handleRemove}
            className="flex h-5 w-5 items-center justify-center rounded bg-zinc-700 text-zinc-400 hover:bg-red-900 hover:text-red-400"
          >
            <X size={11} />
          </button>
        </Tooltip>
      </div>
    </div>
  )
}
