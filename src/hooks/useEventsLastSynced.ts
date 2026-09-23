import { useQueryClient, useIsFetching } from '@tanstack/react-query'
import { formatDistance } from 'date-fns'
// Explicit extension: this module is imported directly by `node --test`
// (see tests/use-events-last-synced.test.mjs) as well as bundled by Vite, and
// Node's own ESM resolver needs a real extension for a value import (unlike a
// type-only import, which gets erased). tsconfig has allowImportingTsExtensions
// enabled for exactly this.
import { useLiveClock } from './useLiveClock.ts'

// Crucial UX half of the calendar's stale-while-revalidate cache: a viewer
// glancing at the calendar needs to be able to tell "this is fresh" from
// "this is what it showed before a hiccup, still catching up" -- otherwise
// showing persisted-but-possibly-outdated data would be actively misleading
// rather than helpful. Pure and exported separately from the hook so this
// logic is unit-testable without a DOM/React test environment (this repo has
// none -- see AGENTS.md's TDD protocol and every other test in tests/).
export function formatLastSyncedLabel(input: {
  isFetching: boolean
  dataUpdatedAt: number
  now: number
}): string | null {
  if (input.isFetching) return 'Syncing…'
  if (!input.dataUpdatedAt) return null
  const ageMs = input.now - input.dataUpdatedAt
  if (ageMs < 10_000) return 'Updated just now'
  return `Updated ${formatDistance(input.dataUpdatedAt, input.now, { addSuffix: true })}`
}

// Reads directly off the query cache (not a specific view's own useQuery
// call) so ONE indicator in the calendar header stays correct no matter
// which sub-view (Day/Stacked/Week/Month, each with its own range query) is
// currently mounted.
export function useEventsLastSynced(): string | null {
  const queryClient = useQueryClient()
  const isFetching = useIsFetching({ queryKey: ['events'] }) > 0
  const dataUpdatedAt = Math.max(
    0,
    ...queryClient.getQueryCache().findAll({ queryKey: ['events'] }).map((query) => query.state.dataUpdatedAt),
  )
  // Ticks the label forward (e.g. "just now" -> "2 minutes ago") without
  // needing a fresh fetch -- a 30s cadence is plenty for a relative-time label.
  const now = useLiveClock(30_000)
  return formatLastSyncedLabel({ isFetching, dataUpdatedAt, now: now.getTime() })
}
