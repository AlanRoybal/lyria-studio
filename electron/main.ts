import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron'
import path from 'path'
import fs from 'fs'
import { autoUpdater, type ProgressInfo, type UpdateDownloadedEvent, type UpdateInfo } from 'electron-updater'
import { LyriaLiveSession } from './lyria-live'
import { LyriaApiClient } from './lyria-api'

type AutoUpdatePreference = 'enabled' | 'disabled'

interface PersistedReleaseInfo {
  version: string
  releaseName?: string
  releaseNotes: string
  publishedAt?: string
}

interface AppConfig {
  apiKey?: string
  hasCompletedTutorial?: boolean
  autoUpdatePreference?: AutoUpdatePreference
  pendingPostUpdateRelease?: PersistedReleaseInfo
  lastSeenReleaseNotesVersion?: string
  githubStarPrompt?: {
    accumulatedOpenMs?: number
    dismissed?: boolean
  }
}

type UpdateStatus = 'idle' | 'unsupported' | 'checking' | 'available' | 'downloading' | 'downloaded' | 'none' | 'error'

interface UpdateState {
  status: UpdateStatus
  message?: string
  progressPercent?: number
  release?: PersistedReleaseInfo
  wasManualCheck?: boolean
}

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

function readConfig(): AppConfig {
  try {
    const raw = fs.readFileSync(getConfigPath(), 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

function writeConfig(data: AppConfig): void {
  fs.writeFileSync(getConfigPath(), JSON.stringify(data), 'utf-8')
}

function updateConfig(mutator: (current: AppConfig) => AppConfig): AppConfig {
  const next = mutator(readConfig())
  writeConfig(next)
  return next
}

const isDev = process.env.NODE_ENV === 'development' || !!process.env.VITE_DEV_SERVER_URL
const isUpdaterSupported = app.isPackaged && !isDev
let currentUpdateState: UpdateState = { status: isUpdaterSupported ? 'idle' : 'unsupported' }
let hasStartedUpdateCheck = false
let currentCheckWasManual = false
const GITHUB_REPO_URL = 'https://github.com/AlanRoybal/lyria-studio'
const GITHUB_STAR_PROMPT_DELAY_MS = 5 * 60 * 1000
const BUNDLED_RELEASE_NOTES: Record<string, PersistedReleaseInfo> = {
  '0.1.4': {
    version: '0.1.4',
    releaseName: 'v0.1.4',
    publishedAt: '2026-04-16',
    releaseNotes: [
      'Improves automation editing and keeps pitch changes from altering clip length.',
      '',
      '- Track and clip automation now render both volume and pitch lines at the same time with clearer color separation.',
      '- Playback now stops at the actual end of scheduled clips instead of letting the playhead drift in silence.',
      '- Added real duration-preserving pitch processing for pitch automation in playback and export.',
      '- Pitch automation no longer stretches clips shorter or longer just because the pitch changed.',
      '- UI sound effects are now bundled with the app instead of relying on files from the local Downloads folder.',
    ].join('\n'),
  },
}
let appOpenStartedAt = 0
let githubStarPromptTimer: NodeJS.Timeout | null = null

function normalizeReleaseNotes(releaseNotes: UpdateInfo['releaseNotes']): string {
  if (Array.isArray(releaseNotes)) {
    return releaseNotes
      .map((entry) => (entry.note ?? '').trim())
      .filter(Boolean)
      .join('\n\n')
  }

  return typeof releaseNotes === 'string' ? releaseNotes.trim() : ''
}

function toPersistedReleaseInfo(info?: UpdateInfo | UpdateDownloadedEvent | null): PersistedReleaseInfo | undefined {
  if (!info?.version) return undefined

  return {
    version: info.version,
    releaseName: 'releaseName' in info && typeof info.releaseName === 'string' ? info.releaseName : undefined,
    releaseNotes: normalizeReleaseNotes(info.releaseNotes),
    publishedAt:
      'releaseDate' in info && typeof info.releaseDate === 'string' ? info.releaseDate : undefined,
  }
}

function setUpdateState(next: UpdateState): void {
  currentUpdateState = next
  mainWindow?.webContents.send('updates:event', next)
}

function getGithubStarPromptState(): { shouldShow: boolean; repoUrl: string } {
  const prompt = readConfig().githubStarPrompt
  const sessionOpenMs = appOpenStartedAt ? Math.max(0, Date.now() - appOpenStartedAt) : 0
  const accumulatedOpenMs = (prompt?.accumulatedOpenMs ?? 0) + sessionOpenMs
  const dismissed = prompt?.dismissed === true

  return {
    shouldShow: !dismissed && accumulatedOpenMs >= GITHUB_STAR_PROMPT_DELAY_MS,
    repoUrl: GITHUB_REPO_URL,
  }
}

function clearGithubStarPromptTimer(): void {
  if (!githubStarPromptTimer) return
  clearTimeout(githubStarPromptTimer)
  githubStarPromptTimer = null
}

function scheduleGithubStarPrompt(): void {
  clearGithubStarPromptTimer()

  const prompt = readConfig().githubStarPrompt
  if (prompt?.dismissed) return

  const sessionOpenMs = appOpenStartedAt ? Math.max(0, Date.now() - appOpenStartedAt) : 0
  const accumulatedOpenMs = (prompt?.accumulatedOpenMs ?? 0) + sessionOpenMs
  const remainingMs = GITHUB_STAR_PROMPT_DELAY_MS - accumulatedOpenMs

  if (remainingMs <= 0) {
    mainWindow?.webContents.send('engagement:github-star-prompt', { repoUrl: GITHUB_REPO_URL })
    return
  }

  githubStarPromptTimer = setTimeout(() => {
    githubStarPromptTimer = null
    mainWindow?.webContents.send('engagement:github-star-prompt', { repoUrl: GITHUB_REPO_URL })
  }, remainingMs)
}

function persistAppOpenTime(): void {
  if (!appOpenStartedAt) return

  const now = Date.now()
  const elapsedMs = Math.max(0, now - appOpenStartedAt)
  appOpenStartedAt = now

  if (elapsedMs === 0) return

  updateConfig((current) => {
    const prompt = current.githubStarPrompt ?? {}
    return {
      ...current,
      githubStarPrompt: {
        ...prompt,
        accumulatedOpenMs: (prompt.accumulatedOpenMs ?? 0) + elapsedMs,
      },
    }
  })
}

function getReleaseToShowOnStartup(): PersistedReleaseInfo | null {
  const config = readConfig()
  const pending = config.pendingPostUpdateRelease

  if (pending && pending.version === app.getVersion() && config.lastSeenReleaseNotesVersion !== pending.version) {
    return pending
  }

  const bundled = BUNDLED_RELEASE_NOTES[app.getVersion()]
  if (!bundled) return null
  if (config.lastSeenReleaseNotesVersion === bundled.version) return null

  return bundled
}

function configureAutoUpdater(): void {
  if (!isUpdaterSupported) return

  autoUpdater.autoInstallOnAppQuit = false
  autoUpdater.disableWebInstaller = true
  autoUpdater.forceDevUpdateConfig = false
  autoUpdater.on('checking-for-update', () => {
    setUpdateState({ status: 'checking', wasManualCheck: currentCheckWasManual })
  })
  autoUpdater.on('update-available', (info) => {
    setUpdateState({
      status: autoUpdater.autoDownload ? 'downloading' : 'available',
      release: toPersistedReleaseInfo(info),
      wasManualCheck: currentCheckWasManual,
    })
  })
  autoUpdater.on('update-not-available', () => {
    setUpdateState({
      status: 'none',
      message: currentCheckWasManual ? `Lyria Studio ${app.getVersion()} is up to date.` : undefined,
      wasManualCheck: currentCheckWasManual,
    })
  })
  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    setUpdateState({
      status: 'downloading',
      progressPercent: progress.percent,
      release: currentUpdateState.release,
      wasManualCheck: currentUpdateState.wasManualCheck,
    })
  })
  autoUpdater.on('update-downloaded', (info) => {
    const release = toPersistedReleaseInfo(info)
    if (release) {
      updateConfig((current) => ({
        ...current,
        pendingPostUpdateRelease: release,
      }))
    }
    setUpdateState({
      status: 'downloaded',
      release,
      wasManualCheck: currentUpdateState.wasManualCheck,
    })
  })
  autoUpdater.on('error', (error) => {
    setUpdateState({
      status: 'error',
      message: error == null ? 'Unknown update error' : String(error),
      release: currentUpdateState.release,
      wasManualCheck: currentUpdateState.wasManualCheck,
    })
  })
}

async function checkForAppUpdates(manual: boolean): Promise<void> {
  if (!isUpdaterSupported) {
    setUpdateState({ status: 'unsupported' })
    return
  }

  const preference = readConfig().autoUpdatePreference
  currentCheckWasManual = manual
  autoUpdater.autoDownload = preference === 'enabled'
  await autoUpdater.checkForUpdates()
}

async function startUpdateCheck(manual: boolean): Promise<void> {
  if (hasStartedUpdateCheck) return

  hasStartedUpdateCheck = true

  try {
    await checkForAppUpdates(manual)
  } catch (error) {
    hasStartedUpdateCheck = false
    setUpdateState({
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
      wasManualCheck: manual,
    })
  }
}

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

  mainWindow.webContents.once('did-finish-load', () => {
    void startUpdateCheck(false)
    scheduleGithubStarPrompt()
  })
}

