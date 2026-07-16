import { useMemo, useState } from 'react'
import { CalendarRange, Cloud, ShieldCheck, Trash2 } from 'lucide-react'
import { format } from 'date-fns'
import { Button, Checkbox, Modal, Radio } from '../ui'
import type { EventLocationScope } from '../../lib/eventLocation'
import {
  buildRecurrenceScopeChoices,
  recurrenceScopeDialogTitle,
  recurrenceScopeSubmitLabel,
  type RecurrenceScopeImpact,
  type RecurrenceScopeOperation,
} from '../../lib/recurrenceScopePresentation'
import { cn } from '../../utils/cn'

export default function RecurrenceScopeDialog({
  open,
  title,
  operation = 'update',
  selectedStart,
  impacts,
  googleDestination = 'connected Google Calendar',
  invitationPolicy = 'explicit',
  loading = false,
  error = null,
  onClose,
  onSelect,
}: {
  open: boolean
  title?: string
  operation?: RecurrenceScopeOperation
  selectedStart?: string | Date
  impacts?: Partial<Record<EventLocationScope, RecurrenceScopeImpact>>
  googleDestination?: string
  invitationPolicy?: 'explicit' | 'none'
  loading?: boolean
  error?: string | null
  onClose: () => void
  onSelect: (
    scope: EventLocationScope,
    options: { preserveExceptions: boolean },
  ) => boolean | void | Promise<boolean | void>
}) {
  const [selectedScope, setSelectedScope] = useState<EventLocationScope>('this')
  const [preserveExceptions, setPreserveExceptions] = useState(true)
  const choices = useMemo(
    () => buildRecurrenceScopeChoices({ operation, impacts }),
    [impacts, operation],
  )
  const selectedImpact = impacts?.[selectedScope]
  const selectedDate = selectedStart ? new Date(selectedStart) : null
  const formattedDate = selectedDate && Number.isFinite(selectedDate.getTime())
    ? format(selectedDate, 'EEEE, MMMM d, yyyy')
    : null

  const handleClose = () => {
    setSelectedScope('this')
    setPreserveExceptions(true)
    onClose()
  }

  const handleSelect = async () => {
    const succeeded = await onSelect(selectedScope, { preserveExceptions })
    if (succeeded === false) return
    setSelectedScope('this')
    setPreserveExceptions(true)
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => {} : handleClose}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      closeDisabled={loading}
      title={title ?? recurrenceScopeDialogTitle(operation)}
      size="md"
      panelClassName="flex max-h-[calc(100dvh-2rem)] flex-col overflow-hidden"
      contentClassName="overflow-y-auto"
    >
      <div className="flex items-start gap-3 rounded-card border border-casa-border bg-casa-surface-subtle p-3">
        <CalendarRange className="mt-0.5 shrink-0 text-casa-navy" size={20} aria-hidden="true" />
        <div>
          <p className="text-body-sm font-semibold text-content-heading">
            Choose which dates this should affect
          </p>
          {formattedDate && (
            <p className="mt-0.5 text-caption text-casa-muted">
              Selected event: {formattedDate}
            </p>
          )}
        </div>
      </div>

      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">Recurring event scope</legend>
        {choices.map(({ scope, label, description, impact }) => {
          const checked = selectedScope === scope
          return (
            <Radio
              key={scope}
              name="recurrence-scope"
              value={scope}
              checked={checked}
              disabled={loading}
              onChange={() => setSelectedScope(scope)}
              label={label}
              description={(
                <>
                  <span className="block">{description}</span>
                  {impact && (
                    <span className="mt-1 block font-semibold text-content-secondary">{impact}</span>
                  )}
                </>
              )}
              className={cn(
                'cursor-pointer rounded-card border p-3 transition-colors',
                checked
                  ? 'border-casa-gold bg-casa-accent-soft'
                  : 'border-casa-border bg-casa-surface hover:bg-casa-bg',
              )}
            />
          )
        })}
      </fieldset>

      {operation !== 'delete' && selectedScope !== 'this' && (
        <div className="mt-4 rounded-card border border-casa-border bg-casa-surface p-3">
          <Checkbox
            checked={preserveExceptions}
            disabled={loading}
            onChange={(event) => setPreserveExceptions(event.target.checked)}
            label="Keep existing one-off changes"
          />
          <p className="mt-1 pl-7 text-caption text-content-secondary">
            Turn this off to replace one-off changes only for the details you are updating.
            Other one-off details always stay unchanged.
          </p>
        </div>
      )}

      <div className="mt-4 space-y-2 rounded-card border border-casa-border bg-casa-surface-subtle p-3">
        <div className="flex items-start gap-2 text-caption text-content-secondary">
          <ShieldCheck className="mt-0.5 shrink-0 text-casa-success-strong" size={17} aria-hidden="true" />
          <span>
            One-off changes outside this scope stay unchanged.
            {operation === 'delete' && ' Deleted events can be restored for 30 days.'}
          </span>
        </div>
        <div className="flex items-start gap-2 text-caption text-content-secondary">
          <Cloud className="mt-0.5 shrink-0 text-casa-navy" size={17} aria-hidden="true" />
          <span>
            Saves to Casa first, then syncs to {googleDestination}.
            {invitationPolicy === 'explicit' && ' Invitations are not sent from this step.'}
          </span>
        </div>
      </div>

      {error && <p role="alert" className="mt-3 text-body-sm text-casa-error">{error}</p>}

      <div className="sticky bottom-0 -mx-1 mt-5 flex justify-end gap-2 border-t border-casa-border bg-casa-surface px-1 pt-3">
        <Button variant="secondary" disabled={loading} onClick={handleClose}>Cancel</Button>
        <Button
          variant={operation === 'delete' ? 'danger' : 'primary'}
          loading={loading}
          leadingIcon={operation === 'delete' ? <Trash2 size={17} aria-hidden="true" /> : undefined}
          onClick={handleSelect}
        >
          {recurrenceScopeSubmitLabel(operation, selectedImpact)}
        </Button>
      </div>
    </Modal>
  )
}
