import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useSystemAlerts } from '../../hooks/useSystemAlerts'
import { bannerAlerts, describeBreaker } from '../../lib/systemHealth.mjs'
import { cn } from '../../utils/cn'
import { Alert } from '../ui'

export interface SystemHealthBannerProps {
  className?: string
}

/**
 * Household-visible warning, shown alongside the Gmail sync banner: the AI circuit
 * breaker is paused, or a critical system alert is open. Warnings stay on the
 * System Health page only, so this never nags about routine blips.
 */
export default function SystemHealthBanner({ className }: SystemHealthBannerProps) {
  const { data } = useSystemAlerts()
  const breaker = describeBreaker(data?.breaker)
  const alerts = bannerAlerts(data?.critical_alerts, data?.breaker)

  if (!breaker.active && alerts.length === 0) return null

  const reviewLink = (
    <Link
      to="/settings/health"
      className="mt-2 inline-flex min-h-11 items-center gap-1 text-body-sm font-bold text-casa-navy underline-offset-2 hover:underline"
    >
      Review in System Health
      <ChevronRight size={16} />
    </Link>
  )

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {breaker.active && (
        <Alert tone={breaker.auto ? 'danger' : 'warning'} title={breaker.headline}>
          <p>{breaker.detail}</p>
          {reviewLink}
        </Alert>
      )}
      {alerts.map((alert) => (
        <Alert key={alert.id} tone="danger" title={alert.title}>
          <p>{alert.detail}</p>
          {!breaker.active && reviewLink}
        </Alert>
      ))}
    </div>
  )
}
