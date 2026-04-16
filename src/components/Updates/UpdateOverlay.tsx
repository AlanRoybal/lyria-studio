import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { AutoUpdatePreference, UpdateReleaseInfo, UpdateState } from '@/types/lyria'

interface UpdateOverlayProps {
  autoUpdatePreference: AutoUpdatePreference | null
  isUpdaterSupported: boolean
  updateState: UpdateState
  postUpdateRelease: UpdateReleaseInfo | null
  onChooseAutoUpdates: (enabled: boolean) => void
  onDownloadUpdate: () => void
  onInstallUpdate: () => void
  onDismissReleaseNotes: (version: string) => void
  onDismissError: () => void
}

function formatDate(value?: string): string | null {
  if (!value) return null

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null

  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(parsed)
}

function ReleaseNotes({ release }: { release: UpdateReleaseInfo }) {
  if (!release.releaseNotes.trim()) {
    return <p className="text-sm leading-6 text-zinc-300">Release notes were not included with this build.</p>
  }

  return (
    <div className="max-h-72 overflow-y-auto rounded-xl border border-white/10 bg-black/20 px-4 py-3">
      <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-zinc-200">
        {release.releaseNotes}
      </pre>
    </div>
  )
}

export function UpdateOverlay({
  autoUpdatePreference,
  isUpdaterSupported,
  updateState,
  postUpdateRelease,
  onChooseAutoUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onDismissReleaseNotes,
  onDismissError,
}: UpdateOverlayProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isUpdaterSupported) return null

  let title = ''
  let body: ReactNode = null
  let actions: ReactNode = null

  if (postUpdateRelease) {
    const publishedAt = formatDate(postUpdateRelease.publishedAt)
    title = `What’s New In ${postUpdateRelease.releaseName ?? `v${postUpdateRelease.version}`}`
    body = (
      <>
        <p className="text-sm leading-6 text-zinc-300">
          {publishedAt ? `Installed ${publishedAt}.` : 'Installed successfully.'} Here are the latest fixes and
          changes.
        </p>
        <ReleaseNotes release={postUpdateRelease} />
      </>
    )
    actions = (
      <button
        type="button"
        onClick={() => onDismissReleaseNotes(postUpdateRelease.version)}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
      >
        Continue
      </button>
    )
  } else if (updateState.status === 'available' && updateState.release) {
    const updateBehavior =
      autoUpdatePreference === 'enabled'
        ? 'Automatic downloading is enabled, but you can also start this update manually now.'
        : autoUpdatePreference === 'disabled'
        ? 'Automatic downloading is off. Install the latest release now, or skip it and be asked again later.'
        : 'Choose how you want updates handled going forward, or install this release right now.'
    title = `${updateState.release.releaseName ?? `v${updateState.release.version}`} Is Available`
    body = (
      <>
        <p className="text-sm leading-6 text-zinc-300">{updateBehavior}</p>
        <ReleaseNotes release={updateState.release} />
      </>
    )
    actions = (
      <>
        {autoUpdatePreference === null ? (
          <>
            <button
              type="button"
              onClick={() => onChooseAutoUpdates(false)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
            >
              Ask Me Each Time
            </button>
            <button
              type="button"
              onClick={() => onChooseAutoUpdates(true)}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
            >
              Enable Auto Updates
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => onChooseAutoUpdates(false)}
            className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
          >
            Maybe Later
          </button>
        )}
        <button
          type="button"
          onClick={onDownloadUpdate}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
        >
          Update Now
        </button>
      </>
    )
  } else if (updateState.status === 'checking') {
    title = 'Checking For Updates'
    body = <p className="text-sm leading-6 text-zinc-300">Looking for a newer GitHub release.</p>
  } else if (updateState.status === 'none' && updateState.wasManualCheck) {
    title = 'You’re Up To Date'
    body = (
      <p className="text-sm leading-6 text-zinc-300">
        {updateState.message ?? 'No newer release is available right now.'}
      </p>
    )
    actions = (
      <button
        type="button"
        onClick={onDismissError}
        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
      >
        Close
      </button>
    )
  } else if (autoUpdatePreference === null) {
    title = 'Enable Auto Updates?'
    body = (
      <p className="text-sm leading-6 text-zinc-300">
        When a new GitHub release is available, Lyria Studio can download it on startup and prompt you to restart
        into the latest version.
      </p>
    )
    actions = (
      <>
        <button
          type="button"
          onClick={() => onChooseAutoUpdates(false)}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
        >
          No, Ask Me Each Time
        </button>
        <button
          type="button"
          onClick={() => onChooseAutoUpdates(true)}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
        >
          Yes, Auto Update
        </button>
      </>
    )
  } else if (updateState.status === 'downloading') {
    const percent = Math.max(0, Math.min(100, Math.round(updateState.progressPercent ?? 0)))
    title = `Downloading ${updateState.release?.releaseName ?? 'Update'}`
    body = (
      <>
        <p className="text-sm leading-6 text-zinc-300">
          The latest release is downloading now. Restart will be available as soon as the package is ready.
        </p>
        <div className="space-y-2">
          <div className="h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-white transition-[width]" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-xs uppercase tracking-[0.22em] text-zinc-500">{percent}% complete</p>
        </div>
      </>
    )
  } else if (updateState.status === 'downloaded' && updateState.release) {
    title = `${updateState.release.releaseName ?? `v${updateState.release.version}`} Ready To Install`
    body = (
      <p className="text-sm leading-6 text-zinc-300">
        The update is ready. Restart now to install it, then Lyria Studio will reopen on the new version.
      </p>
    )
    actions = (
      <button
        type="button"
        onClick={onInstallUpdate}
        className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
      >
        Restart And Install
      </button>
    )
  } else if (updateState.status === 'error') {
    title = 'Update Check Failed'
    body = <p className="text-sm leading-6 text-zinc-300">{updateState.message ?? 'Unable to complete the update check.'}</p>
    actions = (
      <button
        type="button"
        onClick={onDismissError}
        className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
      >
        Close
      </button>
    )
  } else {
    return null
  }

  return createPortal(
    <div className="fixed inset-0 z-[3200] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <div className="w-full max-w-xl rounded-[28px] border border-white/10 bg-zinc-950/95 p-6 text-zinc-100 shadow-2xl">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Software Update</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
          </div>
          <div className="space-y-4">{body}</div>
          {actions && <div className="flex flex-wrap justify-end gap-3">{actions}</div>}
        </div>
      </div>
    </div>,
    document.body
  )
}
