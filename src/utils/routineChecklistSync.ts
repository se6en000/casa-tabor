import { supabase } from '../lib/supabase.ts'

export const ROUTINE_CHECKLIST_SETTINGS_KEY = 'routine_checklist_completions'
export const ROUTINE_CHECKLIST_STORAGE_KEY = 'casa_routine_checklist_completions'
export const ROUTINE_CHECKLIST_REALTIME_CHANNEL = 'casa-routine-checklist-sync'
export const ROUTINE_CHECKLIST_BROADCAST_EVENT = 'checklist-item-toggled'
export const ROUTINE_CHECKLIST_DOM_EVENT = 'casa:routine-checklist-toggled'

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export interface ChecklistTogglePayload {
  id: string
  completed: boolean
  senderId?: string
  timestamp?: number
}

// ── In-Memory & Local Storage Cache ──────────────────────────────────────────
export function getStoredRoutineChecklistCompletions(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(ROUTINE_CHECKLIST_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveStoredRoutineChecklistCompletions(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(ROUTINE_CHECKLIST_STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

// ── Realtime Broadcast Channel Singleton ─────────────────────────────────────
let activeRealtimeChannel: ReturnType<typeof supabase.channel> | null = null
let channelSubscriberCount = 0
const broadcastListeners = new Set<(id: string, completed: boolean, fullMap: Record<string, boolean>) => void>()

function getOrCreateChecklistRealtimeChannel() {
  if (activeRealtimeChannel) return activeRealtimeChannel

  activeRealtimeChannel = supabase
    .channel(ROUTINE_CHECKLIST_REALTIME_CHANNEL)
    .on(
      'broadcast' as any,
      { event: ROUTINE_CHECKLIST_BROADCAST_EVENT },
      ({ payload }: { payload?: ChecklistTogglePayload }) => {
        if (!payload || !payload.id) return
        if (payload.senderId === CLIENT_INSTANCE_ID) {
          // Ignore echo of our own broadcast
          return
        }

        const currentMap = getStoredRoutineChecklistCompletions()
        const nextMap = { ...currentMap, [payload.id]: Boolean(payload.completed) }
        saveStoredRoutineChecklistCompletions(nextMap)

        broadcastListeners.forEach((listener) => {
          try {
            listener(payload.id, Boolean(payload.completed), nextMap)
          } catch (err) {
            console.error('[RoutineChecklistSync] Listener error:', err)
          }
        })
      }
    )
    .subscribe((status) => {
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        console.warn('[RoutineChecklistSync] Realtime channel status:', status)
      }
    })

  return activeRealtimeChannel
}

function releaseChecklistRealtimeChannel() {
  channelSubscriberCount = Math.max(0, channelSubscriberCount - 1)
  if (channelSubscriberCount === 0 && activeRealtimeChannel) {
    try {
      supabase.removeChannel(activeRealtimeChannel)
    } catch {}
    activeRealtimeChannel = null
  }
}

/**
 * Loads the current routine checklist completions from Supabase `settings` table.
 */
export async function fetchRoutineChecklistCompletions(): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .eq('key', ROUTINE_CHECKLIST_SETTINGS_KEY)
      .maybeSingle()

    if (error) {
      console.warn('[RoutineChecklistSync] Failed to fetch checklist completions from Supabase:', error.message)
      return getStoredRoutineChecklistCompletions()
    }

    if (data && data.value && typeof data.value === 'object') {
      const serverMap = data.value as Record<string, boolean>
      // Merge with local storage cache
      const localMap = getStoredRoutineChecklistCompletions()
      const merged = { ...localMap, ...serverMap }
      saveStoredRoutineChecklistCompletions(merged)
      return merged
    }

    return getStoredRoutineChecklistCompletions()
  } catch (err) {
    console.warn('[RoutineChecklistSync] Exception fetching completions:', err)
    return getStoredRoutineChecklistCompletions()
  }
}

let pendingSaveTimer: ReturnType<typeof setTimeout> | null = null
let pendingMergedMap: Record<string, boolean> | null = null

async function flushPersistToSupabase(mapToSave: Record<string, boolean>) {
  try {
    // Keep map bounded to prevent unbounded growth: prune entries older than 14 days
    const pruned: Record<string, boolean> = {}
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - 14)
    const cutoffStr = cutoffDate.toISOString().slice(0, 10)

    for (const [key, val] of Object.entries(mapToSave)) {
      // Keys formatted like item-xxx-YYYY-MM-DD
      const dateMatch = key.match(/\d{4}-\d{2}-\d{2}/)
      if (dateMatch) {
        if (dateMatch[0] >= cutoffStr) {
          pruned[key] = val
        }
      } else {
        pruned[key] = val
      }
    }

    const { error } = await supabase.from('settings').upsert(
      {
        key: ROUTINE_CHECKLIST_SETTINGS_KEY,
        value: pruned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
    if (error) {
      console.warn('[RoutineChecklistSync] Could not save checklist completions to Supabase settings:', error.message)
    }
  } catch (err) {
    console.warn('[RoutineChecklistSync] Exception upserting to Supabase settings:', err)
  }
}

/**
 * Persists a checklist item toggle to local storage, dispatches local DOM events,
 * broadcasts instantly over Supabase Realtime to other devices, and writes to Supabase settings.
 */
export async function saveRoutineChecklistToggle(
  id: string,
  completed: boolean,
  options?: { skipBroadcast?: boolean; skipCloud?: boolean }
): Promise<void> {
  const currentMap = getStoredRoutineChecklistCompletions()
  const nextMap = { ...currentMap, [id]: completed }

  // 1. Local storage cache (0ms)
  saveStoredRoutineChecklistCompletions(nextMap)

  // 2. Dispatch local DOM event for same-window / component sync (0ms)
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(ROUTINE_CHECKLIST_DOM_EVENT, {
        detail: { id, completed, map: nextMap },
      })
    )
  }

  // 3. Broadcast to all other connected Casa Tabor devices over Supabase Realtime (~100-250ms)
  if (!options?.skipBroadcast) {
    try {
      const channel = getOrCreateChecklistRealtimeChannel()
      channel.send({
        type: 'broadcast',
        event: ROUTINE_CHECKLIST_BROADCAST_EVENT,
        payload: {
          id,
          completed,
          senderId: CLIENT_INSTANCE_ID,
          timestamp: Date.now(),
        },
      }).catch((err: unknown) => {
        console.warn('[RoutineChecklistSync] Realtime broadcast send error:', err)
      })
    } catch (err) {
      console.warn('[RoutineChecklistSync] Exception sending realtime broadcast:', err)
    }
  }

  // 4. Debounced persist to Supabase `settings` table (low egress, durable cloud storage)
  if (!options?.skipCloud) {
    pendingMergedMap = nextMap
    if (pendingSaveTimer) clearTimeout(pendingSaveTimer)
    pendingSaveTimer = setTimeout(() => {
      if (pendingMergedMap) {
        void flushPersistToSupabase(pendingMergedMap)
        pendingMergedMap = null
      }
    }, 400)
  }
}

