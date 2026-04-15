import { useMemo } from 'react'
import { useTimelineStore } from '@/store/timelineStore'

function formatTime(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export function TimeRuler({ totalWidthPx }: { totalWidthPx: number }) {
  const scrollOffsetSec = useTimelineStore((s) => s.scrollOffsetSec)
  const zoomLevel = useTimelineStore((s) => s.zoomLevel)
  const durationSec = useTimelineStore((s) => s.durationSec)
  const setPlayhead = useTimelineStore((s) => s.setPlayhead)

  // Compute tick interval in seconds based on zoom
  const tickIntervalSec = useMemo(() => {
    const candidates = [0.5, 1, 2, 5, 10, 15, 30, 60, 120]
    const minPxBetweenTicks = 60
    for (const c of candidates) {
      if (c * zoomLevel >= minPxBetweenTicks) return c
    }
    return 120
  }, [zoomLevel])

  const ticks = useMemo(() => {
    const result: number[] = []
    const startSec = Math.floor(scrollOffsetSec / tickIntervalSec) * tickIntervalSec
    const endSec = scrollOffsetSec + totalWidthPx / zoomLevel
    for (let t = startSec; t <= Math.min(endSec, durationSec); t += tickIntervalSec) {
      result.push(t)
    }
    return result
  }, [scrollOffsetSec, totalWidthPx, zoomLevel, tickIntervalSec, durationSec])

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const x = e.clientX - rect.left
    const sec = scrollOffsetSec + x / zoomLevel
    setPlayhead(sec)
  }

  return (
    <div
      className="relative h-7 cursor-pointer select-none border-b border-studio-border bg-studio-panel"
      style={{ width: totalWidthPx }}
      onClick={handleClick}
    >
      {ticks.map((sec) => {
        const x = (sec - scrollOffsetSec) * zoomLevel
        return (
          <div
            key={sec}
            className="pointer-events-none absolute top-0 flex flex-col items-center"
            style={{ left: x }}
          >
            <div className="mt-1 h-2 w-px bg-zinc-600" />
            <span className="mt-0.5 text-[9px] text-zinc-500">{formatTime(sec)}</span>
          </div>
        )
      })}
    </div>
  )
}
