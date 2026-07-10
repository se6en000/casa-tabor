import { useEffect, useMemo } from 'react'
import { AlertTriangle, CheckCircle2, ShieldAlert } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { TravelEtaResult } from '../../hooks/useTravelEta'
import { evaluateDepartureRisk } from '../../hooks/useDepartureRisk'

const ALERT_KEY_PREFIX = 'departure-risk-alert:v1'

export function DepartureRiskBanner({
  event,
  travelEta,
  className,
  enableSmartAlerts = false,
}: {
  event: EventWithDetails
  travelEta: TravelEtaResult | null | undefined
  className?: string
  enableSmartAlerts?: boolean
}) {
  const risk = useMemo(() => evaluateDepartureRisk(event, travelEta), [event, travelEta])

  useEffect(() => {
    if (!enableSmartAlerts) return
    if (risk.level === 'go') return
    if (!('Notification' in window)) return
    if (Notification.permission !== 'granted') {
      if (Notification.permission === 'default') void Notification.requestPermission()
      return
    }

    const leaveByBucket = travelEta?.leave_by ? new Date(travelEta.leave_by).toISOString().slice(0, 16) : 'none'
    const alertKey = `${ALERT_KEY_PREFIX}:${event.id}:${risk.level}:${leaveByBucket}`
    if (localStorage.getItem(alertKey)) return

    const reason = risk.reasons[0] ?? 'Check commute and prep status.'
    new Notification(`Casa: ${risk.title}`, { body: `${event.title} — ${reason}` })
    localStorage.setItem(alertKey, String(Date.now()))
  }, [enableSmartAlerts, event.id, event.title, risk.level, risk.reasons, travelEta?.leave_by])

  const tone =
    risk.level === 'risk'
      ? 'bg-red-50 border-red-200 text-red-700'
      : risk.level === 'caution'
        ? 'bg-amber-50 border-amber-200 text-amber-700'
        : 'bg-emerald-50 border-emerald-200 text-emerald-700'
  const Icon = risk.level === 'risk' ? ShieldAlert : risk.level === 'caution' ? AlertTriangle : CheckCircle2

  return (
    <div className={cn('mt-2 rounded-lg border px-2.5 py-2', tone, className)}>
      <div className="flex items-start gap-2">
        <Icon size={14} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          <p className="text-caption font-semibold">{risk.title}</p>
          {risk.reasons.length > 0 && (
            <p className="text-caption mt-0.5 leading-snug">{risk.reasons.join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
