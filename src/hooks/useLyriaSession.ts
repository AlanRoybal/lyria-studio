import { useEffect, useRef, useCallback } from 'react'
import { useGraphStore } from '@/store/graphStore'
import { useTimelineStore } from '@/store/timelineStore'
import { useSessionStore } from '@/store/sessionStore'
import { liveAudioPlayer } from '@/audio/LiveAudioPlayer'
import { RecordingPipeline } from '@/audio/RecordingPipeline'
import { VOCALS_MODEL } from '@/types/graph'

const PROMPT_UPDATE_DEBOUNCE_MS = 600

export function useLyriaSession() {
  const isLiveRef = useRef(false)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastPromptsKeyRef = useRef<string>('')

  // ── Event listener from main process ────────────────────────────────────────
  useEffect(() => {
    window.store.getApiKey().then((key) => {
      if (key) useSessionStore.getState().setApiKey(key)
    })

    const unsub = window.lyria.onEvent(({ event, data }) => {
      if (event === 'connected') {
        useSessionStore.getState().setConnectionStatus('connected')
      }
      if (event === 'disconnected') {
        isLiveRef.current = false
        useSessionStore.getState().setConnectionStatus('disconnected')
        useTimelineStore.getState().setIsRecording(false)
        liveAudioPlayer.stop()
      }
      if (event === 'error') {
        const msg =
          typeof data === 'string'
            ? data
            : (data as { message?: string })?.message ?? 'Unknown error'
        isLiveRef.current = false
        useSessionStore.getState().setConnectionStatus('error', msg)
        useTimelineStore.getState().setIsRecording(false)
        liveAudioPlayer.stop()
      }
      if (event === 'audioChunk') {
        const { data: base64 } = data as { data: string }
        console.log('[useLyriaSession] audioChunk received, ctx state:', (liveAudioPlayer as any).ctx?.state)
        liveAudioPlayer.feedChunk(base64)
      }
      if (event === 'clipReady') {
        const { audioBase64 } = data as { audioBase64: string; mimeType: string }
        console.log('[useLyriaSession] clipReady (vocals) — playing decoded clip')
        liveAudioPlayer.playClip(audioBase64).catch((err) =>
          console.error('[useLyriaSession] playClip failed:', err)
        )
      }
    })

    return () => { unsub() }
  }, [])

  // ── Watch graph + BPM for changes while live ─────────────────────────────────
  useEffect(() => {
    const unsubGraph = useGraphStore.subscribe(() => {
      if (!isLiveRef.current) return
      schedulePromptUpdate()
    })
    const unsubBpm = useTimelineStore.subscribe((state, prev) => {
      if (!isLiveRef.current) return
      if (state.bpm !== prev.bpm) schedulePromptUpdate()
    })
    return () => { unsubGraph(); unsubBpm() }
  }, [])

  const schedulePromptUpdate = useCallback(() => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      if (!isLiveRef.current) return
      const prompts = useGraphStore.getState().computeWeightedPrompts()
      const { bpm } = useTimelineStore.getState()
      const key = JSON.stringify(prompts) + ':' + bpm
      if (key === lastPromptsKeyRef.current) return
      lastPromptsKeyRef.current = key
      window.lyria.updatePrompts(prompts, bpm).catch((err: Error) => {
        console.error('Failed to update prompts:', err)
      })
    }, PROMPT_UPDATE_DEBOUNCE_MS)
  }, [])

  // ── Start / stop live ────────────────────────────────────────────────────────
  const startLive = useCallback(async () => {
    const { connectionStatus, apiKey } = useSessionStore.getState()
    if (connectionStatus === 'connecting') return

    const key = apiKey || (await window.store.getApiKey())
    if (!key) {
      useSessionStore.getState().setConnectionStatus('error', 'No API key — enter one in the toolbar')
      return
    }

    const { instrumentPrompts, vocalsPrompts } = useGraphStore
      .getState()
      .computeSplitPrompts()
    const { bpm } = useTimelineStore.getState()

    // Debug: log the full graph state so we can see why prompts might be empty
    const { nodes, edges } = useGraphStore.getState()
    console.log('[useLyriaSession] startLive — instrumentPrompts:', JSON.stringify(instrumentPrompts),
      'vocalsPrompts:', JSON.stringify(vocalsPrompts),
      'bpm:', bpm,
      'nodes:', nodes.map((n) => ({ id: n.id, type: n.type, data: n.data })),
      'edges:', edges.map((e) => ({ id: e.id, source: e.source, target: e.target, data: e.data })),
    )

    lastPromptsKeyRef.current = JSON.stringify(instrumentPrompts) + ':' + bpm

    useSessionStore.getState().setConnectionStatus('connecting')
    useSessionStore.getState().resetLiveWaveform()

    liveAudioPlayer.start((samples) => {
      useSessionStore.getState().appendLiveWaveform(samples)
    })

    const hasInstruments = instrumentPrompts.length > 0
    const hasVocals = vocalsPrompts.length > 0

    try {
      if (hasInstruments) {
        await window.lyria.startLive(key, instrumentPrompts, bpm)
        isLiveRef.current = true
        useTimelineStore.getState().setIsRecording(true)
      } else if (hasVocals) {
        // Vocals-only: no streaming session. Mark "connected" so UI reflects activity.
        useSessionStore.getState().setConnectionStatus('connected')
        useTimelineStore.getState().setIsRecording(true)
      }

      if (hasVocals) {
        // Fire REST generation in parallel. Clip arrives via 'clipReady' event.
        window.lyria
          .generateVocalsClip(key, vocalsPrompts, VOCALS_MODEL)
          .catch((err: Error) => {
            console.error('[useLyriaSession] generateVocalsClip failed:', err)
          })
      }

      if (!hasInstruments && !hasVocals) {
        liveAudioPlayer.stop()
        useSessionStore.getState().setConnectionStatus(
          'error',
          'Nothing connected to the Output node'
        )
      }
    } catch (err) {
      isLiveRef.current = false
      liveAudioPlayer.stop()
      useTimelineStore.getState().setIsRecording(false)
      const msg = err instanceof Error ? err.message : 'Failed to start live session'
      useSessionStore.getState().setConnectionStatus('error', msg)
    }
  }, [])

  const stopLive = useCallback(async () => {
    // Also reachable in vocals-only mode (where isLiveRef is never set).
    const wasLive = isLiveRef.current
    const { connectionStatus } = useSessionStore.getState()
    if (!wasLive && connectionStatus !== 'connected' && connectionStatus !== 'connecting') return
    isLiveRef.current = false
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
      debounceTimerRef.current = null
    }
    // Stop any in-progress capture
    if (liveAudioPlayer.isCapturing) {
      useSessionStore.getState().setIsCapturing(false)
      liveAudioPlayer.stopCapture()
    }
    useTimelineStore.getState().setIsRecording(false)
    liveAudioPlayer.stop()
    useSessionStore.getState().setConnectionStatus('disconnected')
    await window.lyria.stopLive().catch(() => {})
  }, [])

  // ── Capture instrumentals (toggles streaming capture of the live session) ──
  const captureInstrumentals = useCallback(() => {
    if (!isLiveRef.current) return

    if (!liveAudioPlayer.isCapturing) {
      // Start capture — record playhead position so we know where to place the clip
      const { playheadSec } = useTimelineStore.getState()
      liveAudioPlayer.startCapture(playheadSec)
      useSessionStore.getState().setCaptureStartSec(playheadSec)
      useSessionStore.getState().setIsCapturing(true)
    } else {
      // Stop capture and commit clip to active track
      useSessionStore.getState().setIsCapturing(false)
      const result = liveAudioPlayer.stopCapture()
      if (!result) return

      const { activeTrackId, tracks, playheadSec } = useTimelineStore.getState()
      if (!activeTrackId) return

      const track = tracks.find((t) => t.id === activeTrackId)
      const clipNum = tracks.reduce((sum, t) => sum + t.clips.length, 0) + 1

      useTimelineStore.getState().addClip(activeTrackId, {
        startSec: result.startSec,
        durationSec: result.audioBuffer.duration,
        cropStartSec: 0,
        audioBuffer: result.audioBuffer,
        waveformCache: result.waveformCache,
        label: `Instr ${clipNum}`,
        color: track?.color ?? '#22c55e',
        speed: 1,
      })

      // Advance playhead past the new clip
      const newPlayhead = Math.max(playheadSec, result.startSec + result.audioBuffer.duration)
      useTimelineStore.getState().setPlayhead(newPlayhead)
    }
  }, [])

  // ── Capture vocals (commits the most recent REST-generated clip) ─────────
  const captureVocals = useCallback(() => {
    const buffer = liveAudioPlayer.getLatestVocalsBuffer()
    if (!buffer) {
      useSessionStore
        .getState()
        .setConnectionStatus('error', 'No vocals clip has been generated yet')
      return
    }

    const { activeTrackId, tracks, playheadSec } = useTimelineStore.getState()
    if (!activeTrackId) return

    const track = tracks.find((t) => t.id === activeTrackId)
    const clipNum = tracks.reduce((sum, t) => sum + t.clips.length, 0) + 1
    const waveformCache = new RecordingPipeline().buildWaveformCache(buffer, 500)

    useTimelineStore.getState().addClip(activeTrackId, {
      startSec: playheadSec,
      durationSec: buffer.duration,
      cropStartSec: 0,
      audioBuffer: buffer,
      waveformCache,
      label: `Vocals ${clipNum}`,
      color: '#f43f5e',
      speed: 1,
    })

    useTimelineStore.getState().setPlayhead(playheadSec + buffer.duration)
    // Consume the buffer so repeated clicks don't stack duplicates.
    liveAudioPlayer.clearLatestVocalsBuffer()
  }, [])

  return { startLive, stopLive, captureInstrumentals, captureVocals }
}
