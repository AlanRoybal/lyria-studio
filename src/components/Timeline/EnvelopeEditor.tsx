import { useCallback } from 'react'
import type { AutomationPoint } from '@/types/timeline'
import { sortPoints } from '@/audio/Automation'

interface Props {
  points: AutomationPoint[] | undefined
  onChange: (pts: AutomationPoint[]) => void
  width: number
  height: number
  color: string
  interactive: boolean
  timeToX: (t: number) => number
  xToTime: (x: number) => number
  timeMin: number
  timeMax: number
  valueMin?: number
  valueMax?: number
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function EnvelopeEditor({
  points,
  onChange,
  width,
  height,
  color,
  interactive,
  timeToX,
  xToTime,
  timeMin,
  timeMax,
  valueMin = 0,
  valueMax = 1,
}: Props) {
  const sorted = sortPoints(points ?? [])
  const valueSpan = Math.max(0.0001, valueMax - valueMin)
  const normalizedValue = (v: number) => (clamp(v, valueMin, valueMax) - valueMin) / valueSpan
  const valueToY = (v: number) => (1 - normalizedValue(v)) * height

  let pathStr = ''
  if (sorted.length > 0) {
    const pts: [number, number][] = [
      [timeToX(timeMin), valueToY(sorted[0].value)],
      ...sorted.map<[number, number]>((p) => [timeToX(p.timeSec), valueToY(p.value)]),
      [timeToX(timeMax), valueToY(sorted[sorted.length - 1].value)],
    ]
    pathStr = pts.map(([x, y], i) => (i === 0 ? `M ${x} ${y}` : `L ${x} ${y}`)).join(' ')
  }

  const addPointAt = useCallback(
    (clientX: number, clientY: number, rect: DOMRect) => {
      const x = clientX - rect.left
      const y = clientY - rect.top
      const t = clamp(xToTime(x), timeMin, timeMax)
      const v = valueMin + (1 - clamp(y / height, 0, 1)) * valueSpan
      onChange([...sorted, { timeSec: t, value: v }])
    },
    [sorted, onChange, xToTime, height, timeMin, timeMax, valueMin, valueSpan]
  )

  const handleBgMouseDown = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!interactive) return
      if (e.button !== 0) return
      // Ignore if the target is a point (it handles its own mousedown)
      if ((e.target as SVGElement).dataset?.envPoint !== undefined) return
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      addPointAt(e.clientX, e.clientY, rect)
    },
    [interactive, addPointAt]
  )

  const handlePointMouseDown = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, idx: number) => {
      if (!interactive) return
      e.stopPropagation()
      if (e.button === 2) return // context menu handles delete
      const svg = e.currentTarget.ownerSVGElement
      if (!svg) return
      const rect = svg.getBoundingClientRect()
      const onMove = (ev: MouseEvent) => {
        const x = ev.clientX - rect.left
        const y = ev.clientY - rect.top
        const t = clamp(xToTime(x), timeMin, timeMax)
        const v = valueMin + (1 - clamp(y / height, 0, 1)) * valueSpan
        const next = [...sorted]
        next[idx] = { timeSec: t, value: v }
        onChange(next)
      }
      const onUp = () => {
        document.removeEventListener('mousemove', onMove)
        document.removeEventListener('mouseup', onUp)
      }
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseup', onUp)
    },
    [interactive, sorted, xToTime, height, timeMin, timeMax, onChange, valueMin, valueSpan]
  )

  const handlePointContextMenu = useCallback(
    (e: React.MouseEvent<SVGCircleElement>, idx: number) => {
      e.preventDefault()
      e.stopPropagation()
      if (!interactive) return
      onChange(sorted.filter((_, i) => i !== idx))
    },
    [interactive, sorted, onChange]
  )

  return (
    <svg
      width={width}
      height={height}
      className="absolute left-0 top-0 overflow-visible"
      style={{ pointerEvents: interactive ? 'auto' : 'none' }}
      onMouseDown={handleBgMouseDown}
      onClick={interactive ? (e) => e.stopPropagation() : undefined}
      onContextMenu={(e) => e.preventDefault()}
    >
      {pathStr && (
        <path
          d={pathStr}
          stroke={color}
          strokeWidth={1.5}
          fill="none"
          style={{ pointerEvents: 'none', filter: 'drop-shadow(0 0 2px rgba(0,0,0,0.6))' }}
        />
      )}
      {sorted.map((p, i) => (
        <circle
          key={i}
          data-env-point=""
          cx={timeToX(p.timeSec)}
          cy={valueToY(p.value)}
          r={interactive ? 5 : 3}
          fill={color}
          stroke="#000"
          strokeWidth={1}
          style={{ cursor: interactive ? 'grab' : 'default' }}
          onMouseDown={(e) => handlePointMouseDown(e, i)}
          onContextMenu={(e) => handlePointContextMenu(e, i)}
        />
      ))}
    </svg>
  )
}
