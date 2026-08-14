import { supabase } from '../lib/supabase.ts'
import type { DinnerPlan, DinnerMode } from '../types'

export const DINNER_PLAN_SETTINGS_KEY = 'tonight_kitchen_plan'
export const DINNER_PLAN_STORAGE_KEY = 'casa-tonight-kitchen-plan'
export const DINNER_PLAN_REALTIME_CHANNEL = 'casa-tonight-dinner-sync'
export const DINNER_PLAN_BROADCAST_EVENT = 'dinner-plan-updated'
export const DINNER_PLAN_DOM_EVENT = 'casa:dinner-plan-updated'

export const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

export const VALID_DINNER_MODES: ReadonlySet<DinnerMode> = new Set([
  'cook',
  'takeout',
  'leftovers',
  'dineout',
])

export function isValidDinnerPlan(candidate: unknown): candidate is DinnerPlan {
  if (!candidate || typeof candidate !== 'object') return false
  const p = candidate as Partial<DinnerPlan>
  if (typeof p.title !== 'string' || !p.title.trim()) return false
  if (typeof p.mode !== 'string' || !VALID_DINNER_MODES.has(p.mode as DinnerMode)) return false
  return true
}

export function normalizeDinnerPlan(raw: unknown, fallback?: DinnerPlan): DinnerPlan | null {
  if (!raw || typeof raw !== 'object') return fallback ?? null
  const r = raw as Record<string, unknown>
  const mode: DinnerMode = VALID_DINNER_MODES.has(r.mode as DinnerMode)
    ? (r.mode as DinnerMode)
    : 'cook'
  const title = typeof r.title === 'string' && r.title.trim() ? r.title.trim() : fallback?.title ?? ''
  if (!title) return fallback ?? null

  return {
    mode,
    title,
    subtitle: typeof r.subtitle === 'string' ? r.subtitle : (fallback?.subtitle ?? ''),
    targetTime: typeof r.targetTime === 'string' ? r.targetTime : (fallback?.targetTime ?? '6:30 PM Target'),
    chefOrDriver: typeof r.chefOrDriver === 'string' ? r.chefOrDriver : undefined,
    statusBadge: typeof r.statusBadge === 'string' ? r.statusBadge : (fallback?.statusBadge ?? 'Ingredients ready'),
    isPast: typeof r.isPast === 'boolean' ? r.isPast : undefined,
    notes: typeof r.notes === 'string' ? r.notes : undefined,
    updatedAt: typeof r.updatedAt === 'string' ? r.updatedAt : (typeof r.updated_at === 'string' ? r.updated_at : new Date().toISOString()),
  }
}

// ── Realtime Broadcast Channel Singleton ─────────────────────────────────────
let activeRealtimeChannel: ReturnType<typeof supabase.channel> | null = null
let channelSubscriberCount = 0
const broadcastListeners = new Set<(plan: DinnerPlan) => void>()

function getOrCreateDinnerRealtimeChannel() {
  if (activeRealtimeChannel) return activeRealtimeChannel

  activeRealtimeChannel = supabase
    .channel(DINNER_PLAN_REALTIME_CHANNEL)
    .on(
      'broadcast',
      { event: DINNER_PLAN_BROADCAST_EVENT },
      ({ payload }: { payload?: { plan?: unknown; senderId?: string; timestamp?: number } }) => {
        if (!payload || !payload.plan) return
        if (payload.senderId === CLIENT_INSTANCE_ID) {
          // Ignore echo of our own broadcast
          return
        }
        const parsed = normalizeDinnerPlan(payload.plan)
        if (parsed) {
          try {
            localStorage.setItem(DINNER_PLAN_STORAGE_KEY, JSON.stringify(parsed))
          } catch {}
          broadcastListeners.forEach((listener) => {
            try {
              listener(parsed)
            } catch (err) {
              console.error('[DinnerSync] Listener error:', err)
            }
          })
        }
      }
    )
    .subscribe((status) => {
      if (status === 'TIMED_OUT' || status === 'CHANNEL_ERROR') {
        console.warn('[DinnerSync] Realtime channel status:', status)
      }
    })

  return activeRealtimeChannel
}

function releaseDinnerRealtimeChannel() {
  channelSubscriberCount = Math.max(0, channelSubscriberCount - 1)
  if (channelSubscriberCount === 0 && activeRealtimeChannel) {
    try {
      supabase.removeChannel(activeRealtimeChannel)
    } catch {}
    activeRealtimeChannel = null
  }
}

