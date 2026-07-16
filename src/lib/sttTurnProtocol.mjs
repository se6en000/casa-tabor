export const STT_TURN_PROTOCOL = 'candidate-v1'

const MESSAGE_TYPES = new Set([
  'capturing',
  'ready',
  'volume',
  'speech_started',
  'transcript',
  'segment_final',
  'turn_candidate',
  'committed',
  'discarded',
  'interim',
  'final',
  'error',
  'shadow_metric',
])

export function normalizeBridgeTurnMessage(value) {
  if (!value || typeof value !== 'object' || !MESSAGE_TYPES.has(value.type)) return null
  return value
}

export function reconcileTranscriptRevision(value) {
  const committed = String(value?.committed ?? '').replace(/\s+/g, ' ').trim()
  const interim = String(value?.interim ?? '').replace(/\s+/g, ' ').trim()
  if (!committed) return interim
  if (!interim) return committed
  if (interim.toLocaleLowerCase().startsWith(committed.toLocaleLowerCase())) return interim
  return `${committed} ${interim}`
}
