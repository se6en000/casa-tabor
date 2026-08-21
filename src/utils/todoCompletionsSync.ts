import { supabase } from '../lib/supabase.ts'

export const TODO_COMPLETIONS_SETTINGS_KEY = 'household_todo_completions'
export const TODO_COMPLETIONS_STORAGE_KEY = 'casa_household_todo_completions'
export const TODO_COMPLETIONS_REALTIME_CHANNEL = 'casa-todos-sync'
export const TODO_COMPLETIONS_BROADCAST_EVENT = 'todo-toggled'
export const TODO_COMPLETIONS_DOM_EVENT = 'casa:todo-toggled'

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export interface TodoTogglePayload {
  id: string
  completed: boolean
  senderId?: string
  timestamp?: number
}

// ── In-Memory & Local Storage Cache ──────────────────────────────────────────
export function getStoredTodoCompletions(): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = localStorage.getItem(TODO_COMPLETIONS_STORAGE_KEY)
    const legacy = localStorage.getItem('casa_routine_checklist_completions')
    const parsedRaw = raw ? JSON.parse(raw) : {}
    const parsedLegacy = legacy ? JSON.parse(legacy) : {}
    return { ...parsedLegacy, ...parsedRaw }
  } catch {
    return {}
  }
}

export function saveStoredTodoCompletions(map: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(TODO_COMPLETIONS_STORAGE_KEY, JSON.stringify(map))
  } catch {}
}

// ── Realtime Broadcast Channel Singleton ─────────────────────────────────────
let activeRealtimeChannel: ReturnType<typeof supabase.channel> | null = null
let isChannelSubscribed = false
const messageOutbox: TodoTogglePayload[] = []
const broadcastListeners = new Set<(id: string, completed: boolean, fullMap: Record<string, boolean>) => void>()

function getOrCreateTodoRealtimeChannel() {
  if (activeRealtimeChannel) return activeRealtimeChannel

  activeRealtimeChannel = supabase
    .channel(TODO_COMPLETIONS_REALTIME_CHANNEL, {
      config: {
        broadcast: { self: false },
      },
    })
    .on(
      'broadcast' as any,
      { event: TODO_COMPLETIONS_BROADCAST_EVENT },
      ({ payload }: { payload?: TodoTogglePayload }) => {
        if (!payload || !payload.id) return
        if (payload.senderId === CLIENT_INSTANCE_ID) {
          // Ignore echo of our own broadcast
          return
        }

        const currentMap = getStoredTodoCompletions()
        const nextMap = { ...currentMap, [payload.id]: Boolean(payload.completed) }
        saveStoredTodoCompletions(nextMap)

        broadcastListeners.forEach((listener) => {
          try {
            listener(payload.id, Boolean(payload.completed), nextMap)
          } catch (err) {
            console.error('[TodoCompletionsSync] Listener error:', err)
          }
        })
      }
    )
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        isChannelSubscribed = true
        // Flush any queued outbox messages
        while (messageOutbox.length > 0) {
          const item = messageOutbox.shift()
          if (item && activeRealtimeChannel) {
            activeRealtimeChannel.send({
              type: 'broadcast',
              event: TODO_COMPLETIONS_BROADCAST_EVENT,
              payload: item,
            }).catch((err) => {
              console.warn('[TodoCompletionsSync] Error flushing outbox message:', err)
            })
          }
        }
      } else if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR' || status === 'CLOSED') {
        isChannelSubscribed = false
      }
    })

  return activeRealtimeChannel
}

/**
 * Loads the current todo completions from Supabase `settings` table.
 */
