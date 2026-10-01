// The voice line under your words (canvas row 17): one indicator that tells you from the room, shows Casa's wait
// as a fuse, and fades the words it isn't sure of. Pure, so it's tested without a microphone; VoiceLine.tsx draws it.

export type VoiceLineState = 'off' | 'quiet' | 'noise' | 'voice' | 'heard' | 'fuse' | 'thinking' | 'yes' | 'deaf'

/** What the speech hook keeps for the line, updated without re-rendering (useSpeechInput's `signal`). */
export interface VoiceSignal {
  /** The mic's loudness, 0–100, as the Pi measures it 10 times a second (a voice on the wall reads only ~3–5). */
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
 * Deepgram sends words in bursts about a second apart while you talk, so "hearing you" holds this long after the
 * last words — between bursts, still talking and done look the same from here; only Deepgram knows, and when it
 * decides, Casa sends within 0.35 s.
 */
export const VOICE_HANGOVER_MS = 1800
/** Deepgram's voice start counts as you talking this long before the first words come. */
const VOICE_START_MS = 3500
/** An unfinished-sounding sentence waits this long for the rest (useSpeechInput's fragment hold) — the real stall. */
export const FUSE_HELD_MS = 4500
/** Louder than the room by this much (on the bridge's 0–100 scale) is sound worth noticing (the room's noise only). */
const LOUD_ABOVE_ROOM = 6
/** Loud with no voice this long reads as the room. */
export const NOISE_AFTER_MS = 1500

export interface VoiceStateInput {
  now: number
  micOpen: boolean
  bridgeDown: boolean
  thinking: boolean
  needsYes: boolean
  /** The words on screen so far (empty before any). */
  heard: string
  level: number
  floor: number
  /** How long it has been loud with no voice. */
  noisyFor: number
  signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince' | 'speechAt'>
}

/** The line changes only on real signals (a voice start, words, a hold, Casa's turn), so it never flickers. */
export function voiceState(input: VoiceStateInput): VoiceLineState {
  const { now, signal } = input
  if (input.bridgeDown) return 'deaf'
  const hearing = input.micOpen && Boolean(input.heard.trim()) && signal.lastWordAt > 0
  const wordsRecent = hearing && now - signal.lastWordAt < VOICE_HANGOVER_MS
  const speechAt = signal.speechAt ?? 0
  const voiceStarting = input.micOpen && speechAt > 0 && now - speechAt < VOICE_START_MS && speechAt > signal.lastWordAt
  // Planning keeps the mic open while Casa thinks, so talking over the thinking shows your voice.
  if (wordsRecent || voiceStarting) return 'voice'
  if (input.thinking) return 'thinking'
  if (!input.micOpen) return input.needsYes ? 'yes' : 'off'
  if (signal.heldSince > 0) return 'fuse'
  if (hearing) return 'heard'
  if (input.needsYes) return 'yes'
  if (input.level - input.floor > LOUD_ABOVE_ROOM && input.noisyFor >= NOISE_AFTER_MS) return 'noise'
  return 'quiet'
}

/** How full the fuse is (0–1) on the 4.5 s hold; it never claims full until Casa has really taken the turn. */
export function fuseProgress(now: number, signal: Pick<VoiceSignal, 'heldSince'>): number {
  if (!signal.heldSince) return 0
  return Math.max(0, Math.min(0.97, (now - signal.heldSince) / FUSE_HELD_MS))
}

/**
 * The level as a voice feels, not a meter: fast to rise (~60 ms), slow to fall (~400 ms). The room's own level
 * (`floor`) is learned quickly downward and slowly upward, so a voice barely moves it but a fan settles in.
 */
export function stepLevel(prev: { level: number; floor: number }, raw: number, dtMs: number): { level: number; floor: number } {
  const toward = (from: number, to: number, ms: number) => from + (to - from) * Math.min(1, dtMs / ms)
  return {
    level: toward(prev.level, raw, raw > prev.level ? 60 : 200),
    floor: toward(prev.floor, raw, raw < prev.floor ? 300 : 8000),
  }
}

/** How much the line lifts (0–1): loudness above the room's own level. */
export function amplitude(level: number, floor: number): number {
  // The wall's mic reads a voice at only ~3–5 above a room of ~1 (2026-09-30), so the scale is small.
  return Math.max(0, Math.min(1, (level - floor) / 6))
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
