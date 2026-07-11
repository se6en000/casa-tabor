const COMPLETE_SHORT_COMMAND = /^(?:yes|yeah|yep|no|nope|cancel|stop|confirm|okay|ok|continue|proceed|do it|go ahead|thank you|thanks|goodbye|bye)$/i
const INCOMPLETE_ENDING = /\b(?:a|an|the|to|for|from|with|at|in|on|of|and|or|but|because|if|when|where|what|which|who|whose|my|your|our|their|this|that|these|those|is|are|was|were|do|does|did|can|could|will|would|should|don't|doesn't|didn't|can't|couldn't|won't|wouldn't|shouldn't)$/i

export function isIncompleteVoiceFragment(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim()
  if (!text || COMPLETE_SHORT_COMMAND.test(text)) return false
  const words = text.split(' ')
  if (INCOMPLETE_ENDING.test(text)) return true
  return words.length <= 2 && /^(?:what(?:'s| is)?|where(?:'s| is)?|who(?:'s| is)?|how(?:'s| is)?|why|can you|could you|would you|i want|i need|let's|lets)\b/i.test(text)
}
