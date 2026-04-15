import {
  GoogleGenAI,
  type GoogleGenAIOptions,
  type LiveMusicServerMessage,
} from '@google/genai'

type EventCallback = (event: string, data: unknown) => void

interface WeightedPrompt {
  text: string
  weight: number
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LiveMusicSession = any

export class LyriaLiveSession {
  private client: GoogleGenAI
  private session: LiveMusicSession = null
  private onEvent: EventCallback
  private _stopped = false

  constructor(apiKey: string, onEvent: EventCallback) {
    const opts: GoogleGenAIOptions = { apiKey, apiVersion: 'v1alpha' }
    this.client = new GoogleGenAI(opts)
    this.onEvent = onEvent
  }

  async start(prompts: WeightedPrompt[], bpm: number): Promise<void> {
    this._stopped = false

    const weightedPrompts =
      prompts.length > 0 ? prompts : [{ text: 'instrumental music', weight: 1.0 }]

    console.log('[Lyria Live] Starting session with prompts:', JSON.stringify(weightedPrompts), 'bpm:', bpm)

    this.session = await this.client.live.music.connect({
      model: 'models/lyria-realtime-exp',
      callbacks: {
        onmessage: (message: LiveMusicServerMessage) => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          if ((message as any).setupComplete !== undefined) {
            console.log('[Lyria Live] Message: setupComplete')
          }
          if (message.serverContent?.audioChunks) {
            for (const chunk of message.serverContent.audioChunks) {
              if (chunk.data) {
                this.onEvent('audioChunk', { data: chunk.data })
              }
            }
          }
        },
        onerror: (e: ErrorEvent) => {
          console.error('[Lyria Live] Error:', JSON.stringify(e), e.message, e)
          if (!this._stopped) {
            const msg = e.message ?? String(e)
            this.onEvent('error', msg)
          }
        },
        onclose: () => {
          console.log('[Lyria Live] Session closed unexpectedly')
          if (!this._stopped) {
            this.onEvent('disconnected', null)
          }
        },
      },
    })

    // Send prompts, config, and play immediately after connect — matching
    // the behavior of test-lyria.mjs which works correctly. The SDK queues
    // messages on the WebSocket; the server processes them in order after
    // setup completes internally.
    this.session.setWeightedPrompts({ weightedPrompts })
    console.log('[Lyria Live] setWeightedPrompts sent:', JSON.stringify(weightedPrompts))

    this.session.setMusicGenerationConfig({
      musicGenerationConfig: { bpm, temperature: 1.0 },
    })
    console.log('[Lyria Live] setMusicGenerationConfig sent: bpm', bpm)

    this.session.play()
    console.log('[Lyria Live] play() sent — waiting for audio chunks...')

    this.onEvent('connected', null)
    console.log(`[Lyria Live] Started — ${weightedPrompts.length} prompt(s), BPM ${bpm}`)
  }

  async updatePrompts(prompts: WeightedPrompt[], bpm: number): Promise<void> {
    if (!this.session || this._stopped) return
    const weightedPrompts =
      prompts.length > 0 ? prompts : [{ text: 'instrumental music', weight: 1.0 }]
    try {
      await this.session.setWeightedPrompts({ weightedPrompts })
      await this.session.setMusicGenerationConfig({
        musicGenerationConfig: { bpm, temperature: 1.0 },
      })
      console.log(`[Lyria Live] Prompts updated — ${weightedPrompts.length} prompt(s), BPM ${bpm}`)
    } catch (err) {
      console.error('[Lyria Live] Failed to update prompts:', err)
    }
  }

  async stop(): Promise<void> {
    this._stopped = true
    const s = this.session
    this.session = null
    if (s) {
      try {
        await s.stop()
      } catch {
        // session may already be closed
      }
    }
    console.log('[Lyria Live] Stopped')
  }
}