/**
 * Loads the current dinner plan from Supabase `settings` table.
 */
export async function fetchTonightDinnerPlan(): Promise<DinnerPlan | null> {
  try {
    const { data, error } = await supabase
      .from('settings')
      .select('value, updated_at')
      .eq('key', DINNER_PLAN_SETTINGS_KEY)
      .maybeSingle()

    if (error) {
      console.warn('[DinnerSync] Failed to fetch dinner plan from Supabase:', error.message)
      return null
    }

    if (!data || !data.value) return null
    const plan = normalizeDinnerPlan({
      ...(typeof data.value === 'object' ? data.value : {}),
      updatedAt: data.updated_at,
    })
    return plan
  } catch (err) {
    console.warn('[DinnerSync] Exception fetching dinner plan:', err)
    return null
  }
}

/**
 * Persists dinner plan to local storage, dispatches local DOM events,
 * writes to Supabase `settings` table, and broadcasts to all other connected devices.
 */
export async function saveTonightDinnerPlan(
  plan: DinnerPlan,
  options?: { skipBroadcast?: boolean; skipCloud?: boolean }
): Promise<void> {
  const timestamp = new Date().toISOString()
  const syncedPlan: DinnerPlan = {
    ...plan,
    updatedAt: timestamp,
  }

  // 1. Local storage cache
  try {
    localStorage.setItem(DINNER_PLAN_STORAGE_KEY, JSON.stringify(syncedPlan))
  } catch {}

  // 2. Dispatch local DOM event for same-window / component sync
  if (typeof document !== 'undefined') {
    document.dispatchEvent(
      new CustomEvent(DINNER_PLAN_DOM_EVENT, {
        detail: syncedPlan,
      })
    )
  }

  // 3. Broadcast to all other connected Casa Tabor devices over Supabase Realtime
  if (!options?.skipBroadcast) {
    try {
      const channel = getOrCreateDinnerRealtimeChannel()
      channel.send({
        type: 'broadcast',
        event: DINNER_PLAN_BROADCAST_EVENT,
        payload: {
          plan: syncedPlan,
          senderId: CLIENT_INSTANCE_ID,
          timestamp: Date.now(),
        },
      }).catch((err: unknown) => {
        console.warn('[DinnerSync] Realtime broadcast send error:', err)
      })
    } catch (err) {
      console.warn('[DinnerSync] Exception sending realtime broadcast:', err)
    }
  }

  // 4. Persist to Supabase `settings` table for durable cross-session and cross-device source of truth
  if (!options?.skipCloud) {
    try {
      const { error } = await supabase.from('settings').upsert(
        {
          key: DINNER_PLAN_SETTINGS_KEY,
          value: syncedPlan,
          updated_at: timestamp,
        },
        { onConflict: 'key' }
      )
      if (error) {
        console.warn('[DinnerSync] Could not save dinner plan to Supabase settings:', error.message)
      }
    } catch (err) {
      console.warn('[DinnerSync] Exception upserting to Supabase settings:', err)
    }
  }
}

/**
 * Subscribes to real-time dinner plan changes from other connected devices,
 * local storage (other tabs), and local custom events.
 */
export function subscribeToTonightDinnerPlan(
  onPlanChange: (plan: DinnerPlan) => void
): () => void {
  broadcastListeners.add(onPlanChange)
  channelSubscriberCount++
  getOrCreateDinnerRealtimeChannel()

  const onDomSync = (event: Event) => {
    const detail = (event as CustomEvent<DinnerPlan>).detail
    if (detail && isValidDinnerPlan(detail)) {
      onPlanChange(detail)
    }
  }

  const onStorageSync = (event: StorageEvent) => {
    if (event.key !== DINNER_PLAN_STORAGE_KEY || !event.newValue) return
    try {
      const parsed = JSON.parse(event.newValue)
      const normalized = normalizeDinnerPlan(parsed)
      if (normalized) {
        onPlanChange(normalized)
      }
    } catch {}
  }

  if (typeof document !== 'undefined') {
    document.addEventListener(DINNER_PLAN_DOM_EVENT, onDomSync as EventListener)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', onStorageSync)
  }

  return () => {
    broadcastListeners.delete(onPlanChange)
    releaseDinnerRealtimeChannel()
    if (typeof document !== 'undefined') {
      document.removeEventListener(DINNER_PLAN_DOM_EVENT, onDomSync as EventListener)
    }
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorageSync)
    }
  }
}
