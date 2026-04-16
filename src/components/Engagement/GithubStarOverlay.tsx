import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface GithubStarOverlayProps {
  isOpen: boolean
  onConfirm: () => void
  onDismiss: () => void
}

export function GithubStarOverlay({ isOpen, onConfirm, onDismiss }: GithubStarOverlayProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted || !isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-[3250] flex items-center justify-center bg-black/65 px-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[28px] border border-white/10 bg-zinc-950/95 p-6 text-zinc-100 shadow-2xl">
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-[11px] uppercase tracking-[0.28em] text-zinc-500">Support Lyria Studio</p>
            <h2 className="text-2xl font-semibold tracking-tight text-white">Star the GitHub repo?</h2>
          </div>
          <p className="text-sm leading-6 text-zinc-300">
            If Lyria Studio has been useful, a GitHub star helps more people find it.
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onDismiss}
              className="rounded-xl border border-white/10 px-4 py-2 text-sm font-medium text-zinc-200 transition hover:border-white/25 hover:bg-white/5"
            >
              No
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-xl bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
            >
              Yes, Star It
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
