import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister'
import { createStore, get, set, del } from 'idb-keyval'
import type { AsyncStorage } from '@tanstack/query-persist-client-core'
import type { Query } from '@tanstack/react-query'

// Calendar resilience: stale-while-revalidate.
//
// On page load/reload, React Query rehydrates the calendar's last-known data
// from this IndexedDB store instantly (no network wait), while the real
// fetch runs in parallel and reconciles when it lands. A backend hiccup (the
// 2026-09-22/23 cron-collision incident that produced a 48s calendar load is
// the concrete case this exists for) then reads as "shows what it showed
// before, updates a few seconds later" instead of a blank skeleton.
//
// Deliberately scoped to ONLY the events-range queries (week/rolling/month
// from useEventsForRange in useCalendarEvents.ts) -- not the whole app's
// query cache. Settings, grocery, ai_conversations, saved_places etc. are
// never written here: smaller persisted payload, and nothing outside the
// calendar's own read path is affected by this feature at all.

// A dedicated IndexedDB database/store -- does not share a namespace with
// anything else idb-keyval or the app might use.
const eventsCacheStore = createStore('casa-tabor-events-cache', 'query-cache')

const idbAsyncStorage: AsyncStorage<string> = {
  getItem: (key) => get(key, eventsCacheStore).then((v) => v ?? null),
  setItem: (key, value) => set(key, value, eventsCacheStore),
  removeItem: (key) => del(key, eventsCacheStore),
}

export const eventsCachePersister = createAsyncStoragePersister({
  storage: idbAsyncStorage,
  key: 'casa-tabor-events-query-cache',
  // Debounce writes so rapid-fire cache updates (e.g. several range queries
  // resolving within the same second) don't each trigger their own
  // IndexedDB write.
  throttleTime: 1000,
})

// Bump this whenever the persisted shape changes -- a field renamed on
// EventWithDetails, a change to EVENT_SUMMARY_SELECT, or anything else that
// would make an old persisted entry structurally disagree with the current
// code. An unbumped buster after such a change is the one real footgun of
// this feature: stale-shaped data silently rendering against new code.
export const EVENTS_CACHE_BUSTER = 'events-cache-v1'

// Bounded so a genuinely old snapshot (kiosk unplugged for days) gets
// discarded outright rather than shown as if current. In practice this
// rarely matters: each range query's key encodes its own date window (e.g.
// ['events','rolling', start.toISOString()]), so a new day already means a
// cache MISS on the old key before this ceiling would ever come into play --
// this is a backstop, not the primary staleness mechanism.
export const EVENTS_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 // 24 hours

export function shouldPersistQuery(query: Pick<Query, 'queryKey'>): boolean {
  return query.queryKey[0] === 'events'
}
