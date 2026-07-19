import { supabaseAnonKey, supabaseUrl } from './supabase'
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
  dedupeKey?: string
  channel: 'debug' | 'audit'
}

type RemoteQueueItem = {
  entry: RemoteVoiceTraceEntry
  attempts: number
}

const DEVICE_ID_KEY = 'casa-voice-debug-device-id'
const QUEUE_STORAGE_KEY = 'casa-voice-remote-queue-v1'
const MAX_BATCH_SIZE = 80
const MAX_QUEUE_SIZE = 2500
const MAX_ATTEMPTS = 3
const FLUSH_INTERVAL_MS = 1800
const RETRY_DELAY_MS = 4000
const RECENT_FINGERPRINT_WINDOW_MS = 8000
const MAX_RECENT_FINGERPRINTS = 2000
const REMOTE_NOISE_EVENTS = new Set([
  'speech_ensure_running',
  'speech_ensure_running_ok',
])
const REMOTE_CRITICAL_EVENTS = new Set([
  'trace_started',
  'trace_outcome',
  'turn_completed',
  'turn_aborted',
  'turn_timeout',
  'asr_no_final',
  'device_heartbeat',
  'client_runtime_online',
  'speech_listening_stall',
  'speech_trigger_final',
  'voice_final',
  'send_current_input',
  'assistant_assistant_invoke_start',
  'assistant_assistant_invoke_result',
  'assistant_assistant_turn_ms',
  'assistant_assistant_stage_ms',
  'assistant_assistant_latency_stage_ms',
  'assistant_assistant_llm_usage',
  'assistant_simple_command_detected',
  'assistant_simple_command_success',
  'assistant_simple_command_error',
  'assistant_assistant_response_text',
  'message',
  'trace_context',
  'trace_closed',
  'voice_stage_ms',
  'wake_detected',
  'drawer_opened',
  'asr_capture_ready',
  'asr_listening_ready',
  'asr_final',
  'asr_error',
  'turn_started',
  'assistant_fast_path_matched',
  'assistant_invoke_started',
  'assistant_first_token',
  'assistant_result_received',
  'assistant_stream_fallback',
  'turn_failed',
  'voice_session_auto_dismissed',
])

let queue: RemoteQueueItem[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null
let flushInFlight = false
let listenersBound = false
let queueHydrated = false
let nextFlushDelayMs = FLUSH_INTERVAL_MS
const recentFingerprints = new Map<string, number>()
let transportHealthy = true

function persistQueue() {
  if (typeof window === 'undefined') return
  try {
    if (queue.length === 0) {
      localStorage.removeItem(QUEUE_STORAGE_KEY)
      return
    }
    localStorage.setItem(QUEUE_STORAGE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE_SIZE)))
  } catch {
    // ignore persistence failures
  }
}

function hydrateQueue() {
  if (queueHydrated || typeof window === 'undefined') return
  queueHydrated = true
  try {
    const raw = localStorage.getItem(QUEUE_STORAGE_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as RemoteQueueItem[]
    if (!Array.isArray(parsed)) return
    queue = parsed
      .filter((item) => item && item.entry && typeof item.entry.event === 'string')
      .map((item) => ({ entry: item.entry, attempts: Number.isFinite(item.attempts) ? item.attempts : 0 }))
      .slice(-MAX_QUEUE_SIZE)
  } catch {
    queue = []
  }
}

function enqueueTransportEvent(event: string, detail: string) {
  if (typeof window === 'undefined') return
  const entry: RemoteVoiceTraceEntry = {
    at: new Date().toISOString(),
    event,
    detail,
    sessionId: 'transport',
    turnId: 'transport',
    channel: 'debug',
  }
  queue.push({ entry, attempts: 0 })
  queue = queue.slice(-MAX_QUEUE_SIZE)
  persistQueue()
}

function flushQueueKeepalive(reason: string) {
  if (typeof window === 'undefined' || queue.length === 0) return
  const entries = queue.slice(0, MAX_BATCH_SIZE).map((item) => item.entry)
  void postToIngest(entries, `client:${reason}`, true).catch(() => {})
}

async function postToIngest(
  entries: RemoteVoiceTraceEntry[],
  sourceComponent = 'client',
  keepalive = false,
): Promise<void> {
  const res = await fetch(`${supabaseUrl}/functions/v1/ingest-ai-drawer-debug`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      apikey: supabaseAnonKey,
      authorization: `Bearer ${supabaseAnonKey}`,
    },
    body: JSON.stringify({
      entries,
      meta: {
        device_id: getVoiceDeviceId(),
        user_agent: navigator.userAgent,
        platform: navigator.platform,
        origin: window.location.origin,
        href: window.location.href,
        source_component: sourceComponent,
      },
    }),
    keepalive,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`ingest status=${res.status} body=${text.slice(0, 200)}`)
  }
}

