export const GROCERY_PREDICTION_PUSH_DAYS = 3
export const GROCERY_PREDICTION_DISMISS_DAYS = 14

const DAY_MS = 24 * 60 * 60 * 1000

export type GroceryPredictionDeferralEntry = {
  name: string
  deferred_until: string
  updated_at: string
}

export type GroceryPredictionDeferrals = Record<string, GroceryPredictionDeferralEntry>

export function normalizeGroceryNameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function sanitizeGroceryPredictionDeferrals(raw: unknown, nowMs: number): GroceryPredictionDeferrals {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const parsed: GroceryPredictionDeferrals = {}
  for (const [rawKey, rawValue] of Object.entries(raw as Record<string, unknown>)) {
    if (!rawValue || typeof rawValue !== 'object' || Array.isArray(rawValue)) continue
    const entry = rawValue as Record<string, unknown>
    const nameCandidate = typeof entry.name === 'string' && entry.name.trim()
      ? entry.name
      : rawKey
    const key = normalizeGroceryNameKey(nameCandidate)
    if (!key) continue
    const deferredUntilRaw = typeof entry.deferred_until === 'string' ? entry.deferred_until : ''
    const deferredUntilMs = Date.parse(deferredUntilRaw)
    if (!Number.isFinite(deferredUntilMs) || deferredUntilMs <= nowMs) continue
    const previous = parsed[key]
    if (previous) {
      const previousMs = Date.parse(previous.deferred_until)
      if (Number.isFinite(previousMs) && previousMs >= deferredUntilMs) continue
    }
    parsed[key] = {
      name: String(nameCandidate).trim() || key,
      deferred_until: new Date(deferredUntilMs).toISOString(),
      updated_at: typeof entry.updated_at === 'string'
        ? entry.updated_at
        : new Date(nowMs).toISOString(),
    }
  }
  return parsed
}

export function buildGroceryPredictionDeferredUntil(
  currentDeferredUntil: string | null | undefined,
  nowMs: number,
  daysToAdd: number,
): string {
  const safeDays = Math.max(1, Math.round(daysToAdd))
  const currentMs = currentDeferredUntil ? Date.parse(currentDeferredUntil) : Number.NaN
  const baseMs = Number.isFinite(currentMs) && currentMs > nowMs ? currentMs : nowMs
  return new Date(baseMs + safeDays * DAY_MS).toISOString()
}

export function resolveGroceryPredictionDueAt(
  itemName: string,
  dueAt: number,
  deferrals: GroceryPredictionDeferrals,
  nowMs: number,
): { dueAt: number; deferredUntil: string | null; deferredActive: boolean } {
  const key = normalizeGroceryNameKey(itemName)
  const deferredUntil = deferrals[key]?.deferred_until ?? null
  const deferredMs = deferredUntil ? Date.parse(deferredUntil) : Number.NaN
  if (!Number.isFinite(deferredMs)) {
    return {
      dueAt,
      deferredUntil: null,
      deferredActive: false,
    }
  }
  return {
    dueAt: Math.max(dueAt, deferredMs),
    deferredUntil: new Date(deferredMs).toISOString(),
    deferredActive: deferredMs > nowMs,
  }
}
