/**
 * Phase 2 Needs You inline actions for a directory-suggestion card. Reveals the
 * real unconfirmed saved_places/saved_contacts candidates (see
 * useDirectorySuggestions.ts) with a per-entry Add/Skip so users don't blindly
 * bulk-confirm entries they never actually looked at (user-approved direction —
 * see needs-you-phase2-actions-TMP.html Option A).
 *
 * Unified action placement: the parent card owns the top-right expand toggle
 * (MoreHorizontal, same icon/spot prep items and conflicts use). This component
 * is only the expanded panel content — it's mounted by the parent once the
 * shared reveal state is open for this item, so it always fetches immediately.
 */
import { Check, X } from 'lucide-react'
import {
  useConfirmDirectorySuggestionEntry,
  useDismissDirectorySuggestionEntry,
  useDirectorySuggestionEntries,
} from '../../hooks/useDirectorySuggestions'
import { Button } from '../ui'

export default function DirectorySuggestionActions() {
  const { data: entries = [], isLoading } = useDirectorySuggestionEntries(true)
  const confirmEntry = useConfirmDirectorySuggestionEntry()
  const dismissEntry = useDismissDirectorySuggestionEntry()

  return (
    <div className="pt-2.5 pl-[2.375rem]">
      {isLoading && <p className="text-body-sm text-casa-muted">Loading suggestions…</p>}
      {!isLoading && entries.length === 0 && (
        <p className="text-body-sm text-casa-muted">All caught up — nothing left to review.</p>
      )}
      <div className="divide-y divide-casa-border">
        {entries.map((entry) => (
          <div key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between gap-2 py-1.5">
            <div className="min-w-0">
              <p className="truncate text-body-sm font-semibold text-casa-text">{entry.name}</p>
              <p className="text-caption text-casa-muted">{entry.categoryLabel}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-control rounded-button border border-casa-success/35 bg-white p-0 text-casa-success-strong hover:bg-casa-success/10"
                onClick={() => confirmEntry(entry)}
                aria-label={`Add ${entry.name} to directory`}
                title="Add to directory"
              >
                <Check size={14} strokeWidth={2.3} />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-control rounded-button border border-casa-error/30 bg-white p-0 text-casa-error hover:bg-casa-error/10"
                onClick={() => dismissEntry(entry)}
                aria-label={`Not now, skip ${entry.name}`}
                title="Not now"
              >
                <X size={14} strokeWidth={2.3} />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
