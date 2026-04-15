import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { LyriaLiveSession } from './lyria-live'
import { LyriaApiClient } from './lyria-api'

function resolveIconPath(): string | null {
  const candidates = [
    path.join(__dirname, '../build/icon.png'),
    path.join(process.resourcesPath ?? '', 'build/icon.png'),
    path.join(__dirname, '../../build/icon.png'),
  ]
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      /* ignore */
    }
  }
  return null
}

app.setName('Lyria Studio')

let mainWindow: BrowserWindow | null = null
let lyriaSession: LyriaLiveSession | null = null
let vocalsClient: LyriaApiClient | null = null

// Simple key-value store backed by a JSON file in userData
function getConfigPath(): string {
  return path.join(app.getPath('userData'), 'config.json')
}

function readConfig(): Record<string, string> {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(data: Record<string, string>): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data), 'utf-8')
}

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL

function createWindow() {
  const iconPath = resolveIconPath()
  mainWindow = new BrowserWindow({
    title: 'Lyria Studio',
    width: 1600,
    height: 1000,
    minWidth: 1200,
    minHeight: 700,
    backgroundColor: '#0a0a0b',
    titleBarStyle: 'hiddenInset',
    ...(iconPath ? { icon: iconPath } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
}

// ── IPC: API key persistence ──────────────────────────────────────────────────

ipcMain.handle('store:getApiKey', () => {
  return readConfig().apiKey ?? ''
})

ipcMain.handle('store:setApiKey', (_event, key: string) => {
  writeConfig({ ...readConfig(), apiKey: key })
})

ipcMain.handle(
  'export:saveFile',
  async (_event, payload: { suggestedName: string; data: Uint8Array; filters?: Array<{ name: string; extensions: string[] }> }) => {
    if (!mainWindow) throw new Error('Main window is not available')

    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: payload.suggestedName,
      filters: payload.filters,
    })

    if (result.canceled || !result.filePath) {
      return { canceled: true as const }
    }

    fs.writeFileSync(result.filePath, Buffer.from(payload.data))
    return { canceled: false as const, filePath: result.filePath }
  }
)

// ── IPC: Lyria Live Session ───────────────────────────────────────────────────

function sendEvent(event: string, data: unknown) {
  mainWindow?.webContents.send('lyria:event', { event, data })
}

ipcMain.handle(
  'lyria:startLive',
  async (_event, apiKey: string, prompts: Array<{ text: string; weight: number }>, bpm: number) => {
    console.log('[IPC] lyria:startLive received — prompts:', JSON.stringify(prompts), 'bpm:', bpm)

    // Stop any existing session first
    if (lyriaSession) {
      await lyriaSession.stop()
      lyriaSession = null
    }

    lyriaSession = new LyriaLiveSession(apiKey, sendEvent)
    await lyriaSession.start(prompts, bpm)
  }
)

ipcMain.handle('lyria:stopLive', async () => {
  if (lyriaSession) {
    await lyriaSession.stop()
    lyriaSession = null
  }
  if (vocalsClient) {
    vocalsClient.disconnect()
    vocalsClient = null
  }
})

ipcMain.handle(
  'lyria:generateVocalsClip',
  async (
    _event,
    apiKey: string,
    prompts: Array<{ text: string; weight: number }>,
    model: string
  ) => {
    console.log(
      '[IPC] lyria:generateVocalsClip received — prompts:',
      JSON.stringify(prompts),
      'model:',
      model
    )

    if (vocalsClient) {
      vocalsClient.disconnect()
      vocalsClient = null
    }

    vocalsClient = new LyriaApiClient(apiKey, sendEvent, model)
    try {
      await vocalsClient.generateClip(prompts, 0)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error('[IPC] lyria:generateVocalsClip error:', msg)
      sendEvent('error', msg)
    }
  }
)

ipcMain.handle(
  'lyria:updatePrompts',
  async (_event, prompts: Array<{ text: string; weight: number }>, bpm: number) => {
    if (lyriaSession) {
      await lyriaSession.updatePrompts(prompts, bpm)
    }
  }
)

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    const iconPath = resolveIconPath()
    if (iconPath) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  if (lyriaSession) {
    await lyriaSession.stop()
    lyriaSession = null
  }
  if (vocalsClient) {
    vocalsClient.disconnect()
    vocalsClient = null
  }
})
