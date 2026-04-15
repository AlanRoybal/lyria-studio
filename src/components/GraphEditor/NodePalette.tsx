import type { RefObject } from 'react'
import {
  MessageSquare,
  Piano,
  Mic,
  Volume2,
  Trash2,
  LucideIcon,
} from 'lucide-react'

interface PaletteItem {
  type: string
  label: string
  Icon: LucideIcon
  desc: string
  color: string
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'prompt',
    label: 'Prompt',
    Icon: MessageSquare,
    desc: 'Text description',
    color: 'border-violet-600 text-violet-300',
  },
  {
    type: 'instrument',
    label: 'Instrument',
    Icon: Piano,
    desc: 'Sonic category',
    color: 'border-emerald-600 text-emerald-300',
  },
  {
    type: 'vocals',
    label: 'Vocals',
    Icon: Mic,
    desc: 'Lyrics + prompts',
    color: 'border-rose-600 text-rose-300',
  },
  {
    type: 'output',
    label: 'Output',
    Icon: Volume2,
    desc: 'Final mix',
    color: 'border-amber-600 text-amber-300',
  },
]

interface NodePaletteProps {
  panelRef: RefObject<HTMLDivElement>
  showDeleteTarget?: boolean
  isDeleteTargetActive?: boolean
}

export function NodePalette({
  panelRef,
  showDeleteTarget = false,
  isDeleteTargetActive = false,
}: NodePaletteProps) {
  const handleDragStart = (e: React.DragEvent, nodeType: string) => {
    e.dataTransfer.setData('application/lyria-node-type', nodeType)
    e.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      ref={panelRef}
      data-tour-id="node-palette"
      className="flex w-44 flex-shrink-0 flex-col gap-1 border-r border-studio-border bg-studio-panel p-3"
    >
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
        Nodes
      </div>
      {PALETTE_ITEMS.map(({ type, label, Icon, desc, color }) => (
        <div
          key={type}
          draggable
          onDragStart={(e) => handleDragStart(e, type)}
          className={`cursor-grab rounded-lg border bg-studio-card px-3 py-2 transition-all hover:bg-zinc-800 active:cursor-grabbing ${color}`}
        >
          <div className="flex items-center gap-2">
            <Icon size={16} />
            <div>
              <div className="text-xs font-semibold">{label}</div>
              <div className="text-[10px] text-zinc-500">{desc}</div>
            </div>
          </div>
        </div>
      ))}
      {showDeleteTarget && (
        <div
          className={`mt-3 rounded-lg border border-dashed px-3 py-3 transition-all ${
            isDeleteTargetActive
              ? 'border-rose-500 bg-rose-950/60 text-rose-200'
              : 'border-zinc-700 bg-zinc-900/80 text-zinc-400'
          }`}
        >
          <div className="flex items-center gap-2">
            <Trash2 size={16} />
            <div>
              <div className="text-xs font-semibold">Trash</div>
              <div className="text-[10px]">
                {isDeleteTargetActive ? 'Release to delete node' : 'Drag a node here to delete'}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="mt-4 text-[10px] text-zinc-600">
        Drag nodes onto the canvas, then connect them
      </div>
    </div>
  )
}
