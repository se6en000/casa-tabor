// The voice line under your words (canvas row 17): one indicator that tells you from the room, shows Casa's wait
// as a fuse, and fades the words it isn't sure of. Pure, so it's tested without a microphone; VoiceLine.tsx draws it.

export type VoiceLineState = 'off' | 'quiet' | 'noise' | 'voice' | 'unsure' | 'fuse' | 'thinking' | 'yes' | 'deaf'

/** What the speech hook keeps for the line, updated without re-rendering (useSpeechInput's `signal`). */
export interface VoiceSignal {
  /** The mic's loudness, 0–100, as the Pi measures it several times a second. */
  level?: number
  /** When the last words came through (ms), 0 when none yet. */
  lastWordAt: number
  /** An unfinished-sounding sentence is being held for the rest: since when (ms), else 0. */
  heldSince: number
  /** How sure Deepgram is of the words so far (0–1), when known. */
  confidence: number | null
  /** The words still being decided, each with how sure Deepgram is. */
  words?: Array<{ word: string; confidence: number }>
}

/** After the last word: a sentence goes after Deepgram's 1 s pause and the app's 350 ms grace (~1.4 s in all). */
export const FUSE_MS = 1400
/** An unfinished-sounding sentence waits this long for the rest (useSpeechInput's fragment hold). */
export const FUSE_HELD_MS = 4500
/** Words count as still coming this long after the last ones; then the fuse shows. */
export const FUSE_STARTS_MS = 600
/** Louder than the room by this much (0–100) is sound worth noticing. */
const LOUD_ABOVE_ROOM = 12
/** Loud with no words this long reads as the room, not you. */
export const NOISE_AFTER_MS = 1500
/** Below this, Deepgram isn't sure. */
const SURE = 0.7

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
  /** How long it has been loud with no words. */
  noisyFor: number
  signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince' | 'confidence'>
}

export function voiceState(input: VoiceStateInput): VoiceLineState {
  const { now, signal } = input
  if (input.bridgeDown) return 'deaf'
  const loud = input.level - input.floor > LOUD_ABOVE_ROOM
  const hearing = input.micOpen && Boolean(input.heard.trim()) && signal.lastWordAt > 0
  const since = now - signal.lastWordAt
  // Deepgram updates every few hundred ms, so between words a loud voice still counts as talking. Planning keeps
  // the mic open while Casa thinks, so talking over the thinking shows your voice.
  if (hearing && (since < FUSE_STARTS_MS || (loud && since < 2000))) return signal.confidence != null && signal.confidence < SURE ? 'unsure' : 'voice'
  if (input.thinking) return 'thinking'
  if (!input.micOpen) return input.needsYes ? 'yes' : 'off'
  if (hearing) return 'fuse'
  if (signal.heldSince > 0) return 'fuse'
  if (input.needsYes) return 'yes'
  if (loud && input.noisyFor >= NOISE_AFTER_MS) return 'noise'
  return 'quiet'
}

/** How full the fuse is (0–1): it never claims full until Casa has really taken the turn. */
export function fuseProgress(now: number, signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince'>): number {
  const raw = signal.heldSince > 0
    ? (now - signal.heldSince) / FUSE_HELD_MS
    : (now - signal.lastWordAt - FUSE_STARTS_MS) / (FUSE_MS - FUSE_STARTS_MS)
  return Math.max(0, Math.min(0.97, raw))
}

/**
 * The level as a voice feels, not a meter: fast to rise (~60 ms), slow to fall (~400 ms). The room's own level
 * (`floor`) is learned quickly downward and slowly upward, so a voice barely moves it but a fan settles in.
 */
export function stepLevel(prev: { level: number; floor: number }, raw: number, dtMs: number): { level: number; floor: number } {
  const toward = (from: number, to: number, ms: number) => from + (to - from) * Math.min(1, dtMs / ms)
  return {
    level: toward(prev.level, raw, raw > prev.level ? 60 : 400),
    floor: toward(prev.floor, raw, raw < prev.floor ? 300 : 8000),
  }
}

/** How much the line lifts (0–1): loudness above the room's own level. */
export function amplitude(level: number, floor: number): number {
  return Math.max(0, Math.min(1, (level - floor) / 40))
}

const bare = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '')

/** The words on screen, the ones Deepgram isn't sure of faded; its word list covers the end of the text. */
export function inkWords(text: string, words: Array<{ word: string; confidence: number }> = [], threshold = 0.6): Array<{ text: string; faded: boolean }> {
  const tokens = text.split(/\s+/).filter(Boolean)
  const out = tokens.map((t) => ({ text: t, faded: false }))
  const start = tokens.length - words.length
  words.forEach((w, i) => {
    const at = start + i
    if (at >= 0 && bare(tokens[at]) === bare(w.word) && w.confidence < threshold) out[at].faded = true
  })
  return out
}
