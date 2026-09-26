import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import { KEEP_FROM_SETTINGS_KEY, withKeptFrom, type KeepFrom } from './audience'

/** Who each event is kept from (settings key `family_keep_from`); a change shows everywhere at once. */
export function useKeepFrom(): { keep: KeepFrom; setKeptFrom: (eventId: string, memberIds: string[]) => Promise<void> } {
  const queryClient = useQueryClient()
  const { data } = useSetting<KeepFrom>(KEEP_FROM_SETTINGS_KEY, { staleTime: 60_000 })
  const setKeptFrom = useCallback(async (eventId: string, memberIds: string[]) => {
    const key = settingsQueryKey(KEEP_FROM_SETTINGS_KEY)
    const previous = queryClient.getQueryData<KeepFrom | null>(key)
    const next = withKeptFrom(previous ?? {}, eventId, memberIds)
    queryClient.setQueryData(key, next)
    const { error } = await setSetting(KEEP_FROM_SETTINGS_KEY, next)
    if (error) {
      queryClient.setQueryData(key, previous ?? null)
      throw error
    }
  }, [queryClient])
  return { keep: data ?? {}, setKeptFrom }
}
