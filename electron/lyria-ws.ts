import WebSocket from 'ws'

type EventCallback = (event: string, data: unknown) => void

const LYRIA_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateMusic'

export class LyriaWebSocketManager {
  private ws: WebSocket | null = null
  private apiKey: string
  private onEvent: EventCallback
  private isSetupComplete = false
  private _aborted = false

  constructor(apiKey: string, onEvent: EventCallback) {
    this.apiKey = apiKey
    this.onEvent = onEvent
  }

  connect(): Promise<void> {
    this._aborted = false
    return new Promise((resolve, reject) => {
      const url = `${LYRIA_WS_URL}?key=${encodeURIComponent(this.apiKey)}`
      this.ws = new WebSocket(url)

      const timeout = setTimeout(() => {
        reject(new Error('Lyria connection timed out after 15s'))
        this.ws?.terminate()
      }, 15000)

      this.ws.on('open', () => {
        const setupMsg = { setup: { model: 'models/lyria-realtime-exp' } }
        console.log('[Lyria] WS open, sending setup:', JSON.stringify(setupMsg))
        this.ws!.send(JSON.stringify(setupMsg))
      })

      this.ws.on('message', (raw: Buffer) => {
        const text = raw.toString()
        let msg: Record<string, unknown>
        try {
          msg = JSON.parse(text)
        } catch {
          console.log('[Lyria] Non-JSON message:', text)
          return
        }

        console.log('[Lyria] Server message:', JSON.stringify(msg).slice(0, 300))

        if (msg.setupComplete) {
          clearTimeout(timeout)
          this.isSetupComplete = true
          this.onEvent('connected', null)
          resolve()
          return
        }

        // Surface any server-side error
        if (msg.error) {
          const err = msg.error as { message?: string; code?: number }
          const errMsg = err.message ?? JSON.stringify(msg.error)
          console.error('[Lyria] Server error:', errMsg)
          clearTimeout(timeout)
          this.onEvent('error', errMsg)
          reject(new Error(errMsg))
          return
        }

        const serverContent = msg.serverContent as Record<string, unknown> | undefined
        const audioChunks = serverContent?.audioChunks as Array<{ data: string }> | undefined
        if (audioChunks && Array.isArray(audioChunks)) {
          for (const chunk of audioChunks) {
            if (chunk.data) {
              const decoded = this.decodePCMChunk(chunk.data)
              this.onEvent('audioChunk', {
                left: Array.from(decoded.left),
                right: Array.from(decoded.right),
                sampleRate: 48000,
              })
            }
          }
        }
      })

      this.ws.on('error', (err: Error) => {
        clearTimeout(timeout)
        if (this._aborted) { resolve(); return }
        console.error('[Lyria] WS error:', err.message)
        this.onEvent('error', err.message)
        reject(err)
      })

      this.ws.on('close', (code: number, reason: Buffer) => {
        const reasonStr = reason.toString() || '(no reason)'
        console.log(`[Lyria] WS closed — code: ${code}, reason: ${reasonStr}`)
        this.isSetupComplete = false
        // Treat non-clean closes as errors so the UI shows what went wrong
        if (code !== 1000 && code !== 1001 && !this._aborted) {
          const msg = `Connection closed by server (code ${code}: ${reasonStr})`
          this.onEvent('error', msg)
        } else {
          this.onEvent('disconnected', { code, reason: reasonStr })
        }
      })
    })
  }

  sendWeightedPrompts(prompts: Array<{ text: string; weight: number }>): void {
    if (!this.ws || !this.isSetupComplete) return
    const msg = { clientContent: { weightedPrompts: prompts } }
    console.log('[Lyria] Sending prompts:', JSON.stringify(msg))
    this.ws.send(JSON.stringify(msg))
  }

  startPlayback(bpm = 120): void {
    if (!this.ws || !this.isSetupComplete) return
    const config = { musicGenerationConfig: { bpm, temperature: 1.0 } }
    const play = { playbackControl: 'PLAY' }
    console.log('[Lyria] Sending config:', JSON.stringify(config))
    console.log('[Lyria] Sending playbackControl: PLAY')
    this.ws.send(JSON.stringify(config))
    this.ws.send(JSON.stringify(play))
  }

  stopPlayback(): void {
    if (this.ws && this.isSetupComplete) {
      console.log('[Lyria] Sending playbackControl: PAUSE')
      this.ws.send(JSON.stringify({ playbackControl: 'PAUSE' }))
    }
    this.onEvent('recordingStopped', null)
  }

  disconnect(): Promise<void> {
    this._aborted = true
    return new Promise((resolve) => {
      if (!this.ws) {
        resolve()
        return
      }
      const ws = this.ws
      this.ws = null
      this.isSetupComplete = false

      // If still connecting, terminate immediately rather than calling close()
      // (ws.close() throws synchronously on a CONNECTING socket)
      if (ws.readyState === WebSocket.CONNECTING) {
        ws.terminate()
        resolve()
        return
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.once('close', () => resolve())
        try {
          ws.close(1000, 'user disconnect')
        } catch {
          resolve()
        }
      } else {
        // Already closing or closed
        resolve()
      }
    })
  }

  /** Decode base64 PCM (16-bit signed LE, interleaved stereo) → {left, right} Float32Arrays */
  private decodePCMChunk(base64: string): { left: Float32Array; right: Float32Array } {
    const binary = Buffer.from(base64, 'base64')
    // Each sample is 2 bytes (Int16); stereo interleaved: L R L R ...
    const totalSamples = binary.length / 2
    const frameSamples = Math.floor(totalSamples / 2)
    const left = new Float32Array(frameSamples)
    const right = new Float32Array(frameSamples)

    for (let i = 0; i < totalSamples; i++) {
      const int16 = binary.readInt16LE(i * 2)
      const float = int16 / 32768.0
      if (i % 2 === 0) {
        left[i >> 1] = float
      } else {
        right[i >> 1] = float
      }
    }
    return { left, right }
  }
}
