/**
 * Phase 2 Needs You inline actions for a directory-suggestion card. Reveals the
 * real unconfirmed saved_places/saved_contacts candidates (see
 * useDirectorySuggestions.ts) with a per-entry Add/Skip so users don't blindly
 * bulk-confirm entries they never actually looked at (user-approved direction —
 * see needs-you-phase2-actions-TMP.html Option A).
 *
 * Unified action placement: the parent card owns the top-right expand toggle
 * (ChevronDown, same icon/spot prep items and conflicts use). The parent now
 * keeps this component permanently mounted (so the panel can CSS-transition
 * open/closed instead of popping in/out) — `enabled` gates the actual Supabase
 * fetch so collapsed cards never query, matching the prior lazy-fetch behavior.
 *
 * Plain-language pass: an unlabeled name + "Other"/"Contact" category + bare
 * check/X icons meant nothing to a first-time viewer (what is this? what do
 * these buttons do?). Each row now leads with a Place/Contact icon, states in
 * plain words *why* it's here ("Seen N× on your calendar"), and uses the same
 * labeled "Confirm"/icon-only "Dismiss" pair already established on the
 * Settings directory page's SuggestedRow, so the action reads the same way
 * everywhere in the app.
 */
import { Check, MapPin, User, X } from 'lucide-react'
import {
  useConfirmDirectorySuggestionEntry,
  useDismissDirectorySuggestionEntry,
  useDirectorySuggestionEntries,
} from '../../hooks/useDirectorySuggestions'
import { Button, IconButton } from '../ui'

export default function DirectorySuggestionActions({
  enabled = true,
  onDismiss,
}: {
  enabled?: boolean
  /** Called when the user taps "Dismiss" after every entry has been reviewed. */
  onDismiss?: () => void
}) {
  const { data: entries = [], isLoading } = useDirectorySuggestionEntries(enabled)
  const confirmEntry = useConfirmDirectorySuggestionEntry()
  const dismissEntry = useDismissDirectorySuggestionEntry()

  return (
    <div className="pt-2.5 pl-[2.375rem]">
      {isLoading && <p className="text-body-sm text-casa-muted">Loading suggestions…</p>}
      {!isLoading && entries.length === 0 && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm text-casa-muted">All caught up — nothing left to review.</p>
          {onDismiss && (
            <Button type="button" variant="secondary" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          )}
        </div>
      )}
      {!isLoading && entries.length > 0 && (
        <p className="text-caption text-casa-muted mb-1.5">
          Found on your calendar — save the ones you want to keep:
        </p>
      )}
      <div className="divide-y divide-casa-border">
        {entries.map((entry) => {
          const KindIcon = entry.kind === 'place' ? MapPin : User
          const kindNoun = entry.kind === 'place' ? 'place' : 'contact'
          return (
            <div key={`${entry.kind}-${entry.id}`} className="flex items-center justify-between gap-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-casa-surface text-casa-muted">
                  <KindIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-body-sm font-semibold text-casa-text">{entry.name}</p>
                  <p className="text-caption text-casa-muted">
                    New {kindNoun} · seen {entry.occurrenceCount}× on your calendar
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leadingIcon={<Check size={14} strokeWidth={2.3} />}
                  className="border-casa-success/35 text-casa-success-strong hover:bg-casa-success/10"
                  onClick={() => confirmEntry(entry)}
                  aria-label={`Save ${entry.name} to your ${kindNoun} directory`}
                  title={`Save this ${kindNoun}`}
                >
                  Confirm
                </Button>
                <IconButton
                  variant="ghost"
                  size="sm"
                  className="border border-casa-error/30 text-casa-error hover:bg-casa-error/10"
                  onClick={() => dismissEntry(entry)}
                  icon={<X size={14} strokeWidth={2.3} />}
                  aria-label={`Not now, skip ${entry.name}`}
                  title="Not now"
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
