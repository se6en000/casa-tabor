import { useCallback } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import type { TravelSettings } from './engine/travel'

/** The trip sheets' choices (canvas 19d), one settings value keyed by each trip's key (its flight out). */
export const TRAVEL_SETTINGS_KEY = 'wall_travel'
export type WallTravelSettings = Record<string, TravelSettings>

/** Re-read like the trip decisions (the settings table has no live feed). */
const REFRESH_MS = 20_000

export function useWallTravel(): { settings: WallTravelSettings; save: (key: string, change: TravelSettings) => Promise<void> } {
  const queryClient = useQueryClient()
  const { data } = useSetting<WallTravelSettings>(TRAVEL_SETTINGS_KEY, { staleTime: 10_000, refetchInterval: REFRESH_MS, refetchOnWindowFocus: true })
  const save = useCallback(async (key: string, change: TravelSettings) => {
    const queryKey = settingsQueryKey(TRAVEL_SETTINGS_KEY)
    const previous = queryClient.getQueryData<WallTravelSettings | null>(queryKey) ?? {}
    // Shown at once; the write follows (a failed write puts it back).
    const next = { ...previous, [key]: { ...(previous[key] ?? {}), ...change } }
    queryClient.setQueryData(queryKey, next)
    const { error } = await setSetting(TRAVEL_SETTINGS_KEY, next)
    if (error) {
      queryClient.setQueryData(queryKey, previous)
      throw error
    }
  }, [queryClient])
  return { settings: data ?? {}, save }
}
