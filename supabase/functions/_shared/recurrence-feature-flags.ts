import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'

export interface RecurrenceFeatureFlags {
  recurrence_v2_read: boolean
  recurrence_v2_write: boolean
  google_sync_v2: boolean
  recurrence_v2_delete: boolean
}

const DISABLED_FLAGS: RecurrenceFeatureFlags = {
  recurrence_v2_read: false,
  recurrence_v2_write: false,
  google_sync_v2: false,
  recurrence_v2_delete: false,
}

export async function loadRecurrenceFeatureFlags(
  supabase: SupabaseClient,
): Promise<RecurrenceFeatureFlags> {
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', 'recurrence_v2_flags')
    .maybeSingle()

  if (error) throw new Error(`Could not load recurrence feature flags: ${error.message}`)
  const value = data?.value
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DISABLED_FLAGS }

  const source = value as Record<string, unknown>
  return {
    recurrence_v2_read: source.recurrence_v2_read === true,
    recurrence_v2_write: source.recurrence_v2_write === true,
    google_sync_v2: source.google_sync_v2 === true,
    recurrence_v2_delete: source.recurrence_v2_delete === true,
  }
}