export function getVoiceDeviceId(): string {
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
      flushQueueKeepalive('visibility_hidden')
      void flushQueueNow()
    }
  })
  window.addEventListener('beforeunload', () => {
    flushQueueKeepalive('before_unload')
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

function buildEntryFingerprint(entry: RemoteVoiceTraceEntry): string {
  return [
    entry.channel,
    entry.sessionId ?? '',
    entry.turnId ?? '',
    String(entry.seq ?? ''),
    entry.event,
    entry.detail ?? '',
  ].join('|')
}

function shouldDropRecentDuplicate(entry: RemoteVoiceTraceEntry): boolean {
  const now = Date.now()
  if (recentFingerprints.size > MAX_RECENT_FINGERPRINTS) {
    for (const [fingerprint, seenAt] of recentFingerprints.entries()) {
      if (now - seenAt > RECENT_FINGERPRINT_WINDOW_MS) recentFingerprints.delete(fingerprint)
    }
  }
  const fingerprint = buildEntryFingerprint(entry)
  const previous = recentFingerprints.get(fingerprint)
  if (typeof previous === 'number' && now - previous <= RECENT_FINGERPRINT_WINDOW_MS) {
    return true
  }
  recentFingerprints.set(fingerprint, now)
  return false
}

async function flushQueueNow() {
  hydrateQueue()
  if (flushInFlight || queue.length === 0 || typeof window === 'undefined') return
  flushInFlight = true
  const batch = queue.slice(0, MAX_BATCH_SIZE)
  try {
    const payload = batch.map((item) => item.entry)
    await postToIngest(payload)
    queue = queue.slice(batch.length)
    nextFlushDelayMs = FLUSH_INTERVAL_MS
    if (!transportHealthy) {
      transportHealthy = true
      enqueueTransportEvent('trace_transport_recovered', `batch=${batch.length}`)
    }
    persistQueue()
  } catch (err) {
    const failed = batch.map((item) => ({ ...item, attempts: item.attempts + 1 }))
    const recoverable = failed.filter((item) => item.attempts < MAX_ATTEMPTS)
    const tail = queue.slice(batch.length)
    queue = [...recoverable, ...tail].slice(-MAX_QUEUE_SIZE)
    nextFlushDelayMs = RETRY_DELAY_MS
    if (transportHealthy) {
      transportHealthy = false
      enqueueTransportEvent('trace_transport_retrying', (err as Error).message)
    }
    persistQueue()
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
  hydrateQueue()
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
  if (shouldDropRecentDuplicate(withChannel)) return
  const dedupeSource = [
    getVoiceDeviceId(),
    channel,
    withChannel.sessionId ?? '',
    withChannel.turnId ?? '',
    String(withChannel.seq ?? ''),
    withChannel.event,
    withChannel.detail ?? '',
  ].join('|')
  withChannel.dedupeKey = dedupeSource.slice(0, 800)
  queue.push({ entry: withChannel, attempts: 0 })
  if (queue.length > MAX_QUEUE_SIZE) {
    queue = queue.slice(-MAX_QUEUE_SIZE)
    console.warn('[voice-trace] queue trimmed to max size')
  }
  persistQueue()
  if (config.debugLevel === 'verbose' || REMOTE_CRITICAL_EVENTS.has(withChannel.event)) {
    void flushQueueNow()
    return
  }
  scheduleFlush()
}
