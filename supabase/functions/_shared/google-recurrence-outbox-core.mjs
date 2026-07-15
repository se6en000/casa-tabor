const RETRYABLE_STATUSES = new Set([408, 409, 429, 500, 502, 503, 504])

export function isRetryableGoogleStatus(status) {
  return RETRYABLE_STATUSES.has(status)
}

export function retryDelaySeconds(attempt) {
  return Math.min(3_600, 15 * (2 ** Math.max(0, attempt - 1)))
}

export function operationNeedsEvent(operationType) {
  return ['patch_instance', 'cancel_instance', 'restore_instance'].includes(operationType)
}

export function operationPlan(operation, series) {
  switch (operation.operation_type) {
    case 'create_master':
    case 'recreate_projection':
      return ['create_master']
    case 'patch_master':
      return series.google_recurring_event_id ? ['patch_master'] : ['create_master']
    case 'delete_master':
      return series.google_recurring_event_id ? ['delete_master'] : []
    case 'patch_instance':
      return ['patch_instance']
    case 'cancel_instance':
      return ['cancel_instance']
    case 'restore_instance':
      return ['restore_instance']
    case 'split_series':
      return ['patch_parent_master', 'create_master']
    default:
      throw new Error(`Unsupported recurrence outbox operation: ${operation.operation_type}`)
  }
}

export function detectsGoogleConflict(series, googleEvent) {
  if (!series.google_updated_at || !googleEvent?.updated) return false
  return new Date(googleEvent.updated).getTime() > new Date(series.google_updated_at).getTime()
    && googleEvent.etag !== series.google_etag
}

export function deterministicGoogleEventId(operationId) {
  const id = String(operationId ?? '').toLowerCase().replace(/[^0-9a-f]/g, '')
  if (id.length < 16) throw new Error('A UUID-like outbox operation ID is required.')
  return `c${id}`
}
