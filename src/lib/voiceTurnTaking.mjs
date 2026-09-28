const COMPLETE_SHORT_COMMAND = /^(?:yes|yeah|yep|no|nope|cancel|stop|confirm|okay|ok|continue|proceed|do it|go ahead|thank you|thanks|goodbye|bye)$/i
const INCOMPLETE_ENDING = /\b(?:a|an|the|to|for|from|with|at|in|on|of|and|or|but|because|if|when|where|what|which|who|whose|my|your|our|their|this|that|these|those|is|are|was|were|do|does|did|can|could|will|would|should|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't)$/i
const FILLER_ONLY = /^(?:uh+|um+|erm+|hmm+|mm+|ah+|noise|[.?!, -]+)$/i

// A request cut off at a pause: a verb still waiting for its object ("can you book"), a trailing
// "um", or a name's possessive with nothing after it ("to book Liv's") — unless the possessive
// is the answer itself ("it's Kelly's"). Heard on the wall 2026-09-26 (P3.13).
const WAITING_VERB = /\b(?:book|schedule|put|remind me|remind|call|text|move|change|set up|bring|take|pick up|drop off|tell|ask|like|um+|uh+|so)$/i
const POSSESSIVE_ENDING = /(\S+)\s+[a-z]+['’]s$/i
const PREDICATE_BEFORE = /^(?:it['’]?s|that['’]?s|this is|is|was|are|were|its)$/i

export function isIncompleteVoiceFragment(value) {
  // The transcriber adds punctuation to whatever it heard; a trailing "?" doesn't finish a thought.
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().replace(/[.?!,;:…\s]+$/, '')
  if (!text || COMPLETE_SHORT_COMMAND.test(text)) return false
  const words = text.split(' ')
  if (INCOMPLETE_ENDING.test(text)) return true
  if (words.length >= 2 && WAITING_VERB.test(text)) return true
  const possessive = POSSESSIVE_ENDING.exec(text)
  if (possessive && !PREDICATE_BEFORE.test(possessive[1])) return true
  if (words.length <= 2 && /^(?:what(?:'s| is)?|where(?:'s| is)?|who(?:'s| is)?|how(?:'s| is)?|why|can you|could you|would you|i want|i need|let's|lets)\b/i.test(text)) return true
  return /^(?:do|did|can|could|would|should|will)\s+(?:we|you|i|they|he|she)\s+(?:have|need|want|know|see|find|get|go|make|bring)$/i.test(text)
}

export function isLikelyUnusableVoiceTranscript(value, confidence) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text || COMPLETE_SHORT_COMMAND.test(text)) return false
  if (FILLER_ONLY.test(text)) return true
  const words = text.split(' ')
  return typeof confidence === 'number' && confidence < 0.45 && words.length <= 2
}

// ── What a heard sentence is for, while the band keeps listening (P3.13) ──
// A sentence counts as a yes, a no, or a goodbye only when it is made of nothing but those
// words (and filler); a goodbye word inside a real sentence ("is it close to school",
// "never mind that, when does softball start") goes to Casa like anything else.
const FILLER = new Set(['ok', 'okay', 'thanks', 'thank', 'you', 'casa', 'alexa', 'hey', 'alright', 'cool', 'um', 'uh', 'so', 'please', 'actually', 'oh'])
// The card's own verb counts too: "yes, change it", "yeah move it" (heard 2026-09-27).
const YES_WORDS = new Set(['yes', 'yeah', 'yep', 'yup', 'ok', 'okay', 'sure', 'confirm', 'go', 'ahead', 'do', 'it', 'sounds', 'good', 'correct', 'right', 'that', 'add', 'save', 'please', 'perfect', 'great', 'absolutely', 'proceed', 'looks', 'change', 'update', 'move', 'rename', 'book', 'schedule', 'set', 'make', 'remove', 'delete'])
const YES_CORE = /\b(yes|yeah|yep|yup|ok|okay|sure|confirm|go ahead|do it|sounds good|correct|perfect|absolutely|proceed|save it|add it)\b/
const NO_WORDS = new Set(['no', 'nope', 'nah', 'cancel', 'that', 'it', 'never', 'mind', 'nevermind', 'forget', 'scratch', 'stop', 'abort', 'undo', 'dont', 'do', 'not', 'add', 'leave', 'as', 'is'])
const NO_CORE = /\b(no|nope|nah|cancel|never mind|nevermind|forget it|scratch that|stop|abort|undo|dont|do not)\b/
const BYE_WORDS = new Set(['go', 'away', 'thats', 'that', 'is', 'all', 'bye', 'goodbye', 'stop', 'listening', 'were', 'we', 'are', 'im', 'i', 'am', 'done', 'for', 'now', 'close', 'dismiss', 'end', 'session', 'never', 'mind', 'nevermind', 'good', 'night', 'goodnight', 'see', 'ya', 'later'])
const BYE_CORE = /\b(go away|thats all|that is all|bye|goodbye|stop listening|done|close|dismiss|end session|never mind|nevermind|good ?night|see ya|later)\b/

function wordsOf(value) {
  return String(value ?? '').toLowerCase().replace(/[’']/g, '').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
}
const onlyOf = (words, allowed) => words.length > 0 && words.every((w) => allowed.has(w) || FILLER.has(w))

/** 'confirm' | 'cancel' (a draft's yes / no), 'dismiss' (end the session), or 'send' (words for Casa). */
export function voiceFinalIntent(value, { hasPending = false } = {}) {
  const words = wordsOf(value)
  const text = words.join(' ')
  if (words.length === 0) return 'send'
  if (hasPending && words.length <= 5) {
    if (onlyOf(words, NO_WORDS) && NO_CORE.test(text)) return 'cancel'
    if (onlyOf(words, YES_WORDS) && YES_CORE.test(text)) return 'confirm'
  }
  if (words.length <= 6 && onlyOf(words, BYE_WORDS) && BYE_CORE.test(text)) return 'dismiss'
  return 'send'
}

/**
 * A sentence held for more (it sounded cut off) once the wait for more runs out: what to send.
 * What was said goes to Casa, which can ask if it really was cut short; only nothing, or filler,
 * is let go (Jake, 2026-09-27: held words were being thrown away).
 */
export function heldFragmentAfterWait(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text || FILLER_ONLY.test(text.replace(/[.?!,;:…\s]+$/, ''))) return null
  return text
}
