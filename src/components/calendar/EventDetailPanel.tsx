import { useEffect } from 'react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useAppStore } from '../../stores/appStore'

export interface EventDetailPanelProps {
  event: EventWithDetails | null
  onClose: () => void
  onOpenEdit?: () => void
  onUpdate?: () => void
  onDelete?: () => void
  embedded?: boolean
  onAskAi?: (prompt?: string) => void
}

/**
 * Unified EventDetailPanel gateway:
 * Delegates to the global SidecarCompanion in the application shell
 * ensuring single source of truth and zero stacked/competing sidecars.
 */
export default function EventDetailPanel({
  event,
  onClose,
}: EventDetailPanelProps) {
  const { openEventInSidecar } = useAppStore()

  useEffect(() => {
    if (event?.id) {
      openEventInSidecar(event.id)
      onClose()
    }
  }, [event?.id, openEventInSidecar, onClose])

  return null
}
