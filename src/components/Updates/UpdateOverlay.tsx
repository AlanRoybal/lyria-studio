import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { UpdateReleaseInfo, UpdateState } from '@/types/lyria'

interface UpdateOverlayProps {
  isUpdaterSupported: boolean
  updateState: UpdateState
  postUpdateRelease: UpdateReleaseInfo | null
  onOpenReleasePage: () => void
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
  isUpdaterSupported,
  updateState,
  postUpdateRelease,
  onOpenReleasePage,
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
    title = `${updateState.release.releaseName ?? `v${updateState.release.version}`} Is Available`
    body = (
      <>
        <p className="text-sm leading-6 text-zinc-300">
          A newer version is available. Open the latest release page to download and replace the app manually.
        </p>
        <ReleaseNotes release={updateState.release} />
      </>
    )
    actions = (
        <button
          type="button"
          onClick={onOpenReleasePage}
          className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
        >
          Open Download Page
        </button>
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
  } else if (updateState.status === 'error') {
    title = 'Update Check Failed'
    body = (
      <p className="text-sm leading-6 text-zinc-300">
        {updateState.message ?? 'Unable to complete the update check.'}
      </p>
    )
    actions = (
      <>
        {updateState.requiresManualInstall && (
          <button
            type="button"
            onClick={onOpenReleasePage}
            className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
          >
            Open Download Page
          </button>
        )}
        <button
          type="button"
          onClick={onDismissError}
          className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
        >
          Close
        </button>
      </>
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
