import { CircleAlert, House, Loader2, MapPin, Route } from 'lucide-react'
import { Button, Chip } from '../ui'

export type AddressTechnicalStatus = 'checking' | 'ready' | 'unavailable'

export function AddressTechnicalStatusChip({ status }: { status: AddressTechnicalStatus }) {
  if (status === 'checking') {
    return <Chip tone="info" size="sm" icon={<Route size={13} aria-hidden="true" />}>Checking location</Chip>
  }
  if (status === 'ready') {
    return <Chip tone="success" size="sm" icon={<Route size={13} aria-hidden="true" />}>Location ready</Chip>
  }
  return <Chip tone="warning" size="sm" icon={<CircleAlert size={13} aria-hidden="true" />}>Location unavailable</Chip>
}

export default function AddressReviewSummary({
  locationName,
  address,
  reviewed,
  atHome,
  loading = false,
  saveError,
  onConfirm,
  onEdit,
  peopleActionLabel,
  onPeopleAction,
  onRetry,
}: {
  locationName: string | null
  address: string | null
  reviewed: boolean
  atHome: boolean
  loading?: boolean
  saveError?: string | null
  onConfirm: () => void
  onEdit: () => void
  peopleActionLabel?: string
  onPeopleAction?: () => void
  onRetry?: () => void
}) {
  const normalizedName = locationName?.trim() || null
  const normalizedAddress = address?.trim() || null
  const hasDestination = Boolean(normalizedName || normalizedAddress)
  const headline = normalizedName ?? (atHome ? 'Home' : 'Add event location')
  const needsReview = Boolean(normalizedAddress) && !atHome && !reviewed
  const addressMissing = !atHome && !normalizedAddress

  return (
    <div className="min-w-0 flex-1">
      <div className="grid grid-cols-1 items-start gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Chip size="sm" className="max-w-full">
            {atHome ? <House size={13} aria-hidden="true" /> : <MapPin size={13} aria-hidden="true" />}
            <span className="whitespace-normal text-left leading-snug">{headline}</span>
          </Chip>
          {loading && (
            <Chip tone="info" size="sm" icon={<Loader2 size={13} className="animate-spin" aria-hidden="true" />}>
              Checking review
            </Chip>
          )}
        </div>
        {!loading && !atHome && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onEdit}
            className="justify-self-end"
          >
            {hasDestination ? 'Change address' : 'Add location'}
          </Button>
        )}
      </div>

      {(normalizedAddress || addressMissing || peopleActionLabel) && (
        <div className="mt-1 grid grid-cols-1 items-start gap-x-3 gap-y-1 sm:grid-cols-[minmax(0,1fr)_auto]">
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            {normalizedAddress && normalizedAddress !== normalizedName && (
              <p className="min-w-0 flex-1 text-body-sm leading-relaxed text-casa-muted">
                {normalizedAddress}
              </p>
            )}
            {!loading && addressMissing && (
              <Chip tone="warning" size="sm" icon={<CircleAlert size={13} aria-hidden="true" />}>
                Address missing
              </Chip>
            )}
            {!loading && needsReview && (
              <Button
                variant="primary"
                size="sm"
                aria-label="Confirm address"
                className="shrink-0"
                onClick={onConfirm}
              >
                Confirm
              </Button>
            )}
          </div>
          {peopleActionLabel && onPeopleAction && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onPeopleAction}
              className="justify-self-end"
            >
              {peopleActionLabel}
            </Button>
          )}
        </div>
      )}

      {saveError && (
        <p role="alert" className="mt-2 text-caption text-casa-error">
          {saveError}
          {onRetry && (
            <Button variant="ghost" size="sm" className="ml-2" onClick={onRetry}>Retry</Button>
          )}
        </p>
      )}
      <span className="sr-only" aria-live="polite">
        {reviewed ? 'Address confirmed' : hasDestination ? 'Address needs review' : 'Address missing'}
      </span>
    </div>
  )
}
