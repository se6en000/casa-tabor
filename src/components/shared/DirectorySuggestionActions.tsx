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
 * these buttons do?). Each row now leads with a Place/Contact icon and states
 * in plain words why it's here ("New place · seen N× on your calendar").
 *
 * Layout note: name/meta text and the Confirm/Dismiss actions are on
 * *separate* rows, not fighting for width in one flex row. An earlier version
 * put them side by side with the action buttons `shrink-0` and the text block
 * un-grown — in a narrow, twice-nested Needs You card that starved the text
 * down to near-zero width and each word wrapped onto its own line (a real
 * layout bug, not a style nit). Actions now reuse the same icon-button +
 * flex-1-primary-CTA single-row shape already established in
 * PrepItemDetailPanel/EventDetailPanel's footers, on their own row below the
 * name — so the name always gets the card's full width to truncate against.
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
        <p className="text-caption text-casa-muted mb-1.5">Review each:</p>
      )}
      <div className="divide-y divide-casa-border">
        {entries.map((entry) => {
          const KindIcon = entry.kind === 'place' ? MapPin : User
          const kindNoun = entry.kind === 'place' ? 'place' : 'contact'
          return (
            <div key={`${entry.kind}-${entry.id}`} className="py-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-casa-surface text-casa-muted">
                  <KindIcon size={13} strokeWidth={2.2} aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-body-sm font-semibold text-casa-text">{entry.name}</p>
                  <p className="truncate text-caption text-casa-muted">
                    New {kindNoun} · seen {entry.occurrenceCount}× on your calendar
                  </p>
                </div>
              </div>
              {/* Actions on their own row, matching the app's established
                  icon-button + flex-1-primary-CTA footer pattern (see
                  PrepItemDetailPanel/EventDetailPanel) — keeps the name/meta
                  text above from ever having to fight the buttons for width,
                  which is exactly what caused the wrap-into-a-column bug. */}
              <div className="mt-1.5 flex items-center gap-1.5 pl-8">
                <IconButton
                  variant="secondary"
                  size="sm"
                  className="border-casa-error/30 text-casa-error hover:bg-casa-error/10"
                  onClick={() => dismissEntry(entry)}
                  icon={<X size={14} strokeWidth={2.3} />}
                  aria-label={`Not now, skip ${entry.name}`}
                  title="Not now"
                />
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  className="flex-1"
                  leadingIcon={<Check size={14} strokeWidth={2.3} />}
                  onClick={() => confirmEntry(entry)}
                  aria-label={`Save ${entry.name} to your ${kindNoun} directory`}
                  title={`Save this ${kindNoun}`}
                >
                  Confirm
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
