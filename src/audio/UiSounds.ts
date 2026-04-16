const SOUND_FILES = {
  connect: '/Users/alan/Downloads/dragon-studio-pop-402324.mp3',
  reverse: '/Users/alan/Downloads/freesound_community-babyscratch-87371.mp3',
  split: '/Users/alan/Downloads/soundreality-finger-snap-sound-423220.mp3',
} as const

type UiSoundName = keyof typeof SOUND_FILES

const soundUrlCache = new Map<UiSoundName, string | null>()

const SOUND_VOLUME: Record<UiSoundName, number> = {
  connect: 0.35,
  reverse: 0.45,
  split: 0.5,
}

export function playUiSound(name: UiSoundName): void {
  if (typeof Audio === 'undefined') return

  try {
    let url = soundUrlCache.get(name)
    if (url === undefined) {
      url = window.store.getFileDataUrl(SOUND_FILES[name])
      soundUrlCache.set(name, url)
    }
    if (!url) return

    const audio = new Audio(url)
    audio.volume = SOUND_VOLUME[name]
    audio.play().catch(() => {})
  } catch {
    // Ignore missing-file or autoplay failures for non-critical UI feedback.
  }
}
