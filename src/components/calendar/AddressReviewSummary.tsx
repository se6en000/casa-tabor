import { CheckCircle2, CircleAlert, House, Loader2, MapPin, Route } from 'lucide-react'
import { cn } from '../../utils/cn'
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
  onConfirm,
  onEdit,
  loading = false,
  saveError,
  onRetry,
}: {
  locationName: string | null
  address: string | null
  reviewed: boolean
  atHome: boolean
  onConfirm: () => void
  onEdit: () => void
  loading?: boolean
  saveError?: string | null
  onRetry?: () => void
}) {
  const normalizedName = locationName?.trim() || null
  const normalizedAddress = address?.trim() || null
  const hasDestination = Boolean(normalizedName || normalizedAddress)
  const headline = normalizedName ?? (atHome ? 'Home' : 'Destination needed')
  const subline = normalizedAddress ?? (!atHome ? 'Add an address before relying on travel details.' : null)
  const needsReview = hasDestination && !atHome && !reviewed
  const missing = !hasDestination && !atHome

  return (
    <Card
      padding="sm"
      className={cn(
        'relative mt-4 overflow-hidden border-casa-border bg-casa-surface shadow-none',
        'flex flex-col gap-3 sm:flex-row sm:items-center',
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'absolute inset-y-3 left-0 w-1 rounded-r-full',
          reviewed || atHome ? 'bg-casa-success' : 'bg-casa-warning',
        )}
      />
      <span className="flex size-control-sm flex-none items-center justify-center rounded-button bg-casa-bg text-casa-gold">
        {atHome ? <House size={16} aria-hidden="true" /> : <MapPin size={16} aria-hidden="true" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-caption font-bold uppercase tracking-wide text-casa-muted">Where</p>
        <p className="mt-0.5 text-body-sm font-bold leading-snug text-casa-navy">{headline}</p>
        {subline && <p className="mt-0.5 text-caption leading-snug text-casa-muted">{subline}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2 sm:w-1/2 sm:justify-end">
        {loading ? (
          <Chip tone="info" size="sm" icon={<Loader2 size={13} className="animate-spin" aria-hidden="true" />}>
            Checking review
          </Chip>
        ) : reviewed ? (
          <Chip tone="success" size="sm" icon={<CheckCircle2 size={13} aria-hidden="true" />}>
            Address reviewed
          </Chip>
        ) : atHome ? (
          <Chip size="sm" icon={<House size={13} aria-hidden="true" />}>At home</Chip>
        ) : (
          <Chip tone="warning" size="sm" icon={<CircleAlert size={13} aria-hidden="true" />}>
            {missing ? 'Address missing' : 'Needs review'}
          </Chip>
        )}
        {!loading && needsReview && (
          <Button variant="primary" size="sm" onClick={onConfirm}>
            Confirm address
          </Button>
        )}
        {!loading && (
          <Button variant="secondary" size="sm" onClick={onEdit}>
            {missing ? 'Add address' : 'Edit'}
          </Button>
        )}
        {saveError && (
          <span role="alert" className="w-full text-caption text-casa-error sm:text-right">
            {saveError}
            {onRetry && (
              <Button variant="ghost" size="sm" className="ml-2" onClick={onRetry}>
                Retry
              </Button>
            )}
          </span>
        )}
      </div>
    </Card>
  )
}
