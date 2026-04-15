export interface PromptNodeData extends Record<string, unknown> {
  label: string
  text: string
}

export interface InstrumentNodeData extends Record<string, unknown> {
  label: string
  instrument: string
}

export interface VocalsNodeData extends Record<string, unknown> {
  label: string
  lyrics: string
  additionalPrompts: string
}

export interface OutputNodeData extends Record<string, unknown> {
  label: string
}

export interface EdgeData extends Record<string, unknown> {
  weight: number
}

// System prompt that constrains the model to vocals-only output.
// Injected as a high-weight weighted-prompt whenever a Vocals node
// feeds the Output in the graph.
export const VOCALS_SYSTEM_PROMPT =
  'STRICT A CAPPELLA: Output must contain ONLY human singing voices. ' +
  'Absolutely no instruments of any kind: no guitar, no piano, no drums, no bass, ' +
  'no synthesizer, no strings, no brass, no percussion, no samples, no loops. ' +
  'No backing track, no instrumental accompaniment, no musical bed, ' +
  'no ambient pads, no reverb tails that imply instruments. ' +
  'No sound effects, no foley, no crowd noise, no applause, no ambience. ' +
  'No beatboxing, no vocal percussion, no mouth-simulated instruments. ' +
  'Human voices ONLY — singing, spoken word, adlibs, harmonies, backing vocals, ' +
  'and multiple singers are all permitted, but only if the user prompt asks for them. ' +
  'Default to a single lead vocalist unless the prompt specifies otherwise. ' +
  'Silence between vocal phrases — pure silence, not instrumental fills. ' +
  'Dry, close-mic vocal recording. ' +
  'If you would normally add any non-vocal sound, leave silence instead.'

// Model used when a Vocals node is connected to the Output node.
export const VOCALS_MODEL = 'models/lyria-3-pro-preview'
export const DEFAULT_MODEL = 'models/lyria-realtime-exp'

export const INSTRUMENT_OPTIONS = [
  'Piano',
  'Guitar',
  'Strings',
  'Brass',
  'Synth Pad',
  'Drums',
  'Bass',
  'Choir',
  'Flute',
  'Ambient',
] as const

export type Instrument = (typeof INSTRUMENT_OPTIONS)[number]
