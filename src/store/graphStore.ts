import { create } from 'zustand'
import {
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  NodeChange,
  EdgeChange,
  addEdge,
  Connection,
} from '@xyflow/react'
import type {
  PromptNodeData,
  InstrumentNodeData,
  OutputNodeData,
  VocalsNodeData,
  EdgeData,
} from '@/types/graph'
import { VOCALS_SYSTEM_PROMPT } from '@/types/graph'
import {
  registerGraphHistoryAdapter,
  useHistoryStore,
} from '@/store/historyStore'
import { playUiSound } from '@/audio/UiSounds'

let nodeCounter = 0

const genId = (prefix: string, existingIds: Set<string>) => {
  let candidate = ''

  do {
    candidate = `${prefix}-${++nodeCounter}`
  } while (existingIds.has(candidate))

  return candidate
}

type AppNode = Node<PromptNodeData | InstrumentNodeData | OutputNodeData | VocalsNodeData>
type AppEdge = Edge<EdgeData>

const hasMeaningfulNodeChanges = (changes: NodeChange<AppNode>[]) =>
  changes.some((change) => change.type !== 'select')

const hasMeaningfulEdgeChanges = (changes: EdgeChange[]) =>
  changes.some((change) => change.type !== 'select')

export interface SplitPrompts {
  instrumentPrompts: Array<{ text: string; weight: number }>
  vocalsPrompts: Array<{ text: string; weight: number }>
}

interface GraphState {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
  computeWeightedPrompts(): Array<{ text: string; weight: number }>
  computeSplitPrompts(): SplitPrompts
  isValidConnection(connection: Connection | Edge): boolean
  onNodesChange(changes: NodeChange<AppNode>[]): void
  onEdgesChange(changes: EdgeChange[]): void
  onConnect(connection: Connection): void
  addNode(
    type: 'prompt' | 'instrument' | 'output' | 'vocals',
    position: { x: number; y: number }
  ): void
  updateNodeData(
    id: string,
    data: Partial<PromptNodeData | InstrumentNodeData | VocalsNodeData>
  ): void
  updateEdgeWeight(id: string, weight: number): void
  setSelectedNode(id: string | null): void
  deleteNode(id: string): void
}

