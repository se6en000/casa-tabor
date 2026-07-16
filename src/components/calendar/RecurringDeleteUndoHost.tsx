import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Toast } from '../ui'
import {
  RECURRING_DELETE_EVENT,
  RECURRING_SAVE_EVENT,
  undoRecurringEditorDelete,
  type RecurringDeleteReceipt,
  type RecurringSaveReceipt,
} from '../../lib/recurringEventEditor'

export default function RecurringDeleteUndoHost() {
  const queryClient = useQueryClient()
  const [receipt, setReceipt] = useState<RecurringDeleteReceipt | null>(null)
  const [message, setMessage] = useState('Recurring event deleted.')
  const [tone, setTone] = useState<'info' | 'success' | 'danger'>('success')
  const [restoring, setRestoring] = useState(false)
  const undoActionId = useRef<string | null>(null)

  useEffect(() => {
    const handleDelete = (event: Event) => {
      const next = (event as CustomEvent<RecurringDeleteReceipt>).detail
      if (!next?.history_id) return
      undoActionId.current = null
      setReceipt(next)
      setTone('success')
      setMessage(
        next.affected_occurrences === 1
          ? `"${next.title}" was deleted.`
          : `${next.affected_occurrences} events from "${next.title}" were deleted.`,
      )
    }
    const handleSave = (event: Event) => {
      const next = (event as CustomEvent<RecurringSaveReceipt>).detail
      if (!next?.title) return
      setReceipt(null)
      setTone('success')
      setMessage(
        next.google_sync_status === 'pending'
          ? `"${next.title}" was saved in Casa. Google Calendar sync is queued.`
          : `"${next.title}" was saved in Casa.`,
      )
    }
    window.addEventListener(RECURRING_DELETE_EVENT, handleDelete)
    window.addEventListener(RECURRING_SAVE_EVENT, handleSave)
    return () => {
      window.removeEventListener(RECURRING_DELETE_EVENT, handleDelete)
      window.removeEventListener(RECURRING_SAVE_EVENT, handleSave)
    }
  }, [])

  const undo = async () => {
    if (!receipt || restoring) return
    setRestoring(true)
    setTone('info')
    setMessage('Restoring deleted events...')
    try {
      const actionId = undoActionId.current ?? crypto.randomUUID()
      undoActionId.current = actionId
      const result = await undoRecurringEditorDelete({
        deleteHistoryId: receipt.history_id,
        actionId,
        expectedSeriesRevision: receipt.series_revision,
      })
      await queryClient.invalidateQueries({ queryKey: ['events'] })
      await queryClient.refetchQueries({ queryKey: ['events'], type: 'active' })
      undoActionId.current = null
      setReceipt(null)
      setTone('success')
      setMessage(
        result.restored_occurrences === 1
          ? 'Recurring event restored.'
          : `${result.restored_occurrences} recurring events restored.`,
      )
    } catch (cause) {
      setTone('danger')
      setMessage(cause instanceof Error ? cause.message : 'Could not restore the deleted events.')
    } finally {
      setRestoring(false)
    }
  }

  const open = Boolean(receipt)
    || tone === 'danger'
    || message.includes('restored')
    || message.includes('saved in Casa')
  return (
    <Toast
      open={open}
      tone={tone}
      message={message}
      actionLabel={receipt ? (restoring ? 'Restoring...' : tone === 'danger' ? 'Retry Undo' : 'Undo') : undefined}
      onAction={receipt && !restoring ? () => void undo() : undefined}
      onClose={() => {
        setReceipt(null)
        setMessage('')
      }}
    />
  )
}
