export function classifyGoogleRecurrenceResource(resource, connection) {
  const recurringEventId = resource.recurringEventId ?? null
  const resourceType = recurringEventId ? 'exception' : 'master'
  if (resourceType === 'master' && (!Array.isArray(resource.recurrence) || resource.recurrence.length === 0)) {
    return null
  }
  if (resourceType === 'exception' && !resource.originalStartTime) {
    throw new Error(`Google exception ${resource.id} is missing originalStartTime.`)
  }
  const originalStartTime = resource.originalStartTime?.dateTime ?? null
  const originalStartDate = resource.originalStartTime?.date ?? null
  return {
    connection_id: connection.id,
    google_event_id: resource.id,
    resource_type: resourceType,
    google_recurring_event_id: recurringEventId,
    google_ical_uid: resource.iCalUID ?? null,
    google_etag: resource.etag ?? null,
    google_updated_at: resource.updated ?? null,
    google_status: resource.status ?? 'confirmed',
    recurrence_lines: resourceType === 'master' ? resource.recurrence : [],
    original_start_time: originalStartTime,
    original_start_date: originalStartDate,
    payload: resource,
    adoption_status: resourceType === 'master'
      ? (connection.adoption_policy === 'automatic' ? 'pending_automatic' : 'pending_explicit')
      : 'not_applicable',
  }
}

export function googleRecurrenceListParams({ syncToken, pageToken }) {
  const params = new URLSearchParams({
    singleEvents: 'false',
    showDeleted: 'true',
    maxResults: '2500',
  })
  if (syncToken) params.set('syncToken', syncToken)
  if (pageToken) params.set('pageToken', pageToken)
  return params
}

export function isExpiredGoogleSyncCursor(status) {
  return status === 410
}
