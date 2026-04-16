import type { AutomationPoint } from '@/types/timeline'

export function sortPoints(points: AutomationPoint[]): AutomationPoint[] {
  return [...points].sort((a, b) => a.timeSec - b.timeSec)
}

export function sampleEnvelope(
  points: AutomationPoint[] | undefined,
  timeSec: number,
  defaultValue = 1
): number {
  if (!points || points.length === 0) return defaultValue
  const sorted = sortPoints(points)
  if (timeSec <= sorted[0].timeSec) return sorted[0].value
  const last = sorted[sorted.length - 1]
  if (timeSec >= last.timeSec) return last.value
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i]
    const b = sorted[i + 1]
    if (timeSec >= a.timeSec && timeSec <= b.timeSec) {
      const span = b.timeSec - a.timeSec
      if (span === 0) return b.value
      const frac = (timeSec - a.timeSec) / span
      return a.value + frac * (b.value - a.value)
    }
  }
  return last.value
}
