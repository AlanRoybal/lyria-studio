import { useState, useCallback } from 'react'
import { Check, Eye, EyeOff, Redo2, Undo2 } from 'lucide-react'
import { useHistoryStore } from '@/store/historyStore'
import { useSessionStore } from '@/store/sessionStore'
import { Tooltip } from '@/components/ui/Tooltip'

interface ToolbarProps {
  onStartRecording: () => void
  onStopRecording: () => void
  onCheckUpdates: () => void
}

const STATUS_CONFIG = {
  disconnected: { dot: 'bg-zinc-500',             label: 'Ready',        labelClass: 'text-zinc-500'   },
  connecting:   { dot: 'bg-yellow-400 animate-pulse', label: 'Connecting…', labelClass: 'text-yellow-400' },
  connected:    { dot: 'bg-violet-400 animate-pulse', label: 'Live',        labelClass: 'text-violet-400' },
  error:        { dot: 'bg-red-400',              label: 'Error',        labelClass: 'text-red-400'    },
} as const

export function Toolbar({
  onStartRecording: _onStart,
  onStopRecording: _onStop,
  onCheckUpdates,
}: ToolbarProps) {
  const connectionStatus = useSessionStore((s) => s.connectionStatus)
  const errorMessage = useSessionStore((s) => s.errorMessage)
  const canUndo = useHistoryStore((s) => s.canUndo)
  const canRedo = useHistoryStore((s) => s.canRedo)
  const undo = useHistoryStore((s) => s.undo)
  const redo = useHistoryStore((s) => s.redo)
  const [apiKeyInput, setApiKeyInput] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [saved, setSaved] = useState(false)

  const status = STATUS_CONFIG[connectionStatus]

  const handleSaveKey = useCallback(async () => {
    const key = apiKeyInput.trim()
    if (!key) return
    await window.store.setApiKey(key)
    useSessionStore.getState().setApiKey(key)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }, [apiKeyInput])

  return (
    <div className="flex items-center gap-3 border-b border-studio-border bg-studio-panel pl-20 pr-4" style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}>
      {/* Logo */}
      <Tooltip text="Lyria Studio" position="bottom">
        <div
          className="flex items-center gap-2 pr-3"
          style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
        >
          <img
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="Lyria Studio"
            className="h-5 w-5 rounded-[4px]"
          />
          <span className="text-sm font-bold tracking-wider text-white">Lyria Studio</span>
        </div>
      </Tooltip>

      <div className="h-5 w-px bg-studio-border" />

      <div
        className="flex items-center gap-1"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip text="Undo (Cmd/Ctrl+Z)" position="bottom">
          <button
            onClick={undo}
            disabled={!canUndo}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            aria-label="Undo"
          >
            <Undo2 size={14} />
          </button>
        </Tooltip>
        <Tooltip text="Redo (Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y)" position="bottom">
          <button
            onClick={redo}
            disabled={!canRedo}
            className="flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-800 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-400"
            aria-label="Redo"
          >
            <Redo2 size={14} />
          </button>
        </Tooltip>
      </div>

      <div className="h-5 w-px bg-studio-border" />

      {/* API Key + status */}
      <div
        className="flex items-center gap-2"
        data-tour-id="api-key"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Gemini Key
        </span>

        {/* Status pill */}
        <div className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 ring-1 ${
          connectionStatus === 'connected'
            ? 'bg-violet-950/50 ring-violet-800'
            : connectionStatus === 'connecting'
            ? 'bg-yellow-950/50 ring-yellow-800'
            : connectionStatus === 'error'
            ? 'bg-red-950/50 ring-red-800'
            : 'bg-zinc-900 ring-studio-border'
        }`}>
          <div className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
          <span className={`text-[10px] font-semibold ${status.labelClass}`}>
            {status.label}
          </span>
        </div>

        {/* Key input — hide while connected/connecting */}
        {connectionStatus !== 'connected' && connectionStatus !== 'connecting' && (
          <>
            <input
              type={showKey ? 'text' : 'password'}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSaveKey()}
              placeholder="Enter Gemini API key…"
              className="h-7 w-56 rounded border border-studio-border bg-studio-card px-2 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500"
            />
            <Tooltip text={showKey ? 'Hide API key' : 'Show API key'} position="bottom">
              <button
                onClick={() => setShowKey((v) => !v)}
                className="flex h-7 w-7 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                aria-label={showKey ? 'Hide API key' : 'Show API key'}
              >
                {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </Tooltip>
            <Tooltip text="Save key and use for live sessions" position="bottom">
              <button
                onClick={handleSaveKey}
                disabled={!apiKeyInput.trim()}
                className="flex h-7 items-center gap-1 rounded bg-zinc-700 px-3 text-xs font-semibold text-white transition-colors hover:bg-zinc-600 disabled:opacity-40"
              >
                {saved ? (
                  <>
                    <Check size={12} /> Saved
                  </>
                ) : (
                  'Save Key'
                )}
              </button>
            </Tooltip>
          </>
        )}

        {/* Error message */}
        {connectionStatus === 'error' && errorMessage && (
          <span
            className="max-w-xs truncate text-[10px] text-red-400"
            title={errorMessage}
          >
            {errorMessage}
          </span>
        )}
      </div>
      <div className="h-5 w-px bg-studio-border" />
      <div
        className="flex items-center"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <Tooltip text="Check for app updates" position="bottom">
          <button
            type="button"
            onClick={onCheckUpdates}
            className="rounded border border-zinc-700 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-300 transition hover:border-zinc-500 hover:bg-zinc-900 hover:text-white"
          >
            Updates
          </button>
        </Tooltip>
      </div>
      <div className="flex-1" />
    </div>
  )
}
