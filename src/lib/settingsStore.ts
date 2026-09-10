import { useQuery, type UseQueryOptions } from '@tanstack/react-query'
import type { PostgrestError } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'

export async function getSetting<T>(key: string): Promise<{ data: T | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.from('settings').select('value').eq('key', key).maybeSingle()
  return { data: (data?.value ?? null) as T | null, error }
}

export async function getSettingRow<T>(
  key: string,
): Promise<{ data: { value: T; updatedAt: string } | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.from('settings').select('value, updated_at').eq('key', key).maybeSingle()
  if (!data) return { data: null, error }
  return { data: { value: data.value as T, updatedAt: data.updated_at as string }, error }
}

export async function getSettings<T = unknown>(
  keys: string[],
): Promise<{ data: Record<string, T> | null; error: PostgrestError | null }> {
  const { data, error } = await supabase.from('settings').select('key, value').in('key', keys)
  if (!data) return { data: null, error }
  return { data: Object.fromEntries(data.map((row) => [row.key, row.value as T])), error }
}

export async function setSetting<T>(key: string, value: T): Promise<{ error: PostgrestError | null }> {
  const { error } = await supabase
    .from('settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' })
  return { error }
}

export async function setSettings(
  entries: Array<{ key: string; value: unknown }>,
): Promise<{ error: PostgrestError | null }> {
  const updated_at = new Date().toISOString()
  const { error } = await supabase
    .from('settings')
    .upsert(
      entries.map((entry) => ({ key: entry.key, value: entry.value, updated_at })),
      { onConflict: 'key' },
    )
  return { error }
}

export const settingsQueryKey = (key: string) => ['settings', key] as const

export function useSetting<T>(
  key: string,
  options?: Partial<UseQueryOptions<T | null, PostgrestError>>,
) {
  return useQuery<T | null, PostgrestError>({
    queryKey: settingsQueryKey(key),
    queryFn: async () => {
      const { data, error } = await getSetting<T>(key)
      if (error) throw error
      return data
    },
    ...options,
  })
}
