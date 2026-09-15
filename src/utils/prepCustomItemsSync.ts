import { supabase } from '../lib/supabase.ts'
import { getSettings, setSetting } from '../lib/settingsStore.ts'

/**
 * User-typed additions to a day's Bedtime Prep Checklist (e.g. "Spirit Day
 * t-shirt", "Field trip money") -- deliberately NOT tied to any calendar
 * event or reminder. Keyed by the same yyyy-MM-dd dateKey the checklist
 * itself already uses, so an item added the night before for "tomorrow"
 * keeps showing once that date becomes "today", and simply stops being
 * shown once the day's departures are complete and the widget that renders
 * it is no longer on screen -- the same way the Hero already moves on from
 * morning_launchpad once allTodayDeparturesCompleted flips true.
 */
export interface CustomPrepItem {
  id: string
  label: string
}

export const PREP_CUSTOM_ITEMS_SETTINGS_KEY = 'household_prep_custom_items'
export const PREP_CUSTOM_ITEMS_STORAGE_KEY = 'casa_household_prep_custom_items'
export const PREP_CUSTOM_ITEMS_REALTIME_CHANNEL = 'casa-prep-custom-items-sync'
export const PREP_CUSTOM_ITEMS_BROADCAST_EVENT = 'prep-custom-items-changed'
export const PREP_CUSTOM_ITEMS_DOM_EVENT = 'casa:prep-custom-items-changed'

const CLIENT_INSTANCE_ID =
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

type CustomPrepItemsMap = Record<string, CustomPrepItem[]>

function newItemId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `item-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function getStoredCustomPrepItems(): CustomPrepItemsMap {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(PREP_CUSTOM_ITEMS_STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

function saveStoredCustomPrepItems(map: CustomPrepItemsMap): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(PREP_CUSTOM_ITEMS_STORAGE_KEY, JSON.stringify(map))
  } catch { /* ignore — best-effort, non-critical */ }
}

export async function fetchCustomPrepItems(): Promise<CustomPrepItemsMap> {
  try {
    const { data, error } = await getSettings<CustomPrepItemsMap>([PREP_CUSTOM_ITEMS_SETTINGS_KEY])
    if (error || !data?.[PREP_CUSTOM_ITEMS_SETTINGS_KEY]) {
      return getStoredCustomPrepItems()
    }
    const merged = { ...getStoredCustomPrepItems(), ...data[PREP_CUSTOM_ITEMS_SETTINGS_KEY] }
    saveStoredCustomPrepItems(merged)
    return merged
  } catch {
    return getStoredCustomPrepItems()
  }
}

// Keep the map from growing forever: only dateKey-prefixed entries within
// the last 14 days survive a write, matching the completion-tracking prune.
function pruneOldDates(map: CustomPrepItemsMap): CustomPrepItemsMap {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - 14)
  const cutoffStr = cutoff.toISOString().slice(0, 10)
  const pruned: CustomPrepItemsMap = {}
  for (const [dateKey, items] of Object.entries(map)) {
    if (dateKey >= cutoffStr) pruned[dateKey] = items
  }
  return pruned
}

let activeChannel: ReturnType<typeof supabase.channel> | null = null
let isChannelSubscribed = false
const listeners = new Set<(map: CustomPrepItemsMap) => void>()

function getOrCreateChannel() {
  if (activeChannel) return activeChannel
  activeChannel = supabase
    .channel(PREP_CUSTOM_ITEMS_REALTIME_CHANNEL, { config: { broadcast: { self: false } } })
    .on(
      'broadcast',
      { event: PREP_CUSTOM_ITEMS_BROADCAST_EVENT },
      ({ payload }: { payload: { senderId?: string; map: CustomPrepItemsMap } }) => {
        if (!payload || payload.senderId === CLIENT_INSTANCE_ID) return
        saveStoredCustomPrepItems(payload.map)
        listeners.forEach((listener) => {
          try {
            listener(payload.map)
          } catch (err) {
            console.error('[PrepCustomItemsSync] Listener error:', err)
          }
        })
      },
    )
    .subscribe((status) => {
      isChannelSubscribed = status === 'SUBSCRIBED'
    })
  return activeChannel
}

async function persist(nextMap: CustomPrepItemsMap): Promise<void> {
  const pruned = pruneOldDates(nextMap)
  saveStoredCustomPrepItems(pruned)

  if (typeof document !== 'undefined') {
    document.dispatchEvent(new CustomEvent(PREP_CUSTOM_ITEMS_DOM_EVENT, { detail: { map: pruned } }))
  }

  try {
    const channel = getOrCreateChannel()
    if (isChannelSubscribed) {
      void channel.send({
        type: 'broadcast',
        event: PREP_CUSTOM_ITEMS_BROADCAST_EVENT,
        payload: { senderId: CLIENT_INSTANCE_ID, map: pruned },
      })
    }
  } catch (err) {
    console.warn('[PrepCustomItemsSync] Realtime broadcast error:', err)
  }

  try {
    await setSetting(PREP_CUSTOM_ITEMS_SETTINGS_KEY, pruned)
  } catch (err) {
    console.warn('[PrepCustomItemsSync] Exception persisting to Supabase settings:', err)
  }
}

export async function addCustomPrepItem(dateKey: string, label: string): Promise<CustomPrepItem> {
  const trimmed = label.trim()
  const item: CustomPrepItem = { id: newItemId(), label: trimmed }
  const current = getStoredCustomPrepItems()
  const nextMap = { ...current, [dateKey]: [...(current[dateKey] || []), item] }
  await persist(nextMap)
  return item
}

export async function removeCustomPrepItem(dateKey: string, itemId: string): Promise<void> {
  const current = getStoredCustomPrepItems()
  const nextMap = { ...current, [dateKey]: (current[dateKey] || []).filter((i) => i.id !== itemId) }
  await persist(nextMap)
}

export function subscribeToCustomPrepItemsSync(onChange: (map: CustomPrepItemsMap) => void): () => void {
  listeners.add(onChange)
  getOrCreateChannel()

  const onDomSync = (event: Event) => {
    const detail = (event as CustomEvent<{ map: CustomPrepItemsMap }>).detail
    if (detail?.map) onChange(detail.map)
  }
  if (typeof document !== 'undefined') {
    document.addEventListener(PREP_CUSTOM_ITEMS_DOM_EVENT, onDomSync as EventListener)
  }

  return () => {
    listeners.delete(onChange)
    if (typeof document !== 'undefined') {
      document.removeEventListener(PREP_CUSTOM_ITEMS_DOM_EVENT, onDomSync as EventListener)
    }
  }
}
