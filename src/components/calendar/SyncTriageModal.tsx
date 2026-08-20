import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import {
  RefreshCw,
  CloudOff,
  ExternalLink,
  Calendar,
  Clock,
  ShieldAlert,
} from 'lucide-react'
import { Modal, Button, Alert } from '../ui'
import { useGoogleSyncTriage, formatSyncError } from '../../hooks/useGoogleSyncTriage'
import type { CalendarEvent } from '../../types'
import { cleanEventTitle } from '../../utils/eventTitle'

export interface SyncTriageModalProps {
  event?: CalendarEvent | null
  error?: string | null
  open?: boolean
  onClose?: () => void
}

export function SyncTriageModal({
  event: controlledEvent,
  error: controlledError,
  open: controlledOpen,
  onClose: controlledOnClose,
}: SyncTriageModalProps) {
  const [internalOpen, setInternalOpen] = useState(false)
  const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null)
  const [activeError, setActiveError] = useState<string | null>(null)

  const { retrySync, keepLocalOnly } = useGoogleSyncTriage()

  // Support global window event trigger
  useEffect(() => {
    function handleOpenEvent(e: Event) {
      const detail = (e as CustomEvent<{ eventId?: string; event?: CalendarEvent; error?: string }>).detail
      if (detail?.event) {
        setActiveEvent(detail.event)
        setActiveError(detail.error ?? 'Failed to synchronize with Google Calendar target.')
        setInternalOpen(true)
      }
    }
    window.addEventListener('casa:open-sync-triage', handleOpenEvent)
    return () => window.removeEventListener('casa:open-sync-triage', handleOpenEvent)
  }, [])

  const isControlled = typeof controlledOpen === 'boolean'
  const isOpen = isControlled ? controlledOpen : internalOpen
  const currentEvent = controlledEvent ?? activeEvent
  const currentError = controlledError ?? activeError

  function handleClose() {
    if (isControlled) {
      controlledOnClose?.()
    } else {
      setInternalOpen(false)
      setActiveEvent(null)
    }
  }

  if (!isOpen || !currentEvent) return null

  const isBusy = retrySync.isPending || keepLocalOnly.isPending
  const startDate = currentEvent.start_time ? new Date(currentEvent.start_time) : null
  const errorInfo = formatSyncError(currentError)

  return (
    <Modal
      open={isOpen}
      onClose={handleClose}
      title="Google Calendar Sync Triage"
    >
      <div className="space-y-4 pt-2">
        {/* Event Summary Card */}
        <div className="rounded-2xl border border-casa-border/70 bg-casa-bg p-4 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h3 className="font-bold text-body text-casa-navy leading-tight">
                {cleanEventTitle(currentEvent.title)}
              </h3>
              {startDate && (
                <p className="mt-1.5 flex items-center gap-1.5 text-caption text-casa-muted">
                  <Calendar size={13} className="shrink-0 text-casa-navy" />
                  <span>{format(startDate, 'EEEE, MMMM d, yyyy')}</span>
                  {!currentEvent.all_day && (
                    <>
                      <span>·</span>
                      <Clock size={13} className="shrink-0 text-casa-navy" />
                      <span>{format(startDate, 'h:mm a')}</span>
                    </>
                  )}
                </p>
              )}
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 px-2.5 py-0.5 text-caption font-bold text-rose-700 border border-rose-200/80 shrink-0">
              <ShieldAlert size={13} className="text-rose-600 shrink-0" />
              <span>Sync Desynced</span>
            </span>
          </div>
        </div>

        {/* Error Detail Alert */}
        <Alert
          tone="danger"
          title={errorInfo.title}
        >
          {errorInfo.detail}
        </Alert>

        {/* Action Buttons: 1-Tap Resolution */}
        <div className="space-y-3 pt-1">
          <p className="text-caption font-bold uppercase tracking-wider text-casa-muted">
            Resolution Options
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {/* Retry Button */}
            <Button
              variant="strong"
              size="md"
              disabled={isBusy}
              onClick={async () => {
                await retrySync.mutateAsync(currentEvent.id)
                handleClose()
              }}
              leadingIcon={<RefreshCw size={16} className={retrySync.isPending ? 'animate-spin' : ''} />}
              className="w-full min-h-[48px] font-bold rounded-xl"
            >
              {retrySync.isPending ? 'Retrying…' : 'Retry Google Sync'}
            </Button>

            {/* Keep Local Only */}
            <Button
              variant="secondary"
              size="md"
              disabled={isBusy}
              onClick={async () => {
                await keepLocalOnly.mutateAsync(currentEvent.id)
                handleClose()
              }}
              leadingIcon={<CloudOff size={16} />}
              className="w-full min-h-[48px] font-semibold rounded-xl"
            >
              {keepLocalOnly.isPending ? 'Saving…' : 'Keep Casa Local Only'}
            </Button>
          </div>

          {/* Link to Google Services Settings */}
          <div className="pt-2 flex justify-center">
            <Link
              to="/settings/google"
              onClick={handleClose}
              className="inline-flex items-center gap-1.5 text-caption font-medium text-casa-navy hover:underline min-h-[44px] px-2 py-1"
            >
              <span>Manage Google Accounts & Write Target in Settings</span>
              <ExternalLink size={13} />
            </Link>
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default SyncTriageModal
