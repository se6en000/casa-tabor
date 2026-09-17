import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Generous buffer over the Mac's actual poll interval (not visible from this repo --
// tune once the real ~/.casa-sync.env interval is confirmed). Deliberately polled via
// react-query rather than a realtime channel: this is a single cheap row read, not
// worth a dedicated subscription (see useFamilyRoutineIntelligence.ts's singleton
// realtime channel for why per-component channels are the thing to avoid here).
const STALE_THRESHOLD_MS = 30 * 60_000

export interface GrocerySyncHealth {
  lastSeenAt: Date | null
  isStale: boolean
}

export function useGrocerySyncHealth(): GrocerySyncHealth {
  const { data } = useQuery({
    queryKey: ['grocery-sync-heartbeat', 'sync-casa-to-ios'],
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from('sync_heartbeats')
        .select('last_seen_at')
        .eq('job_name', 'sync-casa-to-ios')
        .maybeSingle()
      if (error) {
        console.warn('[useGrocerySyncHealth] Failed to fetch sync heartbeat:', error.message)
        return null
      }
      return data?.last_seen_at ?? null
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  if (!data) {
    // No heartbeat row yet (e.g. right after this feature ships, before the Mac's
    // next poll cycle) -- don't alarm on absence, only on staleness.
    return { lastSeenAt: null, isStale: false }
  }

  const lastSeenAt = new Date(data)
  return {
    lastSeenAt,
    isStale: Date.now() - lastSeenAt.getTime() > STALE_THRESHOLD_MS,
  }
}
