import { create } from 'zustand'
import { v4 as uuid } from 'uuid'
import { Track, Clip, TRACK_COLORS, AutomationPoint } from '@/types/timeline'
import { sampleEnvelope, sortPoints } from '@/audio/Automation'
import {
  mirrorClipCropStartSec,
  reverseAutomationPoints,
} from '@/audio/ClipPlayback'
import { audioEngine } from '@/audio/AudioEngine'
import {
  registerTimelineHistoryAdapter,
  useHistoryStore,
} from '@/store/historyStore'
import { playUiSound } from '@/audio/UiSounds'

interface TimelineState {
  tracks: Track[]
  playheadSec: number
  isPlaying: boolean
  isRecording: boolean
  activeTrackId: string | null
  selectedClipId: string | null
  zoomLevel: number      // pixels per second
  scrollOffsetSec: number
  bpm: number
  durationSec: number
  automationMode: boolean

  addTrack(): void
  removeTrack(id: string): void
  updateTrack(id: string, patch: Partial<Omit<Track, 'id' | 'clips'>>): void
  addClip(trackId: string, clip: Omit<Clip, 'id' | 'trackId'>): string
  duplicateClip(clipId: string, newTrackId: string, newStartSec: number): string | null
  updateClip(clipId: string, patch: Partial<Omit<Clip, 'id' | 'trackId'>>): void
  moveClip(clipId: string, newTrackId: string, newStartSec: number): void
  removeClip(clipId: string): void
  splitClipAtPlayhead(): void
  toggleClipReverse(clipId: string): void
  setPlayhead(sec: number): void
  setIsPlaying(v: boolean): void
  setIsRecording(v: boolean): void
  setActiveTrack(id: string): void
  setSelectedClip(id: string | null): void
  setZoom(level: number): void
  setScrollOffset(sec: number): void
  setBpm(bpm: number): void
  setAutomationMode(v: boolean): void
  setClipAutomation(clipId: string, points: AutomationPoint[]): void
  setClipPitchAutomation(clipId: string, points: AutomationPoint[]): void
  setTrackAutomation(trackId: string, points: AutomationPoint[]): void
}

let pendingPlaybackRefresh = false

function dedupeAutomationPoints(points: AutomationPoint[]): AutomationPoint[] {
  const sorted = sortPoints(points)
  return sorted.filter((point, index) => {
    const previous = sorted[index - 1]
    return !previous || previous.timeSec !== point.timeSec
  })
}

function splitClipAutomation(
  points: AutomationPoint[] | undefined,
  splitTimeSec: number
): { left?: AutomationPoint[]; right?: AutomationPoint[] } {
  if (!points?.length) return {}

  const splitValue = sampleEnvelope(points, splitTimeSec)
  const left = dedupeAutomationPoints([
    ...points
      .filter((point) => point.timeSec < splitTimeSec)
      .map((point) => ({ ...point })),
    { timeSec: splitTimeSec, value: splitValue },
  ])
  const right = dedupeAutomationPoints([
    { timeSec: 0, value: splitValue },
    ...points
      .filter((point) => point.timeSec > splitTimeSec)
      .map((point) => ({
        ...point,
        timeSec: point.timeSec - splitTimeSec,
      })),
  ])

  return {
    left: left.length > 0 ? left : undefined,
    right: right.length > 0 ? right : undefined,
  }
}

function trimClipAutomation(
  points: AutomationPoint[] | undefined,
  durationSec: number
): AutomationPoint[] | undefined {
  if (!points?.length) return undefined

  const keptPoints = points
    .filter((point) => point.timeSec < durationSec)
    .map((point) => ({ ...point }))
  const hadClippedPoints = points.some((point) => point.timeSec >= durationSec)

  if (!hadClippedPoints) return dedupeAutomationPoints(keptPoints)

  return dedupeAutomationPoints([
    ...keptPoints,
    { timeSec: durationSec, value: sampleEnvelope(points, durationSec) },
  ])
}

function schedulePlaybackRefresh() {
  if (pendingPlaybackRefresh) return
  pendingPlaybackRefresh = true

  requestAnimationFrame(() => {
    pendingPlaybackRefresh = false

    const state = useTimelineStore.getState()
    if (!state.isPlaying) return

    const playheadSec = audioEngine.getCurrentTimeSec()
    useTimelineStore.setState({ playheadSec })

    audioEngine.play(state.tracks, playheadSec, (sec) => {
      useTimelineStore.getState().setPlayhead(sec)
    })
  })
}

