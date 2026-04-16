const SOUND_FILES = {
  connect: `${import.meta.env.BASE_URL}sounds/connect.mp3`,
  reverse: `${import.meta.env.BASE_URL}sounds/reverse.mp3`,
  split: `${import.meta.env.BASE_URL}sounds/split.mp3`,
} as const

type UiSoundName = keyof typeof SOUND_FILES

const SOUND_VOLUME: Record<UiSoundName, number> = {
  connect: 0.35,
  reverse: 0.45,
  split: 0.5,
}

export function playUiSound(name: UiSoundName): void {
  if (typeof Audio === 'undefined') return

  try {
    const audio = new Audio(SOUND_FILES[name])
    audio.volume = SOUND_VOLUME[name]
    audio.play().catch(() => {})
  } catch {
    // Ignore missing-asset or autoplay failures for non-critical UI feedback.
  }
}
