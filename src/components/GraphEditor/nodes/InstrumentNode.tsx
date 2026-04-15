import { useCallback } from 'react'
import { Handle, Position, NodeProps } from '@xyflow/react'
import {
  Piano,
  Guitar,
  Drum,
  Mic,
  Music,
  Music2,
  Music3,
  Music4,
  Waves,
  Sparkles,
  LucideIcon,
} from 'lucide-react'
import type { InstrumentNodeData } from '@/types/graph'
import { useGraphStore } from '@/store/graphStore'

const INSTRUMENT_ICONS: Record<string, LucideIcon> = {
  Piano: Piano,
  Guitar: Guitar,
  Strings: Music2,
  Brass: Music3,
  'Synth Pad': Waves,
  Drums: Drum,
  Bass: Music4,
  Choir: Mic,
  Flute: Music,
  Ambient: Sparkles,
}

export function InstrumentNode({ id, data, selected }: NodeProps) {
  const nodeData = data as InstrumentNodeData
  const updateNodeData = useGraphStore((s) => s.updateNodeData)

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateNodeData(id, { instrument: e.target.value })
    },
    [id, updateNodeData]
  )

  const Icon = INSTRUMENT_ICONS[nodeData.instrument] ?? Music

  return (
    <div
      className={`w-44 rounded-lg border bg-studio-card p-3 shadow-lg transition-all ${
        selected ? 'border-emerald-500 shadow-emerald-500/20' : 'border-studio-border'
      }`}
    >
      <div className="mb-2 flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400" />
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-300">
          Instrument
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Icon size={18} className="text-emerald-300" />
        <input
          type="text"
          value={nodeData.instrument}
          onChange={handleChange}
          placeholder="e.g. Piano, 808, mellotron…"
          className="nodrag min-w-0 flex-1 rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-200 placeholder-zinc-600 outline-none focus:ring-1 focus:ring-emerald-500"
        />
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-studio-border !bg-zinc-700"
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-emerald-500 !bg-emerald-800"
      />
    </div>
  )
}
