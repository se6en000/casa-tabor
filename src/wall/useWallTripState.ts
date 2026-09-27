import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import { TRIP_STATE_SETTINGS_KEY, type WallTripState } from './tripState'

/**
 * How often every screen re-reads the decisions. They are one shared setting with no live feed (the
 * settings table isn't published — it also holds keys), and until 2026-09-27 other screens never
 * re-read it: the kiosk showed old "who drives" decisions until it reloaded.
 */
const TRIP_STATE_REFRESH_MS = 20_000

/** The wall's per-day trip decisions (settings key `wall_trip_state`); saves update the wall at once. */
export function useWallTripState(): { state: WallTripState; save: (next: WallTripState) => Promise<void> } {
  const queryClient = useQueryClient()
  const { data } = useSetting<WallTripState>(TRIP_STATE_SETTINGS_KEY, {
    staleTime: 10_000,
    refetchInterval: TRIP_STATE_REFRESH_MS,
    refetchOnWindowFocus: true,
  })
  const save = useCallback(async (next: WallTripState) => {
    const key = settingsQueryKey(TRIP_STATE_SETTINGS_KEY)
    const previous = queryClient.getQueryData<WallTripState | null>(key)
    queryClient.setQueryData(key, next)
    const { error } = await setSetting(TRIP_STATE_SETTINGS_KEY, next)
    if (error) {
      queryClient.setQueryData(key, previous ?? null)
      throw error
    }
  }, [queryClient])
  return { state: data ?? {}, save }
}