/**
 * Subscribes to real-time checklist changes from other connected devices,
 * local storage (other browser tabs), and local custom events.
 */
export function subscribeToRoutineChecklistSync(
  onToggle: (id: string, completed: boolean, fullMap: Record<string, boolean>) => void
): () => void {
  broadcastListeners.add(onToggle)
  channelSubscriberCount++
  getOrCreateChecklistRealtimeChannel()

  const onDomSync = (event: Event) => {
    const detail = (event as CustomEvent<{ id: string; completed: boolean; map: Record<string, boolean> }>).detail
    if (detail && detail.id) {
      onToggle(detail.id, detail.completed, detail.map)
    }
  }

  const onStorageSync = (event: StorageEvent) => {
    if (event.key !== ROUTINE_CHECKLIST_STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue) as Record<string, boolean>
      if (parsed && typeof parsed === 'object') {
        const changedKey = Object.keys(parsed)[0] || ''
        onToggle(changedKey, Boolean(parsed[changedKey]), parsed)
      }
    } catch {}
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(ROUTINE_CHECKLIST_DOM_EVENT, onDomSync as EventListener)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageSync)
  }

  return () => {
    broadcastListeners.delete(onToggle)
    releaseChecklistRealtimeChannel()
    if (typeof document !== 'undefined') {
      document.removeEventListener(ROUTINE_CHECKLIST_DOM_EVENT, onDomSync as EventListener)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageSync)
    }
  }
}