// ── IPC: API key persistence ──────────────────────────────────────────────────

ipcMain.handle('store:getApiKey', () => {
  return readConfig().apiKey ?? ''
})

ipcMain.handle('store:setApiKey', (_event, key: string) => {
  writeConfig({ ...readConfig(), apiKey: key })
})

ipcMain.handle('updates:getStartupState', () => {
  const config = readConfig()
  return {
    autoUpdatePreference: config.autoUpdatePreference ?? null,
    updateState: currentUpdateState,
    postUpdateRelease: getReleaseToShowOnStartup(),
    currentVersion: app.getVersion(),
    isUpdaterSupported,
    shouldShowTutorial: config.hasCompletedTutorial !== true,
    githubStarPrompt: getGithubStarPromptState(),
  }
})

ipcMain.handle('tutorial:markCompleted', () => {
  updateConfig((current) => ({
    ...current,
    hasCompletedTutorial: true,
  }))
})

ipcMain.handle('engagement:dismissGithubStarPrompt', () => {
  clearGithubStarPromptTimer()
  const sessionOpenMs = appOpenStartedAt ? Math.max(0, Date.now() - appOpenStartedAt) : 0
  updateConfig((current) => ({
    ...current,
    githubStarPrompt: {
      accumulatedOpenMs:
        (current.githubStarPrompt?.accumulatedOpenMs ?? 0) + sessionOpenMs,
      dismissed: true,
    },
  }))
  appOpenStartedAt = Date.now()
})

