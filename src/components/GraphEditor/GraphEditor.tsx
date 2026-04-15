import { useCallback, useRef, useState } from 'react'
import {
  ReactFlow,
  Background,
  MiniMap,
  BackgroundVariant,
  useReactFlow,
  ReactFlowProvider,
  type OnNodeDrag,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useGraphStore } from '@/store/graphStore'
import { NodePalette } from './NodePalette'
import { PromptNode } from './nodes/PromptNode'
import { InstrumentNode } from './nodes/InstrumentNode'
import { OutputNode } from './nodes/OutputNode'
import { VocalsNode } from './nodes/VocalsNode'
import { WeightedEdge } from './edges/WeightedEdge'

// Must be defined outside the component to prevent remounting
const nodeTypes = {
  promptNode: PromptNode,
  instrumentNode: InstrumentNode,
  outputNode: OutputNode,
  vocalsNode: VocalsNode,
}

const edgeTypes = {
  weightedEdge: WeightedEdge,
}

const MIN_ZOOM = 0.2
const MAX_ZOOM = 2

function GraphEditorInner() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    setSelectedNode,
    deleteNode,
    isValidConnection,
  } = useGraphStore()
  const { screenToFlowPosition } = useReactFlow()
  const containerRef = useRef<HTMLDivElement>(null)
  const paletteRef = useRef<HTMLDivElement>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null)
  const [isDeleteTargetActive, setIsDeleteTargetActive] = useState(false)

  const isPointerOverPalette = useCallback((x: number, y: number) => {
    const rect = paletteRef.current?.getBoundingClientRect()
    if (!rect) return false
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const nodeType = e.dataTransfer.getData('application/lyria-node-type') as
        | 'prompt'
        | 'instrument'
        | 'output'
        | 'vocals'
      if (!nodeType) return

      const position = screenToFlowPosition({ x: e.clientX, y: e.clientY })
      addNode(nodeType, position)
    },
    [screenToFlowPosition, addNode]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }, [])

  const handleNodeDragStart = useCallback<OnNodeDrag<Node>>((event, node) => {
    setDraggingNodeId(node.id)
    setIsDeleteTargetActive(isPointerOverPalette(event.clientX, event.clientY))
  }, [isPointerOverPalette])

  const handleNodeDrag = useCallback<OnNodeDrag<Node>>((event) => {
    setIsDeleteTargetActive(isPointerOverPalette(event.clientX, event.clientY))
  }, [isPointerOverPalette])

  const handleNodeDragStop = useCallback<OnNodeDrag<Node>>(
    (event, node) => {
      const shouldDelete = isPointerOverPalette(event.clientX, event.clientY)

      setDraggingNodeId(null)
      setIsDeleteTargetActive(false)

      if (shouldDelete) {
        deleteNode(node.id)
      }
    },
    [deleteNode, isPointerOverPalette]
  )

  return (
    <div className="flex h-full w-full min-h-0 min-w-0">
      <NodePalette
        panelRef={paletteRef}
        showDeleteTarget={draggingNodeId !== null}
        isDeleteTargetActive={isDeleteTargetActive}
      />
      <div
        ref={containerRef}
        data-tour-id="graph-canvas"
        className="relative flex h-full flex-1 min-h-0 min-w-0"
        onDrop={handleDrop}
        onDragOver={handleDragOver}
      >
        <ReactFlow
          className="h-full w-full"
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          isValidConnection={isValidConnection}
          onNodeClick={(_, node) => setSelectedNode(node.id)}
          onPaneClick={() => setSelectedNode(null)}
          onNodeDragStart={handleNodeDragStart}
          onNodeDrag={handleNodeDrag}
          onNodeDragStop={handleNodeDragStop}
          fitView
          minZoom={MIN_ZOOM}
          maxZoom={MAX_ZOOM}
          proOptions={{ hideAttribution: true }}
          style={{ background: '#0a0a0b', width: '100%', height: '100%' }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#27272a"
          />
          <MiniMap
            nodeColor={(node) => {
              if (node.type === 'promptNode') return '#7c3aed'
              if (node.type === 'instrumentNode') return '#22c55e'
              if (node.type === 'vocalsNode') return '#f43f5e'
              return '#f59e0b'
            }}
            maskColor="rgba(10,10,11,0.7)"
            style={{ background: '#111113', border: '1px solid #2a2a30' }}
          />
        </ReactFlow>
      </div>
    </div>
  )
}

export function GraphEditor() {
  return (
    <ReactFlowProvider>
      <GraphEditorInner />
    </ReactFlowProvider>
  )
}
