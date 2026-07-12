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
}

export function normalizeBridgeTurnMessage(value: unknown): BridgeTurnMessage | null
export function reconcileTranscriptRevision(
  value: Pick<BridgeTurnMessage, 'committed' | 'interim'>,
): string
