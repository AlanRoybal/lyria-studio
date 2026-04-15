import { useCallback } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  EdgeProps,
  useReactFlow,
} from '@xyflow/react'
import { X } from 'lucide-react'
import { useGraphStore } from '@/store/graphStore'

export function WeightedEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps) {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  const weight = (data as { weight: number })?.weight ?? 1.0
  const updateEdgeWeight = useGraphStore((s) => s.updateEdgeWeight)
  const targetNode = useGraphStore((s) => s.nodes.find((n) => n.id === target))
  const sourceNode = useGraphStore((s) => s.nodes.find((n) => n.id === source))
  const { deleteElements } = useReactFlow()

  // Weight control is only meaningful on the final edge into the output node.
  // Prompt-to-prompt edges are structural chains — only the terminal edge weight
  // reaches the Lyria API, so showing a slider on intermediate edges is misleading.
  const isTerminal = targetNode?.type === 'outputNode'
  const isPromptToPrompt =
    sourceNode?.type === 'promptNode' && targetNode?.type === 'promptNode'

  const handleWeightChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateEdgeWeight(id, parseFloat(e.target.value))
    },
    [id, updateEdgeWeight]
  )

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      deleteElements({ edges: [{ id }] })
    },
    [id, deleteElements]
  )

  return (
    <>
      <BaseEdge
        path={edgePath}
        style={
          isPromptToPrompt
            ? { stroke: 'rgba(139,92,246,0.35)', strokeWidth: 1.5, strokeDasharray: '4 3' }
            : { stroke: `rgba(139,92,246,${0.3 + weight * 0.7})`, strokeWidth: 1 + weight * 2 }
        }
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: 'all',
          }}
          className="nodrag nopan flex flex-col items-center gap-0.5"
        >
          {isTerminal ? (
            // Full weight control on edges that feed the output
            <div className="flex items-center gap-1 rounded bg-zinc-900/90 px-1.5 py-0.5 shadow-lg ring-1 ring-studio-border">
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={weight}
                onChange={handleWeightChange}
                className="h-1.5 w-14 cursor-pointer accent-violet-500"
              />
              <span className="min-w-[2rem] text-center text-[10px] text-violet-300">
                {weight.toFixed(2)}
              </span>
              <button
                onClick={handleDelete}
                className="ml-0.5 flex items-center text-zinc-500 hover:text-red-400"
                title="Remove connection"
              >
                <X size={11} />
              </button>
            </div>
          ) : (
            // Structural (chaining) edge — just a delete button
            <button
              onClick={handleDelete}
              className="flex h-4 w-4 items-center justify-center rounded-full bg-zinc-900/80 text-zinc-600 opacity-0 ring-1 ring-studio-border transition-opacity hover:text-red-400 hover:opacity-100"
              title="Remove connection"
            >
              <X size={10} />
            </button>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}
