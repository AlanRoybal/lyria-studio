import { useEffect, useRef, useState } from 'react'
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
import { UpdateOverlay } from '@/components/Updates/UpdateOverlay'
import { GithubStarOverlay } from '@/components/Engagement/GithubStarOverlay'
import type { UpdateReleaseInfo, UpdateState } from '@/types/lyria'

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
      'These controls handle transport and arrangement tasks: play, stop, skip to the start, split a clip at the playhead, reverse a selected clip, and toggle automation editing.',
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
    targetId: 'timeline',
    title: 'Automate Track Volume',
    body:
      'Turn on AUTO, then click in the empty part of a track lane to add volume points for the whole track. Track automation affects every clip on that track over timeline time.',
    placement: 'top',
  },
  {
    targetId: 'timeline',
    title: 'Automate Clip Volume And Pitch',
    body:
      'With AUTO on, click a clip to edit its own envelope. Use the Vol toggle for clip-specific loudness changes, or Pitch to bend that clip up or down without changing the rest of the track.',
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
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const [postUpdateRelease, setPostUpdateRelease] = useState<UpdateReleaseInfo | null>(null)
  const [isUpdaterSupported, setIsUpdaterSupported] = useState(false)
  const [isGithubStarPromptOpen, setIsGithubStarPromptOpen] = useState(false)
  const [shouldShowTutorial, setShouldShowTutorial] = useState(false)
  const [startupLoaded, setStartupLoaded] = useState(false)
  const hasScheduledTutorial = useRef(false)

  useKeyboardShortcuts(startLive, stopLive)

  useEffect(() => {
    let disposed = false

    window.updates.getStartupState().then((startup) => {
      if (disposed) return
      setUpdateState(startup.updateState)
      setPostUpdateRelease(startup.postUpdateRelease)
      setIsUpdaterSupported(startup.isUpdaterSupported)
      setIsGithubStarPromptOpen(startup.githubStarPrompt.shouldShow)
      setShouldShowTutorial(startup.shouldShowTutorial)
      setStartupLoaded(true)
    })

    const unsubscribe = window.updates.onEvent((nextState) => {
      if (disposed) return
      setUpdateState(nextState)
    })

    const unsubscribeGithubStarPrompt = window.engagement.onGithubStarPrompt(() => {
      if (disposed) return
      setIsGithubStarPromptOpen(true)
    })

    return () => {
      disposed = true
      unsubscribe()
      unsubscribeGithubStarPrompt()
    }
  }, [])

  useEffect(() => {
    if (!startupLoaded || !shouldShowTutorial || hasScheduledTutorial.current) return

    hasScheduledTutorial.current = true

    const timer = window.setTimeout(() => {
      setCurrentTutorialStep(0)
      setIsTutorialOpen(true)
    }, 250)

    return () => window.clearTimeout(timer)
  }, [shouldShowTutorial, startupLoaded])

  const handleOpenTutorial = () => {
    setCurrentTutorialStep(0)
    setIsTutorialOpen(true)
  }

  const handleCloseTutorial = () => {
    setShouldShowTutorial(false)
    setIsTutorialOpen(false)
    setCurrentTutorialStep(0)
    void window.tutorial.markCompleted()
  }

  const handleCheckForUpdates = () => {
    if (updateState.status === 'checking') return
    setUpdateState({ status: 'checking', wasManualCheck: true })
    void window.updates.checkNow()
  }

  const handleOpenReleasePage = () => {
    void window.updates.openReleasePage()
  }

  const handleDismissReleaseNotes = (version: string) => {
    setPostUpdateRelease(null)
    void window.updates.markReleaseNotesShown(version)
  }

  const handleDismissUpdateError = () => {
    setUpdateState({ status: 'idle' })
  }

  const handleDismissGithubStarPrompt = () => {
    setIsGithubStarPromptOpen(false)
    void window.engagement.dismissGithubStarPrompt()
  }

  const handleConfirmGithubStarPrompt = () => {
    setIsGithubStarPromptOpen(false)
    void window.engagement.openGithubRepo()
    void window.engagement.dismissGithubStarPrompt()
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
        <Toolbar
          onStartRecording={startLive}
          onStopRecording={stopLive}
          onCheckUpdates={handleCheckForUpdates}
        />
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
      <UpdateOverlay
        isUpdaterSupported={isUpdaterSupported}
        updateState={updateState}
        postUpdateRelease={postUpdateRelease}
        onOpenReleasePage={handleOpenReleasePage}
        onDismissReleaseNotes={handleDismissReleaseNotes}
        onDismissError={handleDismissUpdateError}
      />
      <GithubStarOverlay
        isOpen={isGithubStarPromptOpen}
        onConfirm={handleConfirmGithubStarPrompt}
        onDismiss={handleDismissGithubStarPrompt}
      />
    </>
  )
}
