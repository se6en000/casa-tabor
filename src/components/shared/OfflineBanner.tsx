import { WifiOff } from 'lucide-react'
import { useOnlineStatus } from '../../hooks/useOnlineStatus'

// A slim, fixed, app-wide strip -- not the heavier card-style Alert primitive
// (used inline within a page) -- because this needs to stay visible above
// whatever page is active for as long as the household is actually offline,
// without permanently eating page space the rest of the time. Reuses the
// same casa-warning tokens as the Alert component's 'warning' tone for visual
// consistency. Deliberately warning (amber), not danger (red): a network blip
// is normal, not an alarm -- the calendar itself keeps working from its
// persisted cache while this shows.
export default function OfflineBanner() {
  const isOnline = useOnlineStatus()
  if (isOnline) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed inset-x-0 top-0 z-toast flex items-center justify-center gap-2 border-b border-casa-warning/35 bg-casa-warning/10 px-4 py-1.5 text-caption font-medium text-casa-warning"
    >
      <WifiOff size={14} className="shrink-0" />
      You&rsquo;re offline — showing the last synced data
    </div>
  )
}
