export interface WeightedPrompt {
  text: string
  weight: number
}

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

declare global {
  interface Window {
    store: {
      getApiKey(): Promise<string>
      setApiKey(key: string): Promise<void>
      getFileDataUrl(filePath: string): string | null
      saveFile(
        suggestedName: string,
        data: Uint8Array,
        filters?: Array<{ name: string; extensions: string[] }>
      ): Promise<{ canceled: boolean; filePath?: string }>
    }
    lyria: {
      /** Start a live session and begin streaming audio */
      startLive(apiKey: string, prompts: WeightedPrompt[], bpm: number): Promise<void>
      /** Stop the live session */
      stopLive(): Promise<void>
      /** Hot-swap prompts/BPM without restarting the session */
      updatePrompts(prompts: WeightedPrompt[], bpm: number): Promise<void>
      /** Generate a one-shot vocals clip via the Lyria REST API (e.g. lyria-3-pro-preview). */
      generateVocalsClip(
        apiKey: string,
        prompts: WeightedPrompt[],
        model: string
      ): Promise<void>
      /** Subscribe to events from the main process. Returns unsubscribe fn. */
      onEvent(cb: (payload: { event: string; data: unknown }) => void): () => void
    }
  }
}
