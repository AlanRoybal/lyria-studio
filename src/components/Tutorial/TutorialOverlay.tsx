import { useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export interface TutorialStep {
  targetId: string
  title: string
  body: ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
}

interface TutorialOverlayProps {
  steps: TutorialStep[]
  currentStep: number
  onClose: () => void
  onNext: () => void
  onPrevious: () => void
}

interface StepRect {
  top: number
  left: number
  width: number
  height: number
}

interface PopoverPosition {
  top: number
  left: number
  placement: 'top' | 'bottom' | 'left' | 'right'
}

const SPOTLIGHT_PADDING = 12
const EDGE_PADDING = 20
const POPOVER_GAP = 18
const POPOVER_WIDTH = 340
const POPOVER_HEIGHT = 220

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(value, max))
}

function fitsTop(rect: StepRect) {
  return rect.top >= POPOVER_HEIGHT + POPOVER_GAP + EDGE_PADDING
}

function fitsBottom(rect: StepRect) {
  return window.innerHeight - (rect.top + rect.height) >= POPOVER_HEIGHT + POPOVER_GAP + EDGE_PADDING
}

function fitsLeft(rect: StepRect) {
  return rect.left >= POPOVER_WIDTH + POPOVER_GAP + EDGE_PADDING
}

function fitsRight(rect: StepRect) {
  return window.innerWidth - (rect.left + rect.width) >= POPOVER_WIDTH + POPOVER_GAP + EDGE_PADDING
}

