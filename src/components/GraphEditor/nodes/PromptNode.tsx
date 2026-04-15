import { useCallback, useRef } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import type { PromptNodeData } from '@/types/graph'
import { useGraphStore } from '@/store/graphStore'

export function PromptNode({ id, data, selected }: NodeProps) {
  const nodeData = data as PromptNodeData
  const updateNodeData = useGraphStore((s) => s.updateNodeData)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const handleBlur = useCallback(() => {
    if (textareaRef.current) {
      updateNodeData(id, { text: textareaRef.current.value })
    }
  }, [id, updateNodeData])

  return (
    <div
      className={`w-48 rounded-lg border bg-studio-card p-3 shadow-lg transition-all ${
        selected ? 'border-violet-500 shadow-violet-500/20' : 'border-studio-border'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-violet-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-violet-300">
          Prompt
        </span>
      </div>
      <textarea
        key={`${id}:${nodeData.text}`}
        ref={textareaRef}
        defaultValue={nodeData.text}
        onBlur={handleBlur}
        placeholder="Describe the sound…"
        rows={3}
        className="nodrag w-full resize-none rounded bg-zinc-900 px-2 py-1.5 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-violet-500"
      />
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-studio-border !bg-zinc-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-violet-500 !bg-violet-800"
      />
    </div>
  )
}
