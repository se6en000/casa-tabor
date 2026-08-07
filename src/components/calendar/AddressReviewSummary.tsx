import { CircleAlert, House, Loader2, MapPin, Route } from 'lucide-react'
import { Button, Card, Chip } from '../ui'

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
  onRetry?: () => void
}) {
  const normalizedName = locationName?.trim() || null
  const normalizedAddress = address?.trim() || null
  const hasDestination = Boolean(normalizedName || normalizedAddress)
  const headline = normalizedName ?? (atHome ? 'Home' : 'Add event location')
  const needsReview = Boolean(normalizedAddress) && !atHome && !reviewed
  const addressMissing = !atHome && !normalizedAddress
  const hasFooterActions = !loading && (!atHome || addressMissing || needsReview)

  return (
    <Card padding="sm" className="min-w-0 flex-1">
      <div className="flex min-w-0 items-start gap-3">
        <span
          className="flex size-11 shrink-0 items-center justify-center rounded-full border border-casa-border text-casa-muted"
          aria-hidden="true"
        >
          {atHome ? <House size={20} /> : <MapPin size={20} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-body font-bold leading-snug text-casa-navy">{headline}</p>
          {normalizedAddress && normalizedAddress !== normalizedName && (
            <p className="mt-1 min-w-0 text-body-sm leading-relaxed text-casa-muted">
              {normalizedAddress}
            </p>
          )}
        </div>
        {loading && (
          <Chip tone="info" size="sm" icon={<Loader2 size={13} className="animate-spin" aria-hidden="true" />}>
            Checking review
          </Chip>
        )}
      </div>

      {hasFooterActions && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-casa-border pt-3">
          {!atHome && (
            <Button variant="ghost" size="sm" onClick={onEdit} className="mr-auto">
              {hasDestination ? 'Change address' : 'Add location'}
            </Button>
          )}
          {addressMissing && (
            <Chip tone="warning" size="sm" icon={<CircleAlert size={13} aria-hidden="true" />}>
              Address missing
            </Chip>
          )}
          {needsReview && (
            <>
              <span className="inline-flex items-center gap-1.5 text-caption font-bold text-casa-warning">
                <span className="size-2 shrink-0 rounded-full bg-casa-gold" aria-hidden="true" />
                Needs review
              </span>
              <Button
                variant="primary"
                size="sm"
                aria-label="Confirm address"
                onClick={onConfirm}
              >
                Confirm
              </Button>
            </>
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
    </Card>
  )
}

