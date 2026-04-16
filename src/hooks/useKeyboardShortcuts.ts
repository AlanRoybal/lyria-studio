import { useEffect } from 'react'
import { useTimelineStore } from '@/store/timelineStore'
import { useHistoryStore } from '@/store/historyStore'
import { audioEngine } from '@/audio/AudioEngine'

export function useKeyboardShortcuts(
  startRecording: () => void,
  stopRecording: () => void
) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore shortcuts when typing in inputs
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return
      }

      const { isPlaying, isRecording, playheadSec, tracks, setIsPlaying, setPlayhead } =
        useTimelineStore.getState()
      const { undo, redo, canUndo, canRedo } = useHistoryStore.getState()

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        if (e.shiftKey) {
          if (canRedo) redo()
        } else if (canUndo) {
          undo()
        }
        return
      }

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        if (canRedo) redo()
        return
      }

      switch (e.code) {
        case 'Space': {
          e.preventDefault()
          if (isRecording) {
            stopRecording()
          } else if (isPlaying) {
            audioEngine.pause()
            setIsPlaying(false)
          } else {
            audioEngine.play(tracks, playheadSec, (sec) => {
              useTimelineStore.getState().setPlayhead(sec)
            }, () => {
              useTimelineStore.getState().setIsPlaying(false)
            })
            setIsPlaying(true)
          }
          break
        }
        case 'KeyR': {
          if (e.metaKey || e.ctrlKey) break // don't intercept Cmd+R
          if (isRecording) {
            stopRecording()
          } else {
            startRecording()
          }
          break
        }
        case 'Escape': {
          if (isRecording) stopRecording()
          if (isPlaying) {
            audioEngine.pause()
            setIsPlaying(false)
          }
          break
        }
        case 'Home':
        case 'Numpad0': {
          e.preventDefault()
          audioEngine.stop()
          setPlayhead(0)
          setIsPlaying(false)
          break
        }
        case 'KeyS': {
          if (e.metaKey || e.ctrlKey) break // don't intercept Cmd/Ctrl+S
          e.preventDefault()
          useTimelineStore.getState().splitClipAtPlayhead()
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [startRecording, stopRecording])
}
