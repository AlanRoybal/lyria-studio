import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('store', {
  getApiKey: (): Promise<string> => ipcRenderer.invoke('store:getApiKey'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('store:setApiKey', key),
  saveFile: (
    suggestedName: string,
    data: Uint8Array,
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:saveFile', { suggestedName, data, filters }),
})

contextBridge.exposeInMainWorld('lyria', {
  startLive: (
    apiKey: string,
    prompts: Array<{ text: string; weight: number }>,
    bpm: number
  ): Promise<void> => ipcRenderer.invoke('lyria:startLive', apiKey, prompts, bpm),

  stopLive: (): Promise<void> => ipcRenderer.invoke('lyria:stopLive'),

  generateVocalsClip: (
    apiKey: string,
    prompts: Array<{ text: string; weight: number }>,
    model: string
  ): Promise<void> =>
    ipcRenderer.invoke('lyria:generateVocalsClip', apiKey, prompts, model),

  updatePrompts: (
    prompts: Array<{ text: string; weight: number }>,
    bpm: number
  ): Promise<void> => ipcRenderer.invoke('lyria:updatePrompts', prompts, bpm),

  onEvent: (callback: (payload: { event: string; data: unknown }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { event: string; data: unknown }) =>
      callback(payload)
    ipcRenderer.on('lyria:event', handler)
    return () => ipcRenderer.removeListener('lyria:event', handler)
  },
})
