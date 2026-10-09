import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import { TASTE_KEY, tasteOf, type GuideTaste } from '../../supabase/functions/_shared/guide.mjs'

// Settings › Your taste (canvas 85D; Jake, Oct 9): what the guide reads to pick for the two of them. One settings value;
// each change saved at once.

export interface GuideTasteProps { taste: GuideTaste; save: (next: GuideTaste) => Promise<void> }

export function useGuideTaste(): GuideTasteProps {
  const queryClient = useQueryClient()
  const { data } = useSetting<GuideTaste>(TASTE_KEY, { staleTime: 60_000 })
  const save = useCallback(async (next: GuideTaste) => {
    const queryKey = settingsQueryKey(TASTE_KEY)
    const previous = queryClient.getQueryData<GuideTaste | null>(queryKey) ?? null
    queryClient.setQueryData(queryKey, next)
    const { error } = await setSetting(TASTE_KEY, next)
    if (error) {
      queryClient.setQueryData(queryKey, previous)
      throw new Error(error.message)
    }
  }, [queryClient])
  return { taste: tasteOf(data), save }
}
