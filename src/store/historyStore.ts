import { create } from 'zustand'
import type { Node, Edge } from '@xyflow/react'
import type {
  PromptNodeData,
  InstrumentNodeData,
  OutputNodeData,
  VocalsNodeData,
  EdgeData,
} from '@/types/graph'
import type { Track, Clip, AutomationPoint } from '@/types/timeline'

type AppNode = Node<PromptNodeData | InstrumentNodeData | OutputNodeData | VocalsNodeData>
type AppEdge = Edge<EdgeData>

export interface GraphHistorySnapshot {
  nodes: AppNode[]
  edges: AppEdge[]
  selectedNodeId: string | null
}

export interface TimelineHistorySnapshot {
  tracks: Track[]
  activeTrackId: string | null
  durationSec: number
  bpm: number
}

interface AppHistorySnapshot {
  graph: GraphHistorySnapshot
  timeline: TimelineHistorySnapshot
}

interface HistoryAdapter<T> {
  getSnapshot(): T
  applySnapshot(snapshot: T): void
}

interface HistoryState {
  past: AppHistorySnapshot[]
  future: AppHistorySnapshot[]
  canUndo: boolean
  canRedo: boolean
  record(group?: string): void
  undo(): void
  redo(): void
}

const HISTORY_LIMIT = 100
const RECORD_GROUP_WINDOW_MS = 500

let graphAdapter: HistoryAdapter<GraphHistorySnapshot> | null = null
let timelineAdapter: HistoryAdapter<TimelineHistorySnapshot> | null = null
let lastRecordGroup: string | null = null
let lastRecordAt = 0

function cloneAutomationPoints(points?: AutomationPoint[]) {
  return points?.map((point) => ({ ...point }))
}

function cloneClip(clip: Clip): Clip {
  return {
    ...clip,
    volumeAutomation: cloneAutomationPoints(clip.volumeAutomation),
    pitchAutomation: cloneAutomationPoints(clip.pitchAutomation),
  }
}

function cloneTimelineSnapshot(snapshot: TimelineHistorySnapshot): TimelineHistorySnapshot {
  return {
    ...snapshot,
    tracks: snapshot.tracks.map((track) => ({
      ...track,
      clips: track.clips.map(cloneClip),
      volumeAutomation: cloneAutomationPoints(track.volumeAutomation),
    })),
  }
}

function cloneGraphSnapshot(snapshot: GraphHistorySnapshot): GraphHistorySnapshot {
  return {
    selectedNodeId: snapshot.selectedNodeId,
    nodes: snapshot.nodes.map((node) => ({
      ...node,
      position: { ...node.position },
      data: { ...node.data },
    })),
    edges: snapshot.edges.map((edge) => ({
      ...edge,
      data: edge.data ? { ...edge.data } : edge.data,
    })),
  }
}

function captureSnapshot(): AppHistorySnapshot | null {
  if (!graphAdapter || !timelineAdapter) return null
  return {
    graph: cloneGraphSnapshot(graphAdapter.getSnapshot()),
    timeline: cloneTimelineSnapshot(timelineAdapter.getSnapshot()),
  }
}

function applySnapshot(snapshot: AppHistorySnapshot) {
  graphAdapter?.applySnapshot(cloneGraphSnapshot(snapshot.graph))
  timelineAdapter?.applySnapshot(cloneTimelineSnapshot(snapshot.timeline))
}

function ensureInitialSnapshot() {
  if (!graphAdapter || !timelineAdapter) return
  useHistoryStore.setState((state) => ({
    ...state,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
  }))
}

export function registerGraphHistoryAdapter(adapter: HistoryAdapter<GraphHistorySnapshot>) {
  graphAdapter = adapter
  ensureInitialSnapshot()
}

export function registerTimelineHistoryAdapter(adapter: HistoryAdapter<TimelineHistorySnapshot>) {
  timelineAdapter = adapter
  ensureInitialSnapshot()
}

export const useHistoryStore = create<HistoryState>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,

  record(group = 'default') {
    const snapshot = captureSnapshot()
    if (!snapshot) return

    const now = Date.now()
    const shouldMerge =
      lastRecordGroup === group && now - lastRecordAt < RECORD_GROUP_WINDOW_MS

    lastRecordGroup = group
    lastRecordAt = now

    set((state) => {
      if (shouldMerge) {
        return state.future.length === 0
          ? state
          : {
              future: [],
              canRedo: false,
            }
      }

      const nextPast = [...state.past, snapshot].slice(-HISTORY_LIMIT)
      return {
        past: nextPast,
        future: [],
        canUndo: nextPast.length > 0,
        canRedo: false,
      }
    })
  },

  undo() {
    const current = captureSnapshot()
    if (!current) return

    const { past, future } = get()
    const previous = past[past.length - 1]
    if (!previous) return

    applySnapshot(previous)
    lastRecordGroup = null
    lastRecordAt = 0

    const nextPast = past.slice(0, -1)
    set({
      past: nextPast,
      future: [current, ...future].slice(0, HISTORY_LIMIT),
      canUndo: nextPast.length > 0,
      canRedo: true,
    })
  },

  redo() {
    const current = captureSnapshot()
    if (!current) return

    const { past, future } = get()
    const next = future[0]
    if (!next) return

    applySnapshot(next)
    lastRecordGroup = null
    lastRecordAt = 0

    const nextPast = [...past, current].slice(-HISTORY_LIMIT)
    const nextFuture = future.slice(1)
    set({
      past: nextPast,
      future: nextFuture,
      canUndo: nextPast.length > 0,
      canRedo: nextFuture.length > 0,
    })
  },
}))
