import { useState, useCallback, useEffect, useRef } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTimelineStore } from '@/store/timelineStore'
import { Tooltip } from '@/components/ui/Tooltip'
import {
  renderMixdown,
  encodeWav,
  getSupportedMediaExportFormat,
  recordMediaFromBuffer,
  saveBlob,
} from '@/audio/Exporter'

export function ExportButton() {
  const [exportMenuOpen, setExportMenuOpen] = useState(false)
  const [exportState, setExportState] = useState<
    { phase: 'idle' } | { phase: 'rendering' } | { phase: 'encoding'; progress: number; format: string }
  >({ phase: 'idle' })
  const [exportError, setExportError] = useState<string | null>(null)
  const exportMenuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!exportMenuOpen) return
    const onClick = (e: MouseEvent) => {
      if (!exportMenuRef.current?.contains(e.target as Node)) setExportMenuOpen(false)
    }
    window.addEventListener('mousedown', onClick)
    return () => window.removeEventListener('mousedown', onClick)
  }, [exportMenuOpen])

  const hasExportableClips = useTimelineStore((s) =>
    s.tracks.some((t) => t.clips.some((c) => c.audioBuffer))
  )
  const supportedCompressedFormat = getSupportedMediaExportFormat()
  const isExporting = exportState.phase !== 'idle'

  const buildFilename = (ext: string) => {
    const ts = new Date()
      .toISOString()
      .replace(/[:T]/g, '-')
      .replace(/\..+$/, '')
    return `lyria-mix-${ts}.${ext}`
  }

  const handleExport = useCallback(
    async (format: 'wav' | 'compressed') => {
      setExportMenuOpen(false)
      setExportError(null)
      try {
        setExportState({ phase: 'rendering' })
        const tracks = useTimelineStore.getState().tracks
        const buffer = await renderMixdown(tracks)

        if (format === 'wav') {
          const blob = encodeWav(buffer)
          await saveBlob(blob, buildFilename('wav'), [{ name: 'WAV Audio', extensions: ['wav'] }])
        } else {
          if (!supportedCompressedFormat) {
            throw new Error('Compressed export is not supported in this runtime')
          }

          setExportState({ phase: 'encoding', progress: 0, format: supportedCompressedFormat.ext })
          const { blob, extension } = await recordMediaFromBuffer(buffer, (progress) => {
            setExportState((current) =>
              current.phase === 'encoding'
                ? { ...current, progress }
                : { phase: 'encoding', progress, format: supportedCompressedFormat.ext }
            )
          })
          await saveBlob(blob, buildFilename(extension), [
            {
              name: extension.toLowerCase() === 'mp4' ? 'MP4 Audio' : 'WebM Audio',
              extensions: [extension],
            },
          ])
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        setExportError(msg)
        setTimeout(() => setExportError(null), 4000)
      } finally {
        setExportState({ phase: 'idle' })
      }
    },
    [supportedCompressedFormat]
  )

  return (
    <div ref={exportMenuRef} className="relative shrink-0">
      <Tooltip
        text={
          !hasExportableClips
            ? 'Add audio clips to enable export'
            : 'Export all tracks as a single file'
        }
        position="top"
      >
        <button
          onClick={() => setExportMenuOpen((v) => !v)}
          disabled={!hasExportableClips || isExporting}
          className="flex h-8 items-center gap-1.5 rounded border border-studio-border bg-studio-card px-2.5 text-xs font-semibold text-zinc-200 transition-colors hover:bg-zinc-800 disabled:opacity-40"
        >
          {isExporting ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
          {exportState.phase === 'rendering'
            ? 'Rendering…'
            : exportState.phase === 'encoding'
            ? `Encoding ${exportState.format.toUpperCase()} ${Math.round(exportState.progress * 100)}%`
            : 'Export Song'}
        </button>
      </Tooltip>

      {exportMenuOpen && !isExporting && (
        <div className="absolute right-0 bottom-10 z-50 w-56 overflow-hidden rounded-md border border-studio-border bg-studio-panel shadow-xl">
          <button
            onClick={() => handleExport('wav')}
            className="flex w-full flex-col items-start gap-0.5 border-b border-studio-border px-3 py-2 text-left transition-colors hover:bg-zinc-800"
          >
            <span className="text-xs font-semibold text-zinc-100">WAV (48 kHz, 16-bit)</span>
            <span className="text-[10px] text-zinc-500">Lossless offline render</span>
          </button>
          <button
            onClick={() => handleExport('compressed')}
            disabled={!supportedCompressedFormat}
            className="flex w-full flex-col items-start gap-0.5 px-3 py-2 text-left transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="text-xs font-semibold text-zinc-100">
              {supportedCompressedFormat?.label ?? 'Compressed Export Unavailable'}
            </span>
            <span className="text-[10px] text-zinc-500">
              {supportedCompressedFormat
                ? 'Compressed realtime encode'
                : 'This runtime does not expose a supported encoder'}
            </span>
          </button>
        </div>
      )}

      {exportError && (
        <div className="absolute right-0 bottom-10 z-50 w-64 rounded-md border border-red-800 bg-red-950/90 px-3 py-2 text-[11px] text-red-300 shadow-xl">
          {exportError}
        </div>
      )}
    </div>
  )
}
