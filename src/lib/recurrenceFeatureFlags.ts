import { supabase } from './supabase'

export const RECURRENCE_FEATURE_FLAG_NAMES = [
  'recurrence_v2_read',
  'recurrence_v2_write',
  'google_sync_v2',
  'recurrence_v2_delete',
] as const

export type RecurrenceFeatureFlagName = typeof RECURRENCE_FEATURE_FLAG_NAMES[number]
export type RecurrenceFeatureFlags = Record<RecurrenceFeatureFlagName, boolean>

export const DISABLED_RECURRENCE_FEATURE_FLAGS: RecurrenceFeatureFlags = {
  recurrence_v2_read: false,
  recurrence_v2_write: false,
  google_sync_v2: false,
  recurrence_v2_delete: false,
}

export function normalizeRecurrenceFeatureFlags(value: unknown): RecurrenceFeatureFlags {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DISABLED_RECURRENCE_FEATURE_FLAGS }
  }

  const source = value as Record<string, unknown>
  return Object.fromEntries(
    RECURRENCE_FEATURE_FLAG_NAMES.map((name) => [name, source[name] === true]),
  ) as RecurrenceFeatureFlags
}

export async function loadRecurrenceFeatureFlags(): Promise<RecurrenceFeatureFlags> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'recurrence_v2_flags')
    .maybeSingle()

  if (error) throw new Error(`Could not load recurrence feature flags: ${error.message}`)
  return normalizeRecurrenceFeatureFlags(data?.value)
}