export function TutorialOverlay({
  steps,
  currentStep,
  onClose,
  onNext,
  onPrevious,
}: TutorialOverlayProps) {
  const [rect, setRect] = useState<StepRect | null>(null)
  const [mounted, setMounted] = useState(false)
  const step = steps[currentStep]

  useEffect(() => {
    setMounted(true)
  }, [])

  useLayoutEffect(() => {
    if (!step) return

    let frame = 0
    let observer: ResizeObserver | null = null

    const updateRect = () => {
      const target = document.querySelector<HTMLElement>(`[data-tour-id="${step.targetId}"]`)
      if (!target) {
        setRect(null)
        return
      }

      const next = target.getBoundingClientRect()
      setRect({
        top: next.top - SPOTLIGHT_PADDING,
        left: next.left - SPOTLIGHT_PADDING,
        width: next.width + SPOTLIGHT_PADDING * 2,
        height: next.height + SPOTLIGHT_PADDING * 2,
      })

      observer?.disconnect()
      observer = new ResizeObserver(() => {
        cancelAnimationFrame(frame)
        frame = requestAnimationFrame(updateRect)
      })
      observer.observe(target)
    }

    const requestUpdate = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(updateRect)
    }

    requestUpdate()
    window.addEventListener('resize', requestUpdate)
    window.addEventListener('scroll', requestUpdate, true)

    return () => {
      cancelAnimationFrame(frame)
      observer?.disconnect()
      window.removeEventListener('resize', requestUpdate)
      window.removeEventListener('scroll', requestUpdate, true)
    }
  }, [step])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
      if (event.key === 'ArrowRight' && currentStep < steps.length - 1) onNext()
      if (event.key === 'ArrowLeft' && currentStep > 0) onPrevious()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [currentStep, onClose, onNext, onPrevious, steps.length])

  const popoverPosition = useMemo<PopoverPosition>(() => {
    if (!rect) {
      return {
        top: window.innerHeight / 2 - POPOVER_HEIGHT / 2,
        left: window.innerWidth / 2 - POPOVER_WIDTH / 2,
        placement: step.placement ?? 'bottom',
      }
    }

    const preferred = step.placement ?? 'bottom'
    const order =
      preferred === 'top'
        ? ['top', 'bottom', 'right', 'left']
        : preferred === 'left'
        ? ['left', 'right', 'bottom', 'top']
        : preferred === 'right'
        ? ['right', 'left', 'bottom', 'top']
        : ['bottom', 'top', 'right', 'left']

    const resolved =
      order.find((placement) => {
        if (placement === 'top') return fitsTop(rect)
        if (placement === 'bottom') return fitsBottom(rect)
        if (placement === 'left') return fitsLeft(rect)
        return fitsRight(rect)
      }) ?? 'bottom'

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2
    const maxLeft = window.innerWidth - POPOVER_WIDTH - EDGE_PADDING
    const maxTop = window.innerHeight - POPOVER_HEIGHT - EDGE_PADDING

    if (resolved === 'top') {
      return {
        top: clamp(rect.top - POPOVER_HEIGHT - POPOVER_GAP, EDGE_PADDING, maxTop),
        left: clamp(centerX - POPOVER_WIDTH / 2, EDGE_PADDING, maxLeft),
        placement: 'top',
      }
    }

    if (resolved === 'left') {
      return {
        top: clamp(centerY - POPOVER_HEIGHT / 2, EDGE_PADDING, maxTop),
        left: clamp(rect.left - POPOVER_WIDTH - POPOVER_GAP, EDGE_PADDING, maxLeft),
        placement: 'left',
      }
    }

    if (resolved === 'right') {
      return {
        top: clamp(centerY - POPOVER_HEIGHT / 2, EDGE_PADDING, maxTop),
        left: clamp(rect.left + rect.width + POPOVER_GAP, EDGE_PADDING, maxLeft),
        placement: 'right',
      }
    }

    return {
      top: clamp(rect.top + rect.height + POPOVER_GAP, EDGE_PADDING, maxTop),
      left: clamp(centerX - POPOVER_WIDTH / 2, EDGE_PADDING, maxLeft),
      placement: 'bottom',
    }
  }, [rect, step])

  const arrowStyle = useMemo(() => {
    if (!rect) return undefined

    const centerX = rect.left + rect.width / 2
    const centerY = rect.top + rect.height / 2

    if (popoverPosition.placement === 'top' || popoverPosition.placement === 'bottom') {
      return {
        left: clamp(centerX - popoverPosition.left, 22, POPOVER_WIDTH - 22),
      }
    }

    return {
      top: clamp(centerY - popoverPosition.top, 22, POPOVER_HEIGHT - 22),
    }
  }, [popoverPosition, rect])

  if (!mounted || !step) return null

  const isLastStep = currentStep === steps.length - 1
  const spotlightRect = rect
    ? {
        top: Math.max(0, rect.top),
        left: Math.max(0, rect.left),
        width: Math.min(window.innerWidth, rect.width + Math.min(0, rect.left)),
        height: Math.min(window.innerHeight, rect.height + Math.min(0, rect.top)),
      }
    : null

  return createPortal(
    <div className="fixed inset-0 z-[3000]" onClick={onClose}>
      <svg className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <mask id="tutorial-mask">
            <rect width="100%" height="100%" fill="white" />
            {spotlightRect && (
              <rect
                x={spotlightRect.left}
                y={spotlightRect.top}
                width={spotlightRect.width}
                height={spotlightRect.height}
                rx="18"
                ry="18"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="rgba(0,0,0,0.58)" mask="url(#tutorial-mask)" />
      </svg>

      {spotlightRect && (
        <div
          className="pointer-events-none absolute rounded-[18px] border border-white/80 shadow-[0_0_0_1px_rgba(255,255,255,0.08),0_0_28px_rgba(255,255,255,0.16)]"
          style={{
            top: spotlightRect.top,
            left: spotlightRect.left,
            width: spotlightRect.width,
            height: spotlightRect.height,
          }}
        />
      )}

      <div
        className="absolute min-h-[220px] w-[340px] rounded-2xl border border-white/10 bg-zinc-950/96 p-5 text-zinc-100 shadow-2xl backdrop-blur"
        style={{
          top: popoverPosition.top,
          left: popoverPosition.left,
        }}
        onClick={(event) => event.stopPropagation()}
      >
        {popoverPosition.placement === 'top' && (
          <span
            className="pointer-events-none absolute top-full h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-white/10 bg-zinc-950"
            style={arrowStyle}
          />
        )}
        {popoverPosition.placement === 'bottom' && (
          <span
            className="pointer-events-none absolute bottom-full h-3 w-3 -translate-x-1/2 rotate-45 border-l border-t border-white/10 bg-zinc-950"
            style={arrowStyle}
          />
        )}
        {popoverPosition.placement === 'left' && (
          <span
            className="pointer-events-none absolute left-full h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-white/10 bg-zinc-950"
            style={arrowStyle}
          />
        )}
        {popoverPosition.placement === 'right' && (
          <span
            className="pointer-events-none absolute right-full h-3 w-3 -translate-y-1/2 rotate-45 border-b border-l border-white/10 bg-zinc-950"
            style={arrowStyle}
          />
        )}

        <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-zinc-500">
          Step {currentStep + 1} of {steps.length}
        </div>
        <h2 className="text-base font-semibold text-white">{step.title}</h2>
        <p className="mt-3 text-sm leading-6 text-zinc-300">{step.body}</p>

        <div className="mt-5 flex items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="text-xs font-semibold uppercase tracking-wider text-zinc-500 transition-colors hover:text-zinc-300"
          >
            Skip
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onPrevious}
              disabled={currentStep === 0}
              className="rounded-lg border border-zinc-800 px-3 py-2 text-xs font-semibold text-zinc-300 transition-colors hover:border-zinc-700 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              onClick={isLastStep ? onClose : onNext}
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-200"
            >
              {isLastStep ? 'Done' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}
