import { contextBridge, ipcRenderer } from 'electron'
import fs from 'fs'
import path from 'path'

function getMimeType(filePath: string): string {
  switch (path.extname(filePath).toLowerCase()) {
    case '.mp3':
      return 'audio/mpeg'
    case '.wav':
      return 'audio/wav'
    case '.ogg':
      return 'audio/ogg'
    default:
      return 'application/octet-stream'
  }
}

contextBridge.exposeInMainWorld('store', {
  getApiKey: (): Promise<string> => ipcRenderer.invoke('store:getApiKey'),
  setApiKey: (key: string): Promise<void> => ipcRenderer.invoke('store:setApiKey', key),
  getFileDataUrl: (filePath: string): string | null => {
    try {
      const bytes = fs.readFileSync(filePath)
      const mimeType = getMimeType(filePath)
      return `data:${mimeType};base64,${bytes.toString('base64')}`
    } catch {
      return null
    }
  },
  saveFile: (
    suggestedName: string,
    data: Uint8Array,
    filters?: Array<{ name: string; extensions: string[] }>
  ): Promise<{ canceled: boolean; filePath?: string }> =>
    ipcRenderer.invoke('export:saveFile', { suggestedName, data, filters }),
})

contextBridge.exposeInMainWorld('updates', {
  getStartupState: () => ipcRenderer.invoke('updates:getStartupState'),
  setAutoUpdatePreference: (enabled: boolean) =>
    ipcRenderer.invoke('updates:setAutoUpdatePreference', enabled),
  downloadUpdate: () => ipcRenderer.invoke('updates:downloadUpdate'),
  installUpdate: () => ipcRenderer.invoke('updates:installUpdate'),
  markReleaseNotesShown: (version: string) =>
    ipcRenderer.invoke('updates:markReleaseNotesShown', version),
  onEvent: (callback: (payload: unknown) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: unknown) => callback(payload)
    ipcRenderer.on('updates:event', handler)
    return () => ipcRenderer.removeListener('updates:event', handler)
  },
})

contextBridge.exposeInMainWorld('tutorial', {
  markCompleted: (): Promise<void> => ipcRenderer.invoke('tutorial:markCompleted'),
})

contextBridge.exposeInMainWorld('engagement', {
  dismissGithubStarPrompt: (): Promise<void> => ipcRenderer.invoke('engagement:dismissGithubStarPrompt'),
  openGithubRepo: (): Promise<void> => ipcRenderer.invoke('engagement:openGithubRepo'),
  onGithubStarPrompt: (callback: (payload: { repoUrl: string }) => void): (() => void) => {
    const handler = (_: Electron.IpcRendererEvent, payload: { repoUrl: string }) => callback(payload)
    ipcRenderer.on('engagement:github-star-prompt', handler)
    return () => ipcRenderer.removeListener('engagement:github-star-prompt', handler)
  },
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