export async function fetchTodoCompletions(): Promise<Record<string, boolean>> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value')
      .in('key', [TODO_COMPLETIONS_SETTINGS_KEY, 'routine_checklist_completions'])

    if (error) {
      console.warn('[TodoCompletionsSync] Failed to fetch todo completions from Supabase:', error.message)
      return getStoredTodoCompletions()
    }

    const localMap = getStoredTodoCompletions()
    let merged = { ...localMap }

    if (data && Array.isArray(data)) {
      data.forEach((row) => {
        if (row && row.value && typeof row.value === 'object') {
          merged = { ...merged, ...(row.value as Record<string, boolean>) }
        }
      })
      saveStoredTodoCompletions(merged)
      return merged
    }

    return getStoredTodoCompletions()
  } catch (err) {
    console.warn('[TodoCompletionsSync] Exception fetching completions:', err)
    return getStoredTodoCompletions()
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
      const dateMatch = key.match(/\d{4}-\d{2}-\d{2}/)
      if (dateMatch) {
        if (dateMatch[0] >= cutoffStr) {
          pruned[key] = val
        }
      } else {
        pruned[key] = val
      }
    }

    await supabase.from('settings').upsert(
      {
        key: TODO_COMPLETIONS_SETTINGS_KEY,
        value: pruned,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    )
  } catch (err) {
    console.warn('[TodoCompletionsSync] Exception upserting to Supabase settings:', err)
  }
}

/**
 * Persists a todo item toggle to local storage, dispatches local DOM events,
 * broadcasts instantly over Supabase Realtime to all connected devices, and writes to Supabase settings.
 */
export async function saveTodoToggle(
  id: string,
  completed: boolean,
  options?: { skipBroadcast?: boolean; skipCloud?: boolean }
): Promise<void> {
  const currentMap = getStoredTodoCompletions()
  const nextMap = { ...currentMap, [id]: completed }

  // 1. Local storage cache (0ms)
  saveStoredTodoCompletions(nextMap)

  // 2. Dispatch local DOM event for same-window / multi-component sync (0ms)
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(TODO_COMPLETIONS_DOM_EVENT, {
        detail: { id, completed, map: nextMap },
      })
    )
  }

  // 3. Broadcast to all other connected Casa Tabor devices over Supabase Realtime (~100-250ms)
  if (!options?.skipBroadcast) {
    const payload: TodoTogglePayload = {
      id,
      completed,
      senderId: CLIENT_INSTANCE_ID,
      timestamp: Date.now(),
    }

    try {
      const channel = getOrCreateTodoRealtimeChannel()
      if (isChannelSubscribed) {
        channel.send({
          type: 'broadcast',
          event: TODO_COMPLETIONS_BROADCAST_EVENT,
          payload,
        }).catch((err: unknown) => {
          console.warn('[TodoCompletionsSync] Realtime broadcast send error:', err)
          messageOutbox.push(payload)
        })
      } else {
        messageOutbox.push(payload)
      }
    } catch (err) {
      console.warn('[TodoCompletionsSync] Exception sending realtime broadcast:', err)
      messageOutbox.push(payload)
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
    }, 150)
  }
}

/**
 * Subscribes to real-time todo completions changes from other connected devices,
 * local storage (other browser tabs), and local custom events.
 */
export function subscribeToTodoSync(
  onToggle: (id: string, completed: boolean, fullMap: Record<string, boolean>) => void
): () => void {
  broadcastListeners.add(onToggle)
  getOrCreateTodoRealtimeChannel()

  const onDomSync = (event: Event) => {
    const detail = (event as CustomEvent<{ id: string; completed: boolean; map: Record<string, boolean> }>).detail
    if (detail && detail.id) {
      onToggle(detail.id, detail.completed, detail.map)
    }
  }

  const onStorageSync = (event: StorageEvent) => {
    if (
      (event.key === TODO_COMPLETIONS_STORAGE_KEY || event.key === 'casa_routine_checklist_completions') &&
      event.newValue
    ) {
      try {
        const parsed = JSON.parse(event.newValue) as Record<string, boolean>
        if (parsed && typeof parsed === 'object') {
          const changedKey = Object.keys(parsed)[0] || ''
          onToggle(changedKey, Boolean(parsed[changedKey]), parsed)
        }
      } catch {}
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(TODO_COMPLETIONS_DOM_EVENT, onDomSync as EventListener)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageSync)
  }

  return () => {
    broadcastListeners.delete(onToggle)
    if (typeof document !== 'undefined') {
      document.removeEventListener(TODO_COMPLETIONS_DOM_EVENT, onDomSync as EventListener)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageSync)
    }
  }
}