export const useTimelineStore = create<TimelineState>((set, get) => ({
  tracks: [
    {
      id: 'track-1',
      name: 'A1',
      color: TRACK_COLORS[0],
      muted: false,
      soloed: false,
      volume: 0.8,
      clips: [],
    },
  ],
  playheadSec: 0,
  isPlaying: false,
  isRecording: false,
  activeTrackId: 'track-1',
  selectedClipId: null,
  zoomLevel: 100,
  scrollOffsetSec: 0,
  bpm: 120,
  durationSec: 180,
  automationMode: false,

  addTrack() {
    const { tracks } = get()
    const idx = tracks.length
    const newTrack: Track = {
      id: `track-${uuid().slice(0, 8)}`,
      name: `A${idx + 1}`,
      color: TRACK_COLORS[idx % TRACK_COLORS.length],
      muted: false,
      soloed: false,
      volume: 0.8,
      clips: [],
    }
    useHistoryStore.getState().record('timeline:add-track')
    set((s) => ({
      tracks: [...s.tracks, newTrack],
      activeTrackId: newTrack.id,
    }))
    schedulePlaybackRefresh()
  },

  removeTrack(id) {
    useHistoryStore.getState().record('timeline:remove-track')
    set((s) => ({
      tracks: s.tracks.filter((t) => t.id !== id),
      activeTrackId: s.activeTrackId === id
        ? (s.tracks.find((t) => t.id !== id)?.id ?? null)
        : s.activeTrackId,
      selectedClipId:
        s.tracks.some((t) => t.id === id && t.clips.some((c) => c.id === s.selectedClipId))
          ? null
          : s.selectedClipId,
    }))
    schedulePlaybackRefresh()
  },

  updateTrack(id, patch) {
    useHistoryStore.getState().record(`timeline:update-track:${id}`)
    set((s) => ({
      tracks: s.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }))
    schedulePlaybackRefresh()
  },

  addClip(trackId, clipData) {
    const id = uuid()
    const clip: Clip = { id, trackId, speed: 1, isReversed: false, ...clipData }
    useHistoryStore.getState().record('timeline:add-clip')
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, clips: [...t.clips, clip] } : t
      ),
      selectedClipId: id,
      // Extend timeline if clip goes past current duration
      durationSec: Math.max(
        s.durationSec,
        clipData.startSec + clipData.durationSec + 10
      ),
    }))
    schedulePlaybackRefresh()
    return id
  },

  duplicateClip(clipId, newTrackId, newStartSec) {
    const { tracks } = get()
    const sourceClip = tracks.flatMap((track) => track.clips).find((clip) => clip.id === clipId)
    if (!sourceClip) return null

    const id = uuid()
    const duplicatedClip: Clip = {
      ...sourceClip,
      id,
      trackId: newTrackId,
      startSec: Math.max(0, newStartSec),
      speed: sourceClip.speed ?? 1,
      isReversed: sourceClip.isReversed ?? false,
      volumeAutomation: sourceClip.volumeAutomation?.map((point) => ({ ...point })),
      pitchAutomation: sourceClip.pitchAutomation?.map((point) => ({ ...point })),
    }

    useHistoryStore.getState().record('timeline:duplicate-clip')
    set((s) => ({
      tracks: s.tracks.map((track) =>
        track.id === newTrackId
          ? { ...track, clips: [...track.clips, duplicatedClip] }
          : track
      ),
      selectedClipId: id,
      durationSec: Math.max(
        s.durationSec,
        duplicatedClip.startSec + duplicatedClip.durationSec + 10
      ),
    }))
    schedulePlaybackRefresh()

    return id
  },

  updateClip(clipId, patch) {
    useHistoryStore.getState().record(`timeline:update-clip:${clipId}`)
    set((s) => {
      let clipEnd = s.durationSec
      const tracks = s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) => {
          if (c.id !== clipId) return c
          const nextClip = { ...c, ...patch }
          if (nextClip.durationSec < c.durationSec) {
            nextClip.volumeAutomation = trimClipAutomation(
              patch.volumeAutomation ?? c.volumeAutomation,
              nextClip.durationSec
            )
            nextClip.pitchAutomation = trimClipAutomation(
              patch.pitchAutomation ?? c.pitchAutomation,
              nextClip.durationSec
            )
          }
          clipEnd = nextClip.startSec + nextClip.durationSec
          return nextClip
        }),
      }))

      return {
        tracks,
        durationSec: Math.max(s.durationSec, clipEnd + 10),
      }
    })
    schedulePlaybackRefresh()
  },

  moveClip(clipId, newTrackId, newStartSec) {
    useHistoryStore.getState().record('timeline:move-clip')
    set((s) => {
      let movedClip: Clip | undefined
      const tracks = s.tracks.map((t) => {
        const found = t.clips.find((c) => c.id === clipId)
        if (found) {
          movedClip = { ...found, trackId: newTrackId, startSec: Math.max(0, newStartSec) }
          return { ...t, clips: t.clips.filter((c) => c.id !== clipId) }
        }
        return t
      })
      if (!movedClip) return { tracks }
      const clip = movedClip
      return {
        tracks: tracks.map((t) =>
          t.id === newTrackId ? { ...t, clips: [...t.clips, clip] } : t
        ),
        durationSec: Math.max(s.durationSec, clip.startSec + clip.durationSec + 10),
      }
    })
    schedulePlaybackRefresh()
  },

  removeClip(clipId) {
    useHistoryStore.getState().record('timeline:remove-clip')
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.filter((c) => c.id !== clipId),
      })),
      selectedClipId: s.selectedClipId === clipId ? null : s.selectedClipId,
    }))
    schedulePlaybackRefresh()
  },

  splitClipAtPlayhead() {
    const { tracks, activeTrackId, playheadSec } = get()
    if (!activeTrackId) return
    const track = tracks.find((t) => t.id === activeTrackId)
    if (!track) return
    const clip = track.clips.find(
      (c) => playheadSec > c.startSec && playheadSec < c.startSec + c.durationSec
    )
    if (!clip) return
    const offset = playheadSec - clip.startSec
    const splitVolumeAutomation = splitClipAutomation(clip.volumeAutomation, offset)
    const splitPitchAutomation = splitClipAutomation(clip.pitchAutomation, offset)
    const rightClip: Clip = {
      ...clip,
      id: uuid(),
      startSec: playheadSec,
      cropStartSec: clip.cropStartSec + offset * (clip.speed ?? 1),
      durationSec: clip.durationSec - offset,
      volumeAutomation: splitVolumeAutomation.right,
      pitchAutomation: splitPitchAutomation.right,
    }
    useHistoryStore.getState().record('timeline:split-clip')
    set((s) => ({
      tracks: s.tracks.map((t) => {
        if (t.id !== activeTrackId) return t
        return {
          ...t,
          clips: t.clips.flatMap((c) =>
            c.id === clip.id
              ? [{
                  ...c,
                  durationSec: offset,
                  volumeAutomation: splitVolumeAutomation.left,
                  pitchAutomation: splitPitchAutomation.left,
                }, rightClip]
              : [c]
          ),
        }
      }),
    }))
    playUiSound('split')
    schedulePlaybackRefresh()
  },

  toggleClipReverse(clipId) {
    useHistoryStore.getState().record(`timeline:reverse-clip:${clipId}`)
    set((s) => ({
      tracks: s.tracks.map((track) => ({
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id !== clipId) return clip
          return {
            ...clip,
            isReversed: !(clip.isReversed ?? false),
            cropStartSec: mirrorClipCropStartSec(clip),
            volumeAutomation: reverseAutomationPoints(clip.volumeAutomation, clip.durationSec),
            pitchAutomation: reverseAutomationPoints(clip.pitchAutomation, clip.durationSec),
          }
        }),
      })),
    }))
    playUiSound('reverse')
    schedulePlaybackRefresh()
  },

  setPlayhead: (sec) => set({ playheadSec: Math.max(0, sec) }),
  setIsPlaying: (v) => set({ isPlaying: v }),
  setIsRecording: (v) => set({ isRecording: v }),
  setActiveTrack: (id) => set({ activeTrackId: id }),
  setSelectedClip: (id) => set({ selectedClipId: id }),
  setZoom: (level) => set({ zoomLevel: Math.max(20, Math.min(500, level)) }),
  setScrollOffset: (sec) => set({ scrollOffsetSec: Math.max(0, sec) }),
  setBpm: (bpm) => {
    useHistoryStore.getState().record('timeline:set-bpm')
    set({ bpm: Math.max(20, Math.min(300, bpm)) })
  },
  setAutomationMode: (v) => set({ automationMode: v }),

  setClipAutomation(clipId, points) {
    useHistoryStore.getState().record(`timeline:clip-automation:${clipId}`)
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, volumeAutomation: points } : c
        ),
      })),
    }))
    schedulePlaybackRefresh()
  },

  setClipPitchAutomation(clipId, points) {
    useHistoryStore.getState().record(`timeline:clip-pitch:${clipId}`)
    set((s) => ({
      tracks: s.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((c) =>
          c.id === clipId ? { ...c, pitchAutomation: points } : c
        ),
      })),
    }))
    schedulePlaybackRefresh()
  },

  setTrackAutomation(trackId, points) {
    useHistoryStore.getState().record(`timeline:track-automation:${trackId}`)
    set((s) => ({
      tracks: s.tracks.map((t) =>
        t.id === trackId ? { ...t, volumeAutomation: points } : t
      ),
    }))
    schedulePlaybackRefresh()
  },
}))

registerTimelineHistoryAdapter({
  getSnapshot: () => {
    const { tracks, activeTrackId, durationSec, bpm } = useTimelineStore.getState()
    return { tracks, activeTrackId, durationSec, bpm }
  },
  applySnapshot: (snapshot) => {
    useTimelineStore.setState((state) => ({
      ...state,
      ...snapshot,
      selectedClipId: null,
    }))
  },
})
