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
  /** When Deepgram last heard a voice start (its own voice detection), 0 when not this turn. */
  speechAt?: number
  /** The words still being decided, each with how sure Deepgram is. */
  words?: Array<{ word: string; confidence: number }>
}

/**
 * From when your voice stops: Deepgram's 1 s pause, its round trip, and the app's 350 ms grace (~1.6 s in all).
 * (Deepgram's words often arrive all at once with the end of the sentence, so the wait is timed from your voice.)
 */
export const FUSE_MS = 1600
/** An unfinished-sounding sentence waits this long for the rest (useSpeechInput's fragment hold). */
export const FUSE_HELD_MS = 4500
/** A gap in your voice this short is between words; longer, and the fuse shows. */
export const FUSE_STARTS_MS = 250
/**
 * Louder than the room by this much (on the bridge's 0–100 scale) is sound worth noticing. The kitchen's quiet
 * measures about 2 (2026-09-30); the first guess (12) missed a normal voice entirely.
 */
const LOUD_ABOVE_ROOM = 6
/** Deepgram's voice start counts for this long (a turn rarely runs longer without words). */
const SPEECH_RECENT_MS = 8000
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
  /** When the sound was last louder than the room. */
  lastLoudAt: number
  signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince' | 'confidence' | 'speechAt'>
}

export function voiceState(input: VoiceStateInput): VoiceLineState {
  const { now, signal } = input
  if (input.bridgeDown) return 'deaf'
  const loud = input.level - input.floor > LOUD_ABOVE_ROOM
  const hearing = input.micOpen && Boolean(input.heard.trim()) && signal.lastWordAt > 0
  const voiced = Boolean(signal.speechAt) && now - (signal.speechAt ?? 0) < SPEECH_RECENT_MS
  const ink: VoiceLineState = signal.confidence != null && signal.confidence < SURE ? 'unsure' : 'voice'
  // Your voice moves it as you speak, before any words come; a short dip between words is still you. Planning keeps
  // the mic open while Casa thinks, so talking over the thinking shows your voice.
  if (input.micOpen && (voiced || hearing) && (loud || now - input.lastLoudAt < FUSE_STARTS_MS)) return ink
  if (hearing && now - signal.lastWordAt < FUSE_STARTS_MS) return ink
  if (input.thinking) return 'thinking'
  if (!input.micOpen) return input.needsYes ? 'yes' : 'off'
  if (signal.heldSince > 0) return 'fuse'
  // You stopped: Casa waits to see if you're done. A voice start with nothing after it (a cough) lets go.
  const ended = voiceEnded(signal, voiced ? input.lastLoudAt : 0)
  if (ended > 0 && (hearing || now - ended < FUSE_MS + 800)) return 'fuse'
  if (input.needsYes) return 'yes'
  if (loud && input.noisyFor >= NOISE_AFTER_MS) return 'noise'
  return 'quiet'
}

const voiceEnded = (signal: Pick<VoiceSignal, 'lastWordAt'>, lastLoudAt: number) => Math.max(lastLoudAt, signal.lastWordAt)

/** How full the fuse is (0–1), from when your voice stopped; it never claims full until Casa has really taken the turn. */
export function fuseProgress(now: number, signal: Pick<VoiceSignal, 'lastWordAt' | 'heldSince'>, lastLoudAt: number): number {
  const raw = signal.heldSince > 0
    ? (now - signal.heldSince) / FUSE_HELD_MS
    : (now - voiceEnded(signal, lastLoudAt) - FUSE_STARTS_MS) / (FUSE_MS - FUSE_STARTS_MS)
  return Math.max(0, Math.min(0.97, raw))
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
  return Math.max(0, Math.min(1, (level - floor) / 24))
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