ipcMain.handle('engagement:openGithubRepo', async () => {
  await shell.openExternal(GITHUB_REPO_URL)
})

ipcMain.handle('updates:setAutoUpdatePreference', async (_event, enabled: boolean) => {
  updateConfig((current) => ({
    ...current,
    autoUpdatePreference: enabled ? 'enabled' : 'disabled',
  }))

  hasStartedUpdateCheck = false
  await startUpdateCheck(true)
})

ipcMain.handle('updates:checkNow', async () => {
  hasStartedUpdateCheck = false
  await startUpdateCheck(true)
})

ipcMain.handle('updates:downloadUpdate', async () => {
  if (!isUpdaterSupported) return
  setUpdateState({
    status: 'downloading',
    progressPercent: 0,
    release: currentUpdateState.release,
  })
  await autoUpdater.downloadUpdate()
})

ipcMain.handle('updates:installUpdate', () => {
  if (!isUpdaterSupported) return
  autoUpdater.quitAndInstall()
})

ipcMain.handle('updates:markReleaseNotesShown', (_event, version: string) => {
  updateConfig((current) => ({
    ...current,
    lastSeenReleaseNotesVersion: version,
    pendingPostUpdateRelease:
      current.pendingPostUpdateRelease?.version === version ? undefined : current.pendingPostUpdateRelease,
  }))
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
  appOpenStartedAt = Date.now()

  if (process.platform === 'darwin') {
    const iconPath = resolveIconPath()
    if (iconPath) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }

  configureAutoUpdater()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async () => {
  clearGithubStarPromptTimer()
  persistAppOpenTime()

  if (lyriaSession) {
    await lyriaSession.stop()
    lyriaSession = null
  }
  if (vocalsClient) {
    vocalsClient.disconnect()
    vocalsClient = null
  }
})