export const useGraphStore = create<GraphState>((set, get) => ({
  nodes: [
    {
      id: 'output-1',
      type: 'outputNode',
      position: { x: 600, y: 250 },
      data: { label: 'Output' } as OutputNodeData,
    },
  ],
  edges: [],
  selectedNodeId: null,

  // Returns the prompts used by the realtime streaming session. Vocals are
  // handled out-of-band via a separate REST call (see computeSplitPrompts).
  computeWeightedPrompts() {
    return get().computeSplitPrompts().instrumentPrompts
  },

  computeSplitPrompts() {
    // Split the graph into two independent prompt sets:
    //   - instrumentPrompts: prompts/instruments that reach the Output via a path
    //     that does NOT pass through any Vocals node. Fed to the realtime model.
    //   - vocalsPrompts:     prompts/vocals that reach the Output via a path that
    //     passes through a Vocals node. Fed to the REST vocals model.
    // A prompt feeding both sides (e.g. a shared style prompt forked into both
    // an instrument chain and a vocals chain) contributes to both sets.
    const { nodes, edges } = get()
    const outputIds = new Set(nodes.filter((n) => n.type === 'outputNode').map((n) => n.id))
    const nodeById = new Map(nodes.map((n) => [n.id, n]))

    const outgoing = new Map<string, string[]>()
    for (const e of edges) {
      if (!outgoing.has(e.source)) outgoing.set(e.source, [])
      outgoing.get(e.source)!.push(e.target)
    }

    const edgesBySource = new Map<string, AppEdge[]>()
    for (const edge of edges) {
      if (!edgesBySource.has(edge.source)) edgesBySource.set(edge.source, [])
      edgesBySource.get(edge.source)!.push(edge)
    }
    const weightFor = (nodeId: string): number => {
      const out = edgesBySource.get(nodeId)
      if (!out || out.length === 0) return 1.0
      return (out[0].data as EdgeData)?.weight ?? 1.0
    }

    // For each node, determine whether it can reach Output through a path
    // that (a) goes through a Vocals node and/or (b) does not. Cycle-safe via
    // memoization with a pending sentinel.
    type Reach = { viaV: boolean; viaN: boolean }
    const memo = new Map<string, Reach>()

    const reach = (id: string): Reach => {
      const cached = memo.get(id)
      if (cached) return cached
      if (outputIds.has(id)) {
        const r: Reach = { viaV: false, viaN: true }
        memo.set(id, r)
        return r
      }
      // Seed with pending-false to break cycles.
      memo.set(id, { viaV: false, viaN: false })
      let viaV = false
      let viaN = false
      for (const t of outgoing.get(id) ?? []) {
        const { viaV: tv, viaN: tn } = reach(t)
        const targetIsVocals = nodeById.get(t)?.type === 'vocalsNode'
        if (targetIsVocals) {
          // Any path from t to output is credited as "via vocals" for us.
          if (tv || tn) viaV = true
        } else {
          if (tv) viaV = true
          if (tn) viaN = true
        }
      }
      const r: Reach = { viaV, viaN }
      memo.set(id, r)
      return r
    }

    const instrumentPrompts: Array<{ text: string; weight: number }> = []
    const vocalsPrompts: Array<{ text: string; weight: number }> = []
    let vocalsSideHasVocalsContent = false

    for (const node of nodes) {
      const weight = weightFor(node.id)
      if (weight <= 0) continue
      const r = reach(node.id)

      if (node.type === 'promptNode') {
        const text = (node.data as PromptNodeData).text?.trim()
        if (!text) continue
        if (r.viaN) instrumentPrompts.push({ text, weight })
        if (r.viaV) vocalsPrompts.push({ text, weight })
      } else if (node.type === 'instrumentNode') {
        const instrument = (node.data as InstrumentNodeData).instrument
        if (!instrument) continue
        // Vocals/instrument connections are blocked, so an instrument never
        // reaches output via a vocals path — but guard anyway.
        if (r.viaN) instrumentPrompts.push({ text: instrument, weight })
      } else if (node.type === 'vocalsNode') {
        if (!(r.viaV || r.viaN)) continue
        const vData = node.data as VocalsNodeData
        const lyrics = vData.lyrics?.trim()
        const extra = vData.additionalPrompts?.trim()
        const parts: string[] = []
        if (lyrics) parts.push(`Lyrics: ${lyrics}`)
        if (extra) parts.push(extra)
        if (parts.length === 0) continue
        vocalsPrompts.push({ text: parts.join('. '), weight })
        vocalsSideHasVocalsContent = true
      }
    }

    if (vocalsSideHasVocalsContent) {
      vocalsPrompts.push({ text: VOCALS_SYSTEM_PROMPT, weight: 1.0 })
    }

    console.log('[graphStore] computeSplitPrompts:', {
      instrumentPrompts,
      vocalsPrompts,
    })
    return { instrumentPrompts, vocalsPrompts }
  },

  isValidConnection(connection) {
    const { nodes } = get()
    const src = nodes.find((n) => n.id === connection.source)
    const tgt = nodes.find((n) => n.id === connection.target)
    if (!src || !tgt) return false
    // No self-loops.
    if (src.id === tgt.id) return false
    // Vocals and Instrument nodes may never be connected directly.
    const pair = new Set([src.type, tgt.type])
    if (pair.has('vocalsNode') && pair.has('instrumentNode')) return false
    return true
  },

  onNodesChange: (changes) =>
    set((s) => {
      if (hasMeaningfulNodeChanges(changes)) {
        useHistoryStore.getState().record('graph:nodes')
      }
      return { nodes: applyNodeChanges(changes, s.nodes) as AppNode[] }
    }),

  onEdgesChange: (changes) =>
    set((s) => {
      if (hasMeaningfulEdgeChanges(changes)) {
        useHistoryStore.getState().record('graph:edges')
      }
      return { edges: applyEdgeChanges(changes, s.edges) as AppEdge[] }
    }),

  onConnect: (connection) =>
    set((s) => {
      if (!get().isValidConnection(connection)) return s
      useHistoryStore.getState().record('graph:connect')
      playUiSound('connect')
      return {
        edges: addEdge(
          { ...connection, data: { weight: 1.0 }, type: 'weightedEdge' },
          s.edges
        ) as AppEdge[],
      }
    }),

  addNode(type, position) {
    const configs = {
      prompt: {
        type: 'promptNode',
        data: { label: 'Prompt', text: '' } as PromptNodeData,
      },
      instrument: {
        type: 'instrumentNode',
        data: { label: 'Instrument', instrument: 'Piano' } as InstrumentNodeData,
      },
      vocals: {
        type: 'vocalsNode',
        data: {
          label: 'Vocals',
          lyrics: '',
          additionalPrompts: '',
        } as VocalsNodeData,
      },
      output: {
        type: 'outputNode',
        data: { label: 'Output' } as OutputNodeData,
      },
    }
    const cfg = configs[type]
    useHistoryStore.getState().record('graph:add-node')
    set((s) => {
      const existingIds = new Set(s.nodes.map((node) => node.id))
      const newNode: AppNode = {
        id: genId(type, existingIds),
        ...cfg,
        position,
      }

      return { nodes: [...s.nodes, newNode] }
    })
  },

  updateNodeData(id, data) {
    useHistoryStore.getState().record(`graph:node-data:${id}`)
    set((s) => ({
      nodes: s.nodes.map((n) =>
        n.id === id ? { ...n, data: { ...n.data, ...data } } : n
      ),
    }))
  },

  updateEdgeWeight(id, weight) {
    useHistoryStore.getState().record(`graph:edge-weight:${id}`)
    set((s) => ({
      edges: s.edges.map((e) =>
        e.id === id ? { ...e, data: { ...e.data, weight } } : e
      ),
    }))
  },

  setSelectedNode: (id) => set({ selectedNodeId: id }),

  deleteNode(id) {
    useHistoryStore.getState().record('graph:delete-node')
    set((s) => ({
      nodes: s.nodes.filter((n) => n.id !== id),
      edges: s.edges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }))
  },
}))

registerGraphHistoryAdapter({
  getSnapshot: () => {
    const { nodes, edges, selectedNodeId } = useGraphStore.getState()
    return { nodes, edges, selectedNodeId }
  },
  applySnapshot: (snapshot) => {
    useGraphStore.setState(snapshot)
  },
})
