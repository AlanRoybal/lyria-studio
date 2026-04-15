interface PlayheadProps {
  positionPx: number
  height: number
  onMouseDown?: (e: React.MouseEvent) => void
}

export function Playhead({ positionPx, height, onMouseDown }: PlayheadProps) {
  if (positionPx < 0) return null

  return (
    <div
      className="pointer-events-auto absolute top-0 z-30 flex cursor-ew-resize flex-col items-center"
      style={{ left: positionPx - 5, width: 11 }}
      onMouseDown={onMouseDown}
    >
      {/* Triangle cap */}
      <div
        className="h-0 w-0"
        style={{
          borderLeft: '5px solid transparent',
          borderRight: '5px solid transparent',
          borderTop: '7px solid #ef4444',
        }}
      />
      {/* Line — centered in the wider hit area */}
      <div
        className="w-px bg-red-500"
        style={{ height: height - 7 }}
      />
    </div>
  )
}
