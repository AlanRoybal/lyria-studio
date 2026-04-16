/**
 * Draws a waveform into a canvas element.
 * samples can be Float32Array (range -1..1) or number[] (abs values 0..1)
 */
export function drawWaveform(
  canvas: HTMLCanvasElement,
  samples: Float32Array | number[],
  color: string,
  options: {
    bg?: string
    filled?: boolean
    cropStartFraction?: number
    cropEndFraction?: number
    reverse?: boolean
  } = {}
): void {
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const { width, height } = canvas

  ctx.clearRect(0, 0, width, height)

  if (options.bg) {
    ctx.fillStyle = options.bg
    ctx.fillRect(0, 0, width, height)
  }

  if (!samples || samples.length === 0) return

  const cropStart = Math.max(0, Math.min(1, options.cropStartFraction ?? 0))
  const cropEnd = Math.max(cropStart, Math.min(1, options.cropEndFraction ?? 1))
  const startIdx = Math.floor(cropStart * samples.length)
  const endIdx = Math.floor(cropEnd * samples.length)
  const visibleSamples = endIdx - startIdx

  if (visibleSamples <= 0) return

  const mid = height / 2
  const step = visibleSamples / width

  ctx.strokeStyle = color
  ctx.lineWidth = 1
  ctx.beginPath()

  if (options.filled) {
    // Filled amplitude bars (better for static waveforms)
    ctx.fillStyle = color + '99'
    for (let x = 0; x < width; x++) {
      const sampleX = options.reverse ? width - x - 1 : x
      const idx = startIdx + Math.floor(sampleX * step)
      const raw = samples[Math.min(idx, samples.length - 1)]
      const amp = Math.abs(typeof raw === 'number' ? raw : raw)
      const barH = Math.max(2, amp * height)
      ctx.fillRect(x, mid - barH / 2, 1, barH)
    }
  } else {
    // Line waveform (better for live display)
    for (let x = 0; x < width; x++) {
      const sampleX = options.reverse ? width - x - 1 : x
      const idx = startIdx + Math.floor(sampleX * step)
      const raw = samples[Math.min(idx, samples.length - 1)]
      const val = typeof raw === 'number' ? raw : raw
      const y = mid - val * mid
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
  }
}
