import { appendVoiceAudit } from './voiceAudit'
import { enqueueRemoteVoiceTrace, getVoiceDeviceId } from './remoteVoiceTrace'
import { readVoiceRuntimeConfig } from './voiceRuntimeConfig'

export type AssistantTraceContext = {
  traceId: string
  turnId?: string
  correlationId?: string
  page: string
  lane: 'voice' | 'text' | 'fast_path' | 'llm'
  source: string
  startedAt: number
}

type AssistantTraceOptions = {
  detail?: string
  elapsedMs?: number
  payload?: Record<string, unknown>
  at?: string
}

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export function createAssistantTraceContext(input: {
  traceId?: string
  turnId?: string
  page: string
  lane: AssistantTraceContext['lane']
  source: string
  startedAt?: number
}): AssistantTraceContext {
  const traceId = input.traceId ?? newId()
  const turnId = input.turnId
  return {
    traceId,
    turnId,
    correlationId: turnId ? `${traceId}:${turnId}` : undefined,
    page: input.page,
    lane: input.lane,
    source: input.source,
    startedAt: input.startedAt ?? Date.now(),
  }
}

export function emitAssistantTrace(
  event: string,
  context: AssistantTraceContext,
  options: AssistantTraceOptions = {},
): void {
  const config = readVoiceRuntimeConfig()
  const entry = {
    at: options.at ?? new Date().toISOString(),
    event,
    detail: options.detail,
    sessionId: context.traceId,
    turnId: context.turnId ?? context.traceId,
    elapsedMs: options.elapsedMs ?? Math.max(0, Date.now() - context.startedAt),
    page: context.page,
    correlationId: context.correlationId,
    lane: context.lane,
    payload: {
      source: context.source,
      build_id: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
      ...options.payload,
    },
  }
  if (config.auditEnabled) appendVoiceAudit(entry)
  enqueueRemoteVoiceTrace(entry, 'audit', config)
}

export function getAssistantDeviceId(): string {
  return getVoiceDeviceId()
}
