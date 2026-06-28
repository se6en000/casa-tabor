const TRACE_BRIDGE_KEY = 'casa-client-trace-bridge-v1'
const TRACE_BRIDGE_LIMIT = 600

export type ClientTraceBridgeEvent = {
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
  channel?: 'debug' | 'audit'
}

function readBridgeQueue(): ClientTraceBridgeEvent[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(TRACE_BRIDGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ClientTraceBridgeEvent[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeBridgeQueue(queue: ClientTraceBridgeEvent[]) {
  if (typeof window === 'undefined') return
  try {
    if (queue.length === 0) {
      localStorage.removeItem(TRACE_BRIDGE_KEY)
      return
    }
    localStorage.setItem(TRACE_BRIDGE_KEY, JSON.stringify(queue.slice(-TRACE_BRIDGE_LIMIT)))
  } catch {
    // ignore localStorage bridge failures
  }
}

export function stageClientTraceEvent(event: ClientTraceBridgeEvent): void {
  if (typeof window === 'undefined') return
  const queue = readBridgeQueue()
  queue.push(event)
  writeBridgeQueue(queue)
}

export function drainClientTraceEvents(limit = 120): ClientTraceBridgeEvent[] {
  if (typeof window === 'undefined') return []
  const queue = readBridgeQueue()
  if (queue.length === 0) return []
  const take = Math.max(1, Math.min(limit, queue.length))
  const drained = queue.slice(-take)
  const keep = queue.slice(0, Math.max(0, queue.length - take))
  writeBridgeQueue(keep)
  return drained
}
