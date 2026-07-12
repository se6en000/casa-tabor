export const STT_TURN_PROTOCOL: 'candidate-v1'

export interface BridgeTurnMessage {
  type: string
  text?: string
  committed?: string
  interim?: string
  confidence?: unknown
  is_final?: boolean
  endpoint_reason?: string
  provider_timestamp?: number
  level?: number
  msg?: string
  utterance_id?: string
  next_utterance_id?: string
  provider?: string
  status?: string
  session_id?: string
  turn_index?: number
  primary_discarded?: boolean
  primary_word_count?: number
  shadow_word_count?: number
  average_confidence?: number | null
  normalized_edit_distance?: number | null
  end_of_turn_confidence?: number
  speech_to_first_update_ms?: number | null
  average_update_interval_ms?: number | null
  update_count?: number
  last_word_to_eot_ms?: number
  turn_resumed_count?: number
  queue_drops?: number
  max_queue_depth?: number
  average_primary_offer_us?: number
  max_primary_offer_us?: number
  offer_us?: number
}

export function normalizeBridgeTurnMessage(value: unknown): BridgeTurnMessage | null
export function reconcileTranscriptRevision(
  value: Pick<BridgeTurnMessage, 'committed' | 'interim'>,
): string
