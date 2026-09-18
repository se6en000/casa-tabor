import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

// Generous buffer over the Mac's actual poll interval (not visible from this repo --
// tune once the real ~/.casa-sync.env interval is confirmed). Deliberately polled via
// react-query rather than a realtime channel: this is a single cheap row read, not
// worth a dedicated subscription (see useFamilyRoutineIntelligence.ts's singleton
// realtime channel for why per-component channels are the thing to avoid here).
const STALE_THRESHOLD_MS = 30 * 60_000

// Casa->iOS only, for both grocery and to-dos -- the Mac's poller calls each of
// these unconditionally every tick (it has to ask "what changed?" to find out),
// making them a reliable "is the poller alive" signal. iOS->Casa direction has
// no heartbeat yet (the Mac script would need to send one even when its own
// payload-signature guard skips the main sync call -- see
// .github/instructions/ios-reminders-sync.instructions.md) -- 2026-09-18.
const TRACKED_JOBS = [
  { jobName: 'sync-casa-to-ios', label: 'Grocery sync' },
  { jobName: 'sync-casa-todos-to-ios', label: 'To-do sync' },
] as const

export interface SyncJobHealth {
  jobName: string
  label: string
  lastSeenAt: Date | null
  isStale: boolean
}

export interface SyncHealth {
  isStale: boolean
  staleJobs: SyncJobHealth[]
}

export function useSyncHealth(): SyncHealth {
  const { data: rows = [] } = useQuery({
    queryKey: ['sync-heartbeats', TRACKED_JOBS.map((j) => j.jobName)],
    queryFn: async (): Promise<{ job_name: string; last_seen_at: string }[]> => {
      const { data, error } = await supabase
        .from('sync_heartbeats')
        .select('job_name, last_seen_at')
        .in('job_name', TRACKED_JOBS.map((j) => j.jobName))
      if (error) {
        console.warn('[useSyncHealth] Failed to fetch sync heartbeats:', error.message)
        return []
      }
      return data ?? []
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
  })

  const jobs: SyncJobHealth[] = TRACKED_JOBS.map(({ jobName, label }) => {
    const row = rows.find((r) => r.job_name === jobName)
    // No heartbeat row yet (e.g. right after this feature ships, before the
    // Mac's next poll cycle) -- don't alarm on absence, only on staleness.
    const lastSeenAt = row?.last_seen_at ? new Date(row.last_seen_at) : null
    const isStale = lastSeenAt ? Date.now() - lastSeenAt.getTime() > STALE_THRESHOLD_MS : false
    return { jobName, label, lastSeenAt, isStale }
  })

  const staleJobs = jobs.filter((j) => j.isStale)
  return { isStale: staleJobs.length > 0, staleJobs }
}
