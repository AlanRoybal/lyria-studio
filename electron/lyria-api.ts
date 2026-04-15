import { GoogleGenAI } from '@google/genai'

type EventCallback = (event: string, data: unknown) => void

const DEFAULT_MODEL = 'lyria-3-pro-preview'

export class LyriaApiClient {
  private client: GoogleGenAI
  private onEvent: EventCallback
  private model: string
  private cancelled = false

  constructor(apiKey: string, onEvent: EventCallback, model: string = DEFAULT_MODEL) {
    this.client = new GoogleGenAI({ apiKey })
    this.onEvent = onEvent
    this.model = model.startsWith('models/') ? model.slice('models/'.length) : model
  }

  async connect(): Promise<void> {
    this.onEvent('connected', null)
  }

  async generateClip(
    prompts: Array<{ text: string; weight: number }>,
    _bpm: number
  ): Promise<void> {
    this.cancelled = false

    const promptText = prompts
      .sort((a, b) => b.weight - a.weight)
      .map((p) => p.text)
      .join('\n')

    console.log(`[Lyria] generateContent ${this.model} — prompts: "${promptText}"`)

    let response
    try {
      response = await this.client.models.generateContent({
        model: this.model,
        contents: promptText,
        config: {
          responseModalities: ['AUDIO', 'TEXT'],
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      })
    } catch (err: unknown) {
      if (this.cancelled) return
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[Lyria]', msg)
      this.onEvent('error', msg)
      return
    }

    if (this.cancelled) return

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parts: Array<any> = (response as any).candidates?.[0]?.content?.parts ?? []
    const audioPart = parts.find((p) => {
      const mime = p?.inlineData?.mimeType ?? p?.inline_data?.mime_type
      return typeof mime === 'string' && mime.startsWith('audio/')
    })
    const audioBase64: string | undefined =
      audioPart?.inlineData?.data ?? audioPart?.inline_data?.data
    const mimeType: string =
      audioPart?.inlineData?.mimeType ?? audioPart?.inline_data?.mime_type ?? 'audio/wav'

    if (!audioBase64) {
      const errMsg = 'No audio returned from Lyria API'
      console.error('[Lyria]', errMsg, JSON.stringify(response).slice(0, 400))
      this.onEvent('error', errMsg)
      return
    }

    console.log(`[Lyria] Clip received (${mimeType}, ${audioBase64.length} base64 chars)`)
    this.onEvent('clipReady', { audioBase64, mimeType })
  }

  cancelGeneration(): void {
    this.cancelled = true
  }

  disconnect(): void {
    this.cancelGeneration()
  }
}
