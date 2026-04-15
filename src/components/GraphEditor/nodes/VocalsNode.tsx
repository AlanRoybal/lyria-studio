import { useCallback, useRef } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import type { VocalsNodeData } from '@/types/graph'
import { useGraphStore } from '@/store/graphStore'

export function VocalsNode({ id, data, selected }: NodeProps) {
  const nodeData = data as VocalsNodeData
  const updateNodeData = useGraphStore((s) => s.updateNodeData)
  const lyricsRef = useRef<HTMLTextAreaElement>(null)
  const promptsRef = useRef<HTMLTextAreaElement>(null)

  const handleLyricsBlur = useCallback(() => {
    if (lyricsRef.current) {
      updateNodeData(id, { lyrics: lyricsRef.current.value })
    }
  }, [id, updateNodeData])

  const handlePromptsBlur = useCallback(() => {
    if (promptsRef.current) {
      updateNodeData(id, { additionalPrompts: promptsRef.current.value })
    }
  }, [id, updateNodeData])

  return (
    <div
      className={`w-52 rounded-lg border bg-studio-card p-3 shadow-lg transition-all ${
        selected ? 'border-rose-500 shadow-rose-500/20' : 'border-studio-border'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-rose-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-rose-300">
          Vocals
        </span>
      </div>
      <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        Lyrics
      </label>
      <textarea
        key={`${id}:lyrics:${nodeData.lyrics}`}
        ref={lyricsRef}
        defaultValue={nodeData.lyrics}
        onBlur={handleLyricsBlur}
        placeholder="Type your lyrics…"
        rows={3}
        className="nodrag mb-2 w-full resize-none rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-rose-500"
      />
      <label className="mb-1 block text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
        Additional prompts
      </label>
      <textarea
        key={`${id}:prompts:${nodeData.additionalPrompts}`}
        ref={promptsRef}
        defaultValue={nodeData.additionalPrompts}
        onBlur={handlePromptsBlur}
        placeholder="Voice character, style, mood…"
        rows={2}
        className="nodrag w-full resize-none rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-rose-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-studio-border !bg-zinc-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-rose-500 !bg-rose-800"
      />
    </div>
  )
}
