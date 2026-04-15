const SAMPLE_RATE = 48000
const MAX_DURATION_SEC = 600 // 10 minutes max

export class RecordingPipeline {
  private leftChunks: Float32Array[] = []
  private rightChunks: Float32Array[] = []
  private totalSamples = 0

  appendChunk(left: number[], right: number[]): void {
    if (this.totalSamples / SAMPLE_RATE >= MAX_DURATION_SEC) return

    const l = new Float32Array(left)
    const r = new Float32Array(right)
    this.leftChunks.push(l)
    this.rightChunks.push(r)
    this.totalSamples += l.length
  }

  getDurationSec(): number {
    return this.totalSamples / SAMPLE_RATE
  }

  /** Downsampled waveform (absolute values, max targetPoints points) for live display */
  getLiveWaveformSnapshot(targetPoints = 500): number[] {
    if (this.totalSamples === 0) return []
    const step = Math.max(1, Math.floor(this.totalSamples / targetPoints))
    const result: number[] = []
    let globalIdx = 0

    for (const chunk of this.leftChunks) {
      for (let i = 0; i < chunk.length; i++, globalIdx++) {
        if (globalIdx % step === 0) {
          result.push(Math.abs(chunk[i]))
        }
      }
    }
    return result.slice(-targetPoints)
  }

  /** Build downsampled waveform cache for a finalized clip (Float32Array, max 500 points) */
  buildWaveformCache(buffer: AudioBuffer, points = 500): Float32Array {
    const channelData = buffer.getChannelData(0)
    const cache = new Float32Array(points)
    const step = Math.floor(channelData.length / points)
    for (let i = 0; i < points; i++) {
      const idx = i * step
      let peak = 0
      for (let j = 0; j < step && idx + j < channelData.length; j++) {
        peak = Math.max(peak, Math.abs(channelData[idx + j]))
      }
      cache[i] = peak
    }
    return cache
  }

  /** Merge all chunks into a stereo AudioBuffer and reset state */
  finalize(audioCtx: AudioContext): AudioBuffer {
    const buffer = audioCtx.createBuffer(2, this.totalSamples, SAMPLE_RATE)
    const leftDest = buffer.getChannelData(0)
    const rightDest = buffer.getChannelData(1)

    let offset = 0
    for (let i = 0; i < this.leftChunks.length; i++) {
      leftDest.set(this.leftChunks[i], offset)
      rightDest.set(this.rightChunks[i], offset)
      offset += this.leftChunks[i].length
    }

    // Reset
    this.leftChunks = []
    this.rightChunks = []
    this.totalSamples = 0

    return buffer
  }

  reset(): void {
    this.leftChunks = []
    this.rightChunks = []
    this.totalSamples = 0
  }

  get isEmpty(): boolean {
    return this.totalSamples === 0
  }
}
