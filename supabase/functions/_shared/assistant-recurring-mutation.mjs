const RECURRENCE_SCOPES = new Set(['this', 'future', 'all'])

export function isCanonicalRecurringEvent(event) {
  return Boolean(
    event &&
    event.series_id &&
    event.record_kind === 'occurrence',
  )
}

export function parseExplicitRecurrenceScope(text) {
  const normalized = String(text ?? '')
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\s+/g, ' ')
    .trim()

  if (
    /\b(?:this|the)\s+(?:event|appointment|occurrence|one)\s+and\s+(?:all\s+)?(?:future|following|later|upcoming)\b/.test(normalized) ||
    /\b(?:this\s+and\s+)?(?:all\s+)?(?:future|following)\s+(?:events|appointments|occurrences|ones)\b/.test(normalized) ||
    /\bfrom\s+(?:this|that|here|now)\s+(?:event\s+)?(?:onward|forward)\b/.test(normalized)
  ) {
    return 'future'
  }

  if (
    /\b(?:all|every)\s+(?:event|appointment|occurrence|one)(?:\s+in\s+(?:the|this)\s+series)?\b/.test(normalized) ||
    /\b(?:the\s+)?(?:entire|whole)\s+series\b/.test(normalized) ||
    /\bapply\s+(?:it|this|that)\s+to\s+(?:the\s+)?(?:entire|whole)\s+series\b/.test(normalized)
  ) {
    return 'all'
  }

  if (
    /\b(?:just|only)\s+(?:this|that|the)\s+(?:event|appointment|occurrence|one)\b/.test(normalized) ||
    /\b(?:this|that)\s+(?:event|appointment|occurrence)\s+only\b/.test(normalized) ||
    /\bjust\s+(?:this|that)\s+one\b/.test(normalized)
  ) {
    return 'this'
  }

  return null
}

export function recurrenceScopeClarification(operation = 'change') {
  const verb = operation === 'delete' ? 'delete' : 'change'
  return `Should I ${verb} only this event, this and following events, or the entire series?`
}

export function scopeCanonicalMutation(text, mutation, event) {
  if (!mutation || !isCanonicalRecurringEvent(event)) return mutation
  if (!['update_event', 'delete_event'].includes(mutation.tool)) return mutation

  const scope = parseExplicitRecurrenceScope(text)
  if (!scope) {
    return {
      text: recurrenceScopeClarification(mutation.tool === 'delete_event' ? 'delete' : 'change'),
      event,
      pendingMutation: {
        tool: mutation.tool,
        args: mutation.args,
      },
    }
  }

  return {
    ...mutation,
    event,
    args: {
      ...mutation.args,
      recurrence_scope: scope,
      expected_series_revision: event.series_revision_applied,
    },
  }
}

export function resolvePendingRecurringScope(text, conversationState, event) {
  const pendingMutation = conversationState?.pendingMutation
  const scope = parseExplicitRecurrenceScope(text)
  if (
    !scope ||
    !isCanonicalRecurringEvent(event) ||
    !['update_event', 'delete_event'].includes(pendingMutation?.tool) ||
    !pendingMutation.args ||
    pendingMutation.args.id !== event.id
  ) {
    return null
  }
  return {
    tool: pendingMutation.tool,
    args: {
      ...pendingMutation.args,
      recurrence_scope: scope,
      expected_series_revision: event.series_revision_applied,
    },
    event,
  }
}

export function truncateRecurrenceLinesForFuture(recurrenceLines, originalStart) {
  const splitTime = new Date(originalStart).getTime()
  if (!Number.isFinite(splitTime)) {
    throw new Error('The selected occurrence has no valid original start time.')
  }
  const until = new Date(splitTime - 1000)
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}Z$/, 'Z')

  return recurrenceLines.map((line) => {
    if (!line.startsWith('RRULE:')) return line
    const normalized = line
      .replace(/;?UNTIL=[^;]+/g, '')
      .replace(/;?COUNT=[^;]+/g, '')
    return `${normalized};UNTIL=${until}`
  })
}

export function buildRecurringSeriesPatch(context, scope, selectedEvent) {
  if (!RECURRENCE_SCOPES.has(scope)) throw new Error('Unsupported recurrence scope.')
  const seriesPatch = {
    timezone: context.series.timezone,
    recurrence_lines: context.series.recurrence_lines,
  }
  if (scope !== 'future') return seriesPatch

  const originalStart = selectedEvent.original_start_time ??
    (selectedEvent.original_start_date
      ? `${selectedEvent.original_start_date}T00:00:00Z`
      : selectedEvent.start_time)
  seriesPatch.original_recurrence_lines = truncateRecurrenceLinesForFuture(
    context.series.recurrence_lines,
    originalStart,
  )
  seriesPatch.future_recurrence_lines = context.series.recurrence_lines
  return seriesPatch
}

function definitionList(items, excludedKeys) {
  return (items ?? []).map((item) => Object.fromEntries(
    Object.entries(item).filter(([key]) => !excludedKeys.has(key)),
  ))
}

export function buildRecurringDetailMutation(context, normalized) {
  const snapshot = context.effective_bundle ?? {}
  const baselineEvent = snapshot.event ?? {}
  const event = {
    title: baselineEvent.title,
    description: baselineEvent.description,
    start_time: baselineEvent.start_time,
    end_time: baselineEvent.end_time,
    all_day: baselineEvent.all_day,
    event_type: baselineEvent.event_type,
    location_name: baselineEvent.location_name,
    address: baselineEvent.address,
    lat: baselineEvent.lat,
    lng: baselineEvent.lng,
    ...normalized.eventUpdates,
  }
  const startMs = Date.parse(event.start_time)
  const endMs = Date.parse(event.end_time)
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new Error('Event end must follow event start.')
  }
  event.duration_ms = endMs - startMs

  const changedPaths = normalized.changedEventFields.map((field) => ({
    title: 'event.title',
    description: 'event.description',
    start_time: 'event.startTime',
    end_time: 'event.endTime',
    all_day: 'event.allDay',
    event_type: 'event.eventType',
    location_name: 'event.locationName',
    address: 'event.address',
  })[field]).filter(Boolean)

  if (normalized.destinationChanged) {
    event.lat = null
    event.lng = null
    changedPaths.push('event.lat', 'event.lng')
  }

  const enrichment = {
    ...(snapshot.enrichment ?? {}),
    ...normalized.enrichmentUpdates,
  }
  if (Object.keys(normalized.enrichmentUpdates).length > 0) changedPaths.push('enrichment')

  const detailPatch = {
    event,
    assignments: (snapshot.members ?? []).map((member) => ({
      family_member_id: member.family_member_id,
      role: member.role,
    })),
    enrichment,
    transportation_plan: snapshot.plan_override?.transportation_plan ?? null,
    logistics: snapshot.logistics ?? null,
    checklist_definitions: normalized.checklistItems === undefined
      ? definitionList(snapshot.checklist_items, new Set(['id', 'event_id', 'checked', 'created_at']))
      : definitionList(normalized.checklistItems, new Set(['id', 'checked'])),
    action_definitions: normalized.actionItems === undefined
      ? definitionList(snapshot.action_items, new Set(['id', 'event_id', 'due_date', 'completed', 'completed_at', 'created_at']))
      : definitionList(normalized.actionItems, new Set(['id', 'due_date', 'completed'])),
  }

  if (normalized.checklistItems !== undefined) changedPaths.push('checklistDefinitions')
  if (normalized.actionItems !== undefined) changedPaths.push('actionDefinitions')

  return {
    changedPaths: [...new Set(changedPaths)],
    detailPatch,
  }
}
