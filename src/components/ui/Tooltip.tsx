import { ReactNode, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  text: string
  children: ReactNode
  position?: 'top' | 'bottom'
}

interface TriggerRect {
  centerX: number
  top: number
  bottom: number
}

interface Coords {
  left: number
  top: number
  placement: 'top' | 'bottom'
  arrowOffset: number
}

const GAP = 8
const EDGE_PAD = 8

export function Tooltip({ text, children, position = 'top' }: TooltipProps) {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [trigger, setTrigger] = useState<TriggerRect | null>(null)
  const [coords, setCoords] = useState<Coords | null>(null)

  const show = useCallback(() => {
    const el = wrapperRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setTrigger({ centerX: r.left + r.width / 2, top: r.top, bottom: r.bottom })
  }, [])

  const hide = useCallback(() => {
    setTrigger(null)
    setCoords(null)
  }, [])

  // After the tooltip mounts and we know its width, clamp it to the viewport
  // and compute the arrow's offset so it still points at the trigger.
  useLayoutEffect(() => {
    if (!trigger || !tooltipRef.current) return
    const tip = tooltipRef.current.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    let placement = position
    if (placement === 'top' && trigger.top - tip.height - GAP < EDGE_PAD) placement = 'bottom'
    if (placement === 'bottom' && trigger.bottom + tip.height + GAP > vh - EDGE_PAD) placement = 'top'

    const desiredLeft = trigger.centerX - tip.width / 2
    const clampedLeft = Math.max(
      EDGE_PAD,
      Math.min(desiredLeft, vw - tip.width - EDGE_PAD)
    )
    const top = placement === 'top' ? trigger.top - GAP - tip.height : trigger.bottom + GAP
    const arrowOffset = trigger.centerX - clampedLeft

    setCoords({ left: clampedLeft, top, placement, arrowOffset })
  }, [trigger, position, text])

  return (
    <>
      <div
        ref={wrapperRef}
        className="inline-flex"
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
      >
        {children}
      </div>
      {trigger &&
        createPortal(
          <div
            ref={tooltipRef}
            className="pointer-events-none fixed z-[1000] whitespace-nowrap rounded bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200 shadow-lg ring-1 ring-zinc-700"
            style={{
              left: coords?.left ?? -9999,
              top: coords?.top ?? -9999,
              visibility: coords ? 'visible' : 'hidden',
            }}
          >
            {text}
            {coords && (
              <span
                className={`absolute border-4 border-transparent ${
                  coords.placement === 'top' ? 'top-full border-t-zinc-800' : 'bottom-full border-b-zinc-800'
                }`}
                style={{ left: coords.arrowOffset, transform: 'translateX(-50%)' }}
              />
            )}
          </div>,
          document.body
        )}
    </>
  )
}
