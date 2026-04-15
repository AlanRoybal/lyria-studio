import { useCallback } from 'react'
import { X, SlidersHorizontal } from 'lucide-react'
import { useGraphStore } from '@/store/graphStore'
import type { PromptNodeData, InstrumentNodeData, VocalsNodeData } from '@/types/graph'
import { Tooltip } from '@/components/ui/Tooltip'

export function PropertiesPanel() {
  const { nodes, selectedNodeId, updateNodeData, deleteNode, setSelectedNode } = useGraphStore()

  const selectedNode = nodes.find((n) => n.id === selectedNodeId)

  const handleDelete = useCallback(() => {
    if (selectedNodeId) deleteNode(selectedNodeId)
  }, [selectedNodeId, deleteNode])

  if (!selectedNode) {
    return (
      <div
        className="flex h-full flex-col items-center justify-center gap-2 border-l border-studio-border bg-studio-panel p-4 text-center"
        data-tour-id="properties-panel"
      >
        <SlidersHorizontal size={28} className="text-zinc-600" />
        <div className="text-xs text-zinc-500">
          Select a node to edit its properties
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col border-l border-studio-border bg-studio-panel" data-tour-id="properties-panel">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-studio-border px-4 py-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Properties
        </div>
        <Tooltip text="Close panel" position="bottom">
          <button
            onClick={() => setSelectedNode(null)}
            className="flex h-6 w-6 items-center justify-center rounded text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
            aria-label="Close panel"
          >
            <X size={14} />
          </button>
        </Tooltip>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {/* Node type badge */}
        <div className="mb-4">
          {selectedNode.type === 'promptNode' && (
            <span className="rounded-full bg-violet-900/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-violet-300 ring-1 ring-violet-700">
              Prompt Node
            </span>
          )}
          {selectedNode.type === 'instrumentNode' && (
            <span className="rounded-full bg-emerald-900/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-emerald-300 ring-1 ring-emerald-700">
              Instrument Node
            </span>
          )}
          {selectedNode.type === 'vocalsNode' && (
            <span className="rounded-full bg-rose-900/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-rose-300 ring-1 ring-rose-700">
              Vocals Node
            </span>
          )}
          {selectedNode.type === 'outputNode' && (
            <span className="rounded-full bg-amber-900/50 px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-300 ring-1 ring-amber-700">
              Output Node
            </span>
          )}
        </div>

        {/* PromptNode properties */}
        {selectedNode.type === 'promptNode' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Prompt Text
              </label>
              <textarea
                key={`${selectedNode.id}:text:${(selectedNode.data as PromptNodeData).text}`}
                defaultValue={(selectedNode.data as PromptNodeData).text}
                onBlur={(e) => updateNodeData(selectedNode.id, { text: e.target.value })}
                placeholder="Describe the sound, mood, or texture…"
                rows={6}
                className="w-full resize-none rounded border border-studio-border bg-studio-card px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-violet-500"
              />
              <div className="mt-1 text-[10px] text-zinc-600">
                Examples: "soft piano", "driving techno beat", "lush orchestral strings"
              </div>
            </div>
          </div>
        )}

        {/* InstrumentNode properties */}
        {selectedNode.type === 'instrumentNode' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Instrument
              </label>
              <input
                type="text"
                value={(selectedNode.data as InstrumentNodeData).instrument}
                onChange={(e) =>
                  updateNodeData(selectedNode.id, { instrument: e.target.value })
                }
                placeholder="Type any instrument…"
                className="w-full rounded border border-studio-border bg-studio-card px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-emerald-500"
              />
              <div className="mt-1 text-[10px] text-zinc-600">
                Any instrument the model should play — e.g. "808", "mellotron", "sitar".
              </div>
            </div>
          </div>
        )}

        {/* VocalsNode properties */}
        {selectedNode.type === 'vocalsNode' && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Lyrics
              </label>
              <textarea
                key={`${selectedNode.id}:lyrics:${(selectedNode.data as VocalsNodeData).lyrics}`}
                defaultValue={(selectedNode.data as VocalsNodeData).lyrics}
                onBlur={(e) => updateNodeData(selectedNode.id, { lyrics: e.target.value })}
                placeholder="Type the lyrics for the vocals…"
                rows={6}
                className="w-full resize-none rounded border border-studio-border bg-studio-card px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-rose-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                Additional Prompts
              </label>
              <textarea
                key={`${selectedNode.id}:prompts:${(selectedNode.data as VocalsNodeData).additionalPrompts}`}
                defaultValue={(selectedNode.data as VocalsNodeData).additionalPrompts}
                onBlur={(e) =>
                  updateNodeData(selectedNode.id, { additionalPrompts: e.target.value })
                }
                placeholder="Voice character, style, delivery, mood…"
                rows={4}
                className="w-full resize-none rounded border border-studio-border bg-studio-card px-3 py-2 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-rose-500"
              />
              <div className="mt-1 text-[10px] text-zinc-600">
                When connected to the Output, uses the Lyria 3 Pro Preview model. Vocals and
                Instrument nodes cannot be connected.
              </div>
            </div>
          </div>
        )}

        {/* OutputNode properties */}
        {selectedNode.type === 'outputNode' && (
          <div className="text-xs text-zinc-500">
            The Output node is the final destination for your audio signal graph. Connect instrument
            nodes here to include them in the generated music.
          </div>
        )}
      </div>

      {/* Footer: delete */}
      {selectedNode.type !== 'outputNode' && (
        <div className="border-t border-studio-border p-4">
          <Tooltip text="Remove this node from the graph" position="top">
            <button
              onClick={handleDelete}
              className="w-full rounded border border-red-900 bg-red-950/30 px-3 py-2 text-xs text-red-400 transition-colors hover:bg-red-900/50 hover:text-red-300"
            >
              Delete Node
            </button>
          </Tooltip>
        </div>
      )}
    </div>
  )
}
