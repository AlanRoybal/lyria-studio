import { Handle, Position, NodeProps } from '@xyflow/react'
import { Volume2 } from 'lucide-react'

export function OutputNode({ selected }: NodeProps) {
  return (
    <div
      className={`flex h-16 w-16 items-center justify-center rounded-full border-2 bg-studio-card shadow-lg transition-all ${
        selected ? 'border-amber-400 shadow-amber-400/30' : 'border-amber-600'
      }`}
    >
      <div className="flex flex-col items-center gap-0.5">
        <Volume2 size={18} className="text-amber-400" />
        <div className="text-[9px] font-bold uppercase tracking-wider text-amber-400">Out</div>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-amber-600 !bg-amber-900"
      />
    </div>
  )
}
