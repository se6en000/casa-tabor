// The listener (canvas row 17): tells your voice from the room, shows the real stall (a held sentence) as a fuse, and
// fades the words Deepgram isn't sure of. Pure, so it's tested without a microphone; VoiceHalo.tsx draws it in the mic.

export type VoiceLineState = 'off' | 'quiet' | 'noise' | 'voice' | 'heard' | 'fuse' | 'thinking' | 'yes' | 'deaf'

/** What the speech hook keeps for the line, updated without re-rendering (useSpeechInput's `signal`). */
export interface VoiceSignal {
  /** The mic's loudness, 0–100 on the bridge's decibel scale, 10 times a second (the room ~34, a voice ~45–90). */
  level?: number
  /** When the last words came through (ms), 0 when none yet. */
  lastWordAt: number
  /** An unfinished-sounding sentence is being held for the rest: since when (ms), else 0. */
  heldSince: number
  /** How sure Deepgram is of the words so far (0–1), when known. */
  confidence?: number | null
  /** The words still being decided, each with how sure Deepgram is. */
  words?: Array<{ word: string; confidence: number }>
  /** When Deepgram last heard a voice start (its own voice detection), 0 when not this turn. */
  speechAt?: number
}

/**
 * You stop talking this long after the last loud moment (a gap between syllables is shorter). Jake, fifth try:
 * "slow to start vibing and slow to stop" — it waited for Deepgram's voice start (300–700 ms) and held 1.8–3.5 s.
 */
export const QUIET_AFTER_MS = 350
/** An unfinished-sounding sentence waits this long for the rest (useSpeechInput's fragment hold) — the real stall. */
export const FUSE_HELD_MS = 4500
/** Louder than the room by this much (on the bridge's decibel scale, ~2.5 dB) counts as sound. */
export const LOUD_ABOVE_ROOM = 6
/** Loud with no voice detected and no words this long reads as the room. */
export const NOISE_AFTER_MS = 1500

export interface VoiceStateInput {
  now: number
  micOpen: boolean
  bridgeDown: boolean
  thinking: boolean
  needsYes: boolean
  /** The words on screen so far (empty before any). */
  heard: string
  /** When the sound was last louder than the room (ms), 0 when not yet. */
  loudAt: number
  /** How long it has been loud with no voice detected and no words. */
  noisyFor: number
  signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince' | 'speechAt'>
}

/** The line's state, from the loudness itself (every 20 ms) and the real signals (a hold, Casa's turn). */
export function voiceState(input: VoiceStateInput): VoiceLineState {
  const { now, signal } = input
  if (input.bridgeDown) return 'deaf'
  const talking = input.micOpen && input.loudAt > 0 && now - input.loudAt < QUIET_AFTER_MS
  if (talking && input.noisyFor >= NOISE_AFTER_MS) return 'noise'
  // Planning keeps the mic open while Casa thinks, so talking over the thinking shows your voice.
  if (talking) return 'voice'
  if (input.thinking) return 'thinking'
  if (!input.micOpen) return input.needsYes ? 'yes' : 'off'
  if (signal.heldSince > 0) return 'fuse'
  if (input.heard.trim() && signal.lastWordAt > 0) return 'heard'
  if (input.needsYes) return 'yes'
  return 'quiet'
}

/** How full the fuse is (0–1) on the 4.5 s hold; it never claims full until Casa has really taken the turn. */
export function fuseProgress(now: number, signal: Pick<VoiceSignal, 'heldSince'>): number {
  if (!signal.heldSince) return 0
  return Math.max(0, Math.min(0.97, (now - signal.heldSince) / FUSE_HELD_MS))
}

/**
 * The level follows the voice closely — up at once, down in ~80 ms — so each syllable shows. The room's own level
 * (`floor`) is learned quickly downward and slowly upward, so a voice barely moves it but a fan settles in.
 */
export function stepLevel(prev: { level: number; floor: number }, raw: number, dtMs: number): { level: number; floor: number } {
  const toward = (from: number, to: number, ms: number) => from + (to - from) * Math.min(1, dtMs / ms)
  return {
    level: toward(prev.level, raw, raw > prev.level ? 20 : 80),
    floor: toward(prev.floor, raw, raw < prev.floor ? 300 : 8000),
  }
}

/** How tall the voice is (0–1) above the room: the room itself is nothing, a syllable most of it, a shout all of it. */
export function envelope(level: number, floor: number): number {
  return Math.max(0, Math.min(1, (level - floor - 4) / 14))
}

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

/** The words on screen, the ones Deepgram isn't sure of faded; its word list covers the end of the text. */
export function inkWords(text: string, words: Array<{ word: string; confidence: number }> = [], threshold = 0.5): Array<{ text: string; faded: boolean }> {
  const tokens = text.split(/\s+/).filter(Boolean)
  const out = tokens.map((t) => ({ text: t, faded: false }))
  const start = tokens.length - words.length
  words.forEach((w, i) => {
    const at = start + i
    if (at >= 0 && bare(tokens[at]) === bare(w.word) && w.confidence < threshold) out[at].faded = true
  })
  return out
}

/** The words as shown: the wake word ("Alexa,") left off, so the start of the sentence doesn't jump when it's dropped. */
export function shownWords(text: string): string {
  return text.replace(/^\s*(hey\s+)?alexa\b[\s,.!?]*/i, '')
}
