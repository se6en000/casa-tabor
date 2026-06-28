import { supabase } from './supabase'
import type { VoiceRuntimeConfig } from './voiceRuntimeConfig'

type RemoteVoiceTraceEntry = {
  at: string
  event: string
  detail?: string
  sessionId?: string
  turnId?: string
  seq?: number
  elapsedMs?: number
  page?: string
  turnState?: string
  loading?: boolean
  queueDepth?: number
  correlationId?: string
  actionId?: string
  lane?: string
  payload?: unknown
  channel: 'debug' | 'audit'
}

type RemoteQueueItem = {
  entry: RemoteVoiceTraceEntry
  attempts: number
}

const DEVICE_ID_KEY = 'casa-voice-debug-device-id'
const MAX_BATCH_SIZE = 80
const MAX_QUEUE_SIZE = 2500
const MAX_ATTEMPTS = 3
const FLUSH_INTERVAL_MS = 1800
const RETRY_DELAY_MS = 4000
const REMOTE_NOISE_EVENTS = new Set([
  'speech_ensure_running',
  'speech_ensure_running_ok',
])
const REMOTE_CRITICAL_EVENTS = new Set([
  'speech_trigger_final',
  'voice_final',
  'send_current_input',
  'assistant_assistant_invoke_start',
  'assistant_assistant_invoke_result',
  'assistant_assistant_turn_ms',
  'assistant_assistant_stage_ms',
  'assistant_simple_command_detected',
  'assistant_simple_command_success',
  'assistant_simple_command_error',
  'assistant_assistant_response_text',
  'message',
  'trace_context',
  'trace_closed',
])

let queue: RemoteQueueItem[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight = false
let listenersBound = false
let nextFlushDelayMs = FLUSH_INTERVAL_MS

function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server'
  try {
    const existing = localStorage.getItem(DEVICE_ID_KEY)
    if (existing) return existing
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    localStorage.setItem(DEVICE_ID_KEY, generated)
    return generated
  } catch {
    return 'local-storage-unavailable'
  }
}

function ensureListenersBound() {
  if (listenersBound || typeof window === 'undefined') return
  listenersBound = true
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      void flushQueueNow()
    }
  })
  window.addEventListener('beforeunload', () => {
    void flushQueueNow()
  })
}

function scheduleFlush(delayMs = nextFlushDelayMs) {
  if (flushTimer || flushInFlight) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushQueueNow()
  }, delayMs)
}

function shouldSkipRemote(entryEvent: string, config: VoiceRuntimeConfig): boolean {
  return config.debugLevel !== 'verbose' && REMOTE_NOISE_EVENTS.has(entryEvent)
}

async function flushQueueNow() {
  if (flushInFlight || queue.length === 0 || typeof window === 'undefined') return
  flushInFlight = true
  const batch = queue.slice(0, MAX_BATCH_SIZE)
  try {
    const payload = batch.map((item) => item.entry)
    const response = await supabase.functions.invoke('ingest-ai-drawer-debug', {
      body: {
        entries: payload,
        meta: {
          device_id: getDeviceId(),
          user_agent: navigator.userAgent,
          platform: navigator.platform,
          origin: window.location.origin,
          href: window.location.href,
          source_component: 'client',
        },
      },
    })
    if (response.error) {
      throw new Error(response.error.message)
    }
    queue = queue.slice(batch.length)
    nextFlushDelayMs = FLUSH_INTERVAL_MS
  } catch (err) {
    const failed = batch.map((item) => ({ ...item, attempts: item.attempts + 1 }))
    const recoverable = failed.filter((item) => item.attempts < MAX_ATTEMPTS)
    const tail = queue.slice(batch.length)
    queue = [...recoverable, ...tail].slice(-MAX_QUEUE_SIZE)
    nextFlushDelayMs = RETRY_DELAY_MS
    console.warn('[voice-trace] remote flush failed', (err as Error).message)
  } finally {
    flushInFlight = false
    if (queue.length > 0) scheduleFlush()
  }
}

export function enqueueRemoteVoiceTrace(
  entry: Omit<RemoteVoiceTraceEntry, 'channel'>,
  channel: 'debug' | 'audit',
  config: VoiceRuntimeConfig,
): void {
  if (typeof window === 'undefined') return
  ensureListenersBound()
  const withChannel: RemoteVoiceTraceEntry = {
    ...entry,
    channel,
    detail: entry.detail?.slice(0, 2000),
    event: entry.event.slice(0, 120),
    page: entry.page?.slice(0, 64),
    turnState: entry.turnState?.slice(0, 64),
  }
  if (shouldSkipRemote(withChannel.event, config)) return
  queue.push({ entry: withChannel, attempts: 0 })
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(-MAX_QUEUE_SIZE)
    console.warn('[voice-trace] queue trimmed to max size')
  }
  if (config.debugLevel === 'verbose' || REMOTE_CRITICAL_EVENTS.has(withChannel.event)) {
    void flushQueueNow()
    return
  }
  scheduleFlush()
}
