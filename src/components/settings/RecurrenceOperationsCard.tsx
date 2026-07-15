import { formatDistanceToNow } from 'date-fns'
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react'
import {
  useRecurrenceOperations,
  useRetryRecurrenceOperation,
  type RecurrenceOperation,
} from '../../hooks/useRecurrenceOperations'
import { Alert, Button, Card, Chip, Heading, Skeleton, Text } from '../ui'

function statusTone(status: RecurrenceOperation['status']) {
  if (status === 'failed') return 'danger' as const
  if (status === 'succeeded') return 'success' as const
  if (status === 'running') return 'info' as const
  return 'warning' as const
}

function operationLabel(value: string) {
  return value.replaceAll('_', ' ')
}

export function RecurrenceOperationsCard() {
  const operations = useRecurrenceOperations()
  const retry = useRetryRecurrenceOperation()

  if (operations.isLoading) {
    return <Skeleton className="h-44 rounded-card" aria-label="Loading recurrence synchronization status" />
  }
  if (operations.isError || !operations.data) {
    return (
      <Alert tone="danger" title="Recurrence status is unavailable">
        Casa could not load synchronization health. Calendar editing remains available.
      </Alert>
    )
  }

  const { summary, operations: rows } = operations.data
  const syncEnabled = summary.rollout_flags.google_sync_v2 === true
  const healthy = summary.failed_syncs === 0 && summary.migration_anomalies === 0

  return (
    <Card padding="md" className="mt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Heading as="h2" role="heading">Recurring calendar operations</Heading>
          <Text role="body-sm" muted>
            Google projection, recovery, conflicts, and retained deletions.
          </Text>
        </div>
        <Chip tone={healthy ? 'success' : 'warning'}>
          {healthy ? <CheckCircle2 size={14} /> : <AlertTriangle size={14} />}
          {healthy ? 'Operational' : 'Needs attention'}
        </Chip>
      </div>

      {!syncEnabled && (
        <Alert tone="info" title="Google recurrence projection is paused" className="mt-4">
          The new recurrence engine is installed, but rollout remains safely disabled.
        </Alert>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Metric label="Active syncs" value={summary.active_syncs} />
        <Metric label="Failed syncs" value={summary.failed_syncs} />
        <Metric label="Casa-wins conflicts" value={summary.casa_wins_conflicts} />
        <Metric label="Recoverable deletes" value={summary.tombstones} />
        <Metric label="Pending imports" value={summary.pending_imports} />
        <Metric label="Migration anomalies" value={summary.migration_anomalies} />
      </div>

      {rows.length > 0 && (
        <div className="mt-4 space-y-2" aria-label="Current recurrence synchronization operations">
          {rows.map((operation) => (
            <div key={operation.id} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-casa-border bg-casa-bg p-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Text role="body-sm">{operation.event_title ?? 'Recurring event'}</Text>
                  <Chip tone={statusTone(operation.status)} size="sm">{operation.status}</Chip>
                  {operation.conflict_detected && <Chip tone="warning" size="sm">Casa version kept</Chip>}
                </div>
                <Text role="caption" muted>
                  {operationLabel(operation.operation_type)} · revision {operation.casa_revision} · attempt {operation.attempts}/{operation.max_attempts}
                  {' · '}
                  {formatDistanceToNow(new Date(operation.created_at), { addSuffix: true })}
                </Text>
                {operation.last_error && <Text role="caption" className="text-casa-error">{operation.last_error}</Text>}
              </div>
              {operation.status === 'failed' && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={retry.isPending && retry.variables === operation.id}
                  onClick={() => retry.mutate(operation.id)}
                >
                  <RefreshCw size={14} />
                  Retry now
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-card bg-casa-bg p-3">
      <Text role="caption" muted>{label}</Text>
      <Heading as="p" role="heading">{value}</Heading>
    </div>
  )
}
