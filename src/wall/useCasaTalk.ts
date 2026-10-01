import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import type { CasaTalkState } from './casaTalk'

export interface CasaTalkProps {
  state: CasaTalkState
  /** The saved value has loaded (nothing reaches the phones before it has: it would repeat on every reload). */
  ready: boolean
  save: (change: CasaTalkState) => Promise<void>
  /** The wall alone sends the phone notice (21c). */
  push?: (message: { title: string; body: string; tag: string; url: string }) => Promise<void>
}

/** What Casa was asked to hold, and what already reached the phones (canvas row 21): one settings value. */
export const CASA_TALK_KEY = 'wall_casa_talk'

export function useCasaTalk(): CasaTalkProps {
  const queryClient = useQueryClient()
  const { data } = useSetting<CasaTalkState>(CASA_TALK_KEY, { staleTime: 10_000, refetchInterval: 20_000, refetchOnWindowFocus: true })
  const save = useCallback(async (change: CasaTalkState) => {
    const queryKey = settingsQueryKey(CASA_TALK_KEY)
    const previous = queryClient.getQueryData<CasaTalkState | null>(queryKey) ?? {}
    const next = { snoozed: { ...previous.snoozed, ...change.snoozed }, pushed: { ...previous.pushed, ...change.pushed } }
    queryClient.setQueryData(queryKey, next)
    const { error } = await setSetting(CASA_TALK_KEY, next)
    if (error) {
      queryClient.setQueryData(queryKey, previous)
      throw error
    }
  }, [queryClient])
  return { state: data ?? {}, ready: data !== undefined, save }
}
