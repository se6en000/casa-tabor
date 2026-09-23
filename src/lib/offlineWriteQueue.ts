import { createStore, get, set, del, keys } from 'idb-keyval'

// Offline write resilience, starting point: reads already survive an outage
// (src/lib/eventsCachePersister.ts); this is the write half. Scoped
// honestly -- this is the real, reusable queue infrastructure, wired into ONE
// write path so far (quick-create, see PalmBeachFolioCard.tsx) rather than a
// framework-wide mutation-persistence retrofit across every write in the app,
// which would touch far more files than this pass has audited.
//
// A dedicated IndexedDB store, separate from the events READ cache
// (eventsCachePersister.ts uses casa-tabor-events-cache) -- a write queue and
// a read cache are different concerns with different lifetimes and should
// never share a namespace.
const writeQueueStore = createStore('casa-tabor-write-queue', 'pending-writes')

export interface QueuedWrite {
  id: string
  kind: string
  payload: unknown
  createdAt: number
  attempts: number
}

// Distinguishes "this failed because we're offline / the network dropped"
// (queueable -- will very likely succeed once reconnected) from "this failed
// because the server rejected it" (a validation error, a constraint
// violation -- retrying later changes nothing, queueing it would just hide a
// real error from the user). `navigator.onLine === false` alone is
// sufficient (nothing left the device); otherwise a TypeError is the
// signature of a fetch that never reached a server at all (Chrome's own
// wording is literally "Failed to fetch").
export function isConnectivityFailure(error: unknown, isOnline: boolean): boolean {
  if (!isOnline) return true
  return error instanceof TypeError
}

export async function enqueueWrite(job: Omit<QueuedWrite, 'attempts'> & { attempts?: number }): Promise<void> {
  await set(job.id, { ...job, attempts: job.attempts ?? 0 } satisfies QueuedWrite, writeQueueStore)
}

export async function dequeueWrite(id: string): Promise<void> {
  await del(id, writeQueueStore)
}

export async function listQueuedWrites(): Promise<QueuedWrite[]> {
  const ids = await keys(writeQueueStore)
  const jobs = await Promise.all(ids.map((id) => get<QueuedWrite>(id, writeQueueStore)))
  return jobs.filter((job): job is QueuedWrite => Boolean(job)).sort((a, b) => a.createdAt - b.createdAt)
}

// Replays every queued job in creation order via the caller-supplied handler
// for its `kind`. A job that fails again is left in the queue (with its
// attempt count bumped) for the next drain, rather than being dropped --
// silently losing a household member's attempted change would be worse than
// a stale queue entry. A job with no matching handler is left alone too
// (forward-compatible with old queue entries from a previous app version).
export async function drainQueue(handlers: Record<string, (payload: unknown) => Promise<void>>): Promise<void> {
  const jobs = await listQueuedWrites()
  for (const job of jobs) {
    const handler = handlers[job.kind]
    if (!handler) continue
    try {
      await handler(job.payload)
      await dequeueWrite(job.id)
    } catch (err) {
      console.warn(`[offlineWriteQueue] replay failed for ${job.kind}/${job.id}, will retry on next reconnect:`, err)
      await set(job.id, { ...job, attempts: job.attempts + 1 } satisfies QueuedWrite, writeQueueStore)
    }
  }
}
