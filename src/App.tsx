import { useEffect, useState } from 'react'
import { CircleHelp } from 'lucide-react'
import { useLyriaSession } from '@/hooks/useLyriaSession'
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts'
import { Toolbar } from '@/components/Toolbar/Toolbar'
import { GraphEditor } from '@/components/GraphEditor/GraphEditor'
import { PropertiesPanel } from '@/components/PropertiesPanel/PropertiesPanel'
import { MiniOverview } from '@/components/Timeline/MiniOverview'
import { Timeline } from '@/components/Timeline/Timeline'
import { Transport } from '@/components/Transport/Transport'
import { Tooltip } from '@/components/ui/Tooltip'
import { TutorialOverlay, type TutorialStep } from '@/components/Tutorial/TutorialOverlay'

const TUTORIAL_STORAGE_KEY = 'lyria-studio:tutorial-complete'

const TUTORIAL_STEPS: TutorialStep[] = [
  {
    targetId: 'api-key',
    title: 'Connect Your API Key',
    body: (
      <>
        Get a Gemini API key from{' '}
        <a
          href="https://aistudio.google.com/prompts/new_chat"
          target="_blank"
          rel="noreferrer"
          className="font-medium text-violet-300 underline decoration-violet-500/60 underline-offset-2 hover:text-violet-200"
        >
          Google AI Studio
        </a>
        . If you do not have one yet, click the <span className="font-semibold text-white">No API Key</span>{' '}
        button there to generate one, then paste it here and click Save Key.
      </>
    ),
    placement: 'bottom',
  },
  {
    targetId: 'node-palette',
    title: 'Start With The Node Palette',
    body:
      'This is the parts bin for your graph. Drag Prompt for descriptive text, Instrument for a sound source, Vocals for lyrics, and Output for the final destination.',
    placement: 'right',
  },
  {
    targetId: 'graph-canvas',
    title: 'Assemble The Graph On The Canvas',
    body:
      'Drop nodes here and draw connections between their handles. A simple starting setup is Prompt -> Instrument -> Output. Nothing plays until something reaches Output.',
    placement: 'bottom',
  },
  {
    targetId: 'graph-canvas',
    title: 'Create Your First Graph',
    body:
      'Try this exact setup: drag in Prompt, Instrument, and Output. Type a mood into Prompt like "warm analog synth pulse", type an instrument like "synth bass", then connect Prompt to Instrument and Instrument to Output.',
    placement: 'bottom',
  },
  {
    targetId: 'properties-panel',
    title: 'Edit The Selected Node',
    body:
      'Click any node in the graph and its editable fields appear here. Prompt nodes hold sound descriptions, Instrument nodes name the instrument, and Vocals nodes hold lyrics and delivery notes.',
    placement: 'left',
  },
  {
    targetId: 'transport-playback',
    title: 'Use Playback And Edit Controls',
    body:
      'These controls handle transport and arrangement tasks: play, stop, skip to the start, split a clip at the playhead, and toggle automation editing.',
    placement: 'top',
  },
  {
    targetId: 'transport-live',
    title: 'Generate Audio With Go Live',
    body:
      'Press Go Live after your key and graph are ready. While live, you can capture instrument output into the timeline and save the latest generated vocals clip.',
    placement: 'top',
  },
  {
    targetId: 'timeline',
    title: 'Arrange Clips In The Timeline',
    body:
      'Generated clips appear here. Drag the playhead to scrub, use track lanes to arrange clips, add tracks on the left, and zoom with Cmd/Ctrl plus the mouse wheel.',
    placement: 'top',
  },
  {
    targetId: 'help-tutorial',
    title: 'Replay The Tutorial Anytime',
    body:
      'Use this help button whenever you want to walk through the app again after the first launch.',
    placement: 'left',
  },
]

export default function App() {
  const { startLive, stopLive, captureInstrumentals, captureVocals } = useLyriaSession()
  const [isTutorialOpen, setIsTutorialOpen] = useState(false)
  const [currentTutorialStep, setCurrentTutorialStep] = useState(0)

  useKeyboardShortcuts(startLive, stopLive)

  useEffect(() => {
    if (typeof window === 'undefined') return

    const hasCompletedTutorial = window.localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true'
    if (hasCompletedTutorial) return

    const timer = window.setTimeout(() => {
      setCurrentTutorialStep(0)
      setIsTutorialOpen(true)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [])

  const handleOpenTutorial = () => {
    setCurrentTutorialStep(0)
    setIsTutorialOpen(true)
  }

  const handleCloseTutorial = () => {
    window.localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true')
    setIsTutorialOpen(false)
    setCurrentTutorialStep(0)
  }

  return (
    <>
      <div
        className="flex h-screen w-screen flex-col overflow-hidden bg-studio-bg text-zinc-100"
        style={{
          display: 'grid',
          gridTemplateRows: '48px 64px minmax(0, 1fr) 56px 280px',
          gridTemplateColumns: '1fr',
        }}
      >
        <Toolbar onStartRecording={startLive} onStopRecording={stopLive} />
        <MiniOverview />
        <div className="flex h-full min-h-0 overflow-hidden">
          <div className="h-full min-h-0 min-w-0 flex-1 overflow-hidden">
            <GraphEditor />
          </div>
          <div className="h-full w-64 flex-shrink-0 overflow-hidden">
            <PropertiesPanel />
          </div>
        </div>
        <Transport
          onStartLive={startLive}
          onStopLive={stopLive}
          onCaptureInstrumentals={captureInstrumentals}
          onCaptureVocals={captureVocals}
        />
        <Timeline />
      </div>
      <div className="pointer-events-none fixed bottom-5 right-5 z-[2000]">
        <div className="pointer-events-auto" data-tour-id="help-tutorial">
          <Tooltip text="Open tutorial" position="top">
            <button
              type="button"
              onClick={handleOpenTutorial}
              className="flex h-11 w-11 items-center justify-center rounded-full border border-zinc-700 bg-zinc-950/90 text-zinc-200 shadow-lg shadow-black/30 backdrop-blur transition-colors hover:border-zinc-500 hover:bg-zinc-900 hover:text-white"
              aria-label="Open tutorial"
            >
              <CircleHelp size={18} />
            </button>
          </Tooltip>
        </div>
      </div>
      {isTutorialOpen && (
        <TutorialOverlay
          steps={TUTORIAL_STEPS}
          currentStep={currentTutorialStep}
          onClose={handleCloseTutorial}
          onNext={() =>
            setCurrentTutorialStep((step) => Math.min(step + 1, TUTORIAL_STEPS.length - 1))
          }
          onPrevious={() => setCurrentTutorialStep((step) => Math.max(step - 1, 0))}
        />
      )}
    </>
  )
}
