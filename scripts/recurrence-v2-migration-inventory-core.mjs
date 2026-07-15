import { createHash } from 'node:crypto'

export const REUSABLE_PATHS = Object.freeze([
  'event.title',
  'event.description',
  'event.durationMs',
  'event.allDay',
  'event.eventType',
  'event.locationName',
  'event.address',
  'event.lat',
  'event.lng',
  'assignments',
  'enrichment',
  'transportationPlan',
  'logistics',
  'checklistDefinitions',
  'actionDefinitions',
])

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, child]) => child !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonical(child)]),
  )
}

export function stableJson(value) {
  return JSON.stringify(canonical(value))
}

export function diffReusablePaths(left, right) {
  return REUSABLE_PATHS.filter(
    (path) => stableJson(valueAtPath(left, path)) !== stableJson(valueAtPath(right, path)),
  )
}

function valueAtPath(source, path) {
  return path.split('.').reduce((current, key) => current?.[key], source)
}

function setAtPath(target, path, value) {
  const parts = path.split('.')
  const leaf = parts.pop()
  let current = target
  for (const part of parts) {
    current[part] ??= {}
    current = current[part]
  }
  current[leaf] = value
}

function sortByStableValue(values) {
  return [...values].sort((left, right) => stableJson(left).localeCompare(stableJson(right)))
}

export function buildReusableBundle(event, children) {
  const start = new Date(event.start_time).getTime()
  const end = new Date(event.end_time).getTime()
  const enrichment = children.enrichment?.[0] ?? null
  const planOverride = children.planOverride?.[0] ?? null

  return {
    event: {
      title: event.title,
      description: event.description ?? null,
      durationMs: end - start,
      allDay: event.all_day,
      eventType: event.event_type,
      locationName: event.location_name ?? null,
      address: event.address ?? null,
      lat: event.lat ?? null,
      lng: event.lng ?? null,
    },
    assignments: sortByStableValue((children.members ?? []).map((member) => ({
      family_member_id: member.family_member_id,
      role: member.role,
    }))),
    enrichment: enrichment
      ? {
          confidence: enrichment.confidence,
          what_to_bring: enrichment.what_to_bring ?? [],
          prep_notes: enrichment.prep_notes ?? null,
          category: enrichment.category ?? null,
          category_locked: enrichment.category_locked ?? false,
          outfit_suggestion: enrichment.outfit_suggestion ?? null,
          parking_notes: enrichment.parking_notes ?? null,
          contact_name: enrichment.contact_name ?? null,
          contact_phone: enrichment.contact_phone ?? null,
          cost_estimate: enrichment.cost_estimate ?? null,
          dietary_notes: enrichment.dietary_notes ?? null,
          meal_impact: enrichment.meal_impact ?? null,
        }
      : null,
    transportationPlan: planOverride?.transportation_plan ?? null,
    logistics: sortByStableValue((children.logistics ?? []).map((item) => ({
      sort_order: item.sort_order,
      step_type: item.step_type,
      icon: item.icon ?? null,
      title: item.title,
      description: item.description ?? null,
      time: item.time ?? null,
      location_name: item.location_name ?? null,
      address: item.address ?? null,
    }))),
    checklistDefinitions: sortByStableValue((children.checklist ?? []).map((item) => ({
      label: item.label,
      note: item.note ?? null,
      category: item.category,
      sort_order: item.sort_order,
    }))),
    actionDefinitions: sortByStableValue((children.actions ?? []).map((item) => ({
      title: item.title,
      description: item.description ?? null,
      is_urgent: item.is_urgent,
      assigned_to: item.assigned_to ?? null,
      template_due_offset_minutes: item.template_due_offset_minutes ?? null,
    }))),
  }
}

export function inferReusableBaseline(rows) {
  const modalBaseline = {}
  const ambiguousPaths = []

  for (const path of REUSABLE_PATHS) {
    const variants = new Map()
    for (const row of rows) {
      const value = valueAtPath(row.bundle, path)
      const key = stableJson(value)
      const current = variants.get(key) ?? { value, count: 0, eventIds: [] }
      current.count += 1
      current.eventIds.push(row.id)
      variants.set(key, current)
    }
    const ranked = [...variants.values()].sort(
      (left, right) => right.count - left.count || stableJson(left.value).localeCompare(stableJson(right.value)),
    )
    setAtPath(modalBaseline, path, ranked[0]?.value)
    if (ranked.length > 1 && ranked[0].count === ranked[1].count) {
      ambiguousPaths.push({
        path,
        topCount: ranked[0].count,
        variantCount: ranked.length,
      })
    }
  }

  const rankedRows = rows
    .map((row) => ({
      row,
      mismatchCount: rows.reduce(
        (total, candidate) => total + REUSABLE_PATHS.filter(
          (path) => stableJson(valueAtPath(row.bundle, path))
            !== stableJson(valueAtPath(candidate.bundle, path)),
        ).length,
        0,
      ),
    }))
    .sort((left, right) => left.mismatchCount - right.mismatchCount || left.row.id.localeCompare(right.row.id))
  const templateSource = rankedRows[0]?.row
  const baseline = templateSource?.bundle ?? modalBaseline
  const occurrences = rows.map((row) => ({
    eventId: row.id,
    googleEventId: row.google_event_id,
    identityMatch: row.identityMatch ?? 'instance_id',
    exceptionPaths: REUSABLE_PATHS.filter(
      (path) => stableJson(valueAtPath(row.bundle, path)) !== stableJson(valueAtPath(baseline, path)),
    ),
  }))

  return {
    baseline,
    templateSourceEventId: templateSource?.id ?? null,
    baselineHash: createHash('sha256').update(stableJson(baseline)).digest('hex'),
    ambiguousPaths,
    occurrences,
  }
}

function googleStart(event) {
  return event.start?.dateTime ?? event.start?.date ?? null
}

function googleOriginalStart(event) {
  return event.originalStartTime?.dateTime ?? event.originalStartTime?.date ?? null
}

export function detectGoogleException(instance, master) {
  const reasons = []
  if (instance.status === 'cancelled' && master.status !== 'cancelled') reasons.push('cancelled')
  const originalStart = googleOriginalStart(instance)
  const actualStart = googleStart(instance)
  if (originalStart && actualStart && new Date(originalStart).getTime() !== new Date(actualStart).getTime()) {
    reasons.push('moved')
  } else if (originalStart && actualStart && originalStart !== actualStart) {
    reasons.push('moved')
  }
  for (const field of ['summary', 'description', 'location']) {
    if (Object.hasOwn(instance, field) && (instance[field] ?? null) !== (master[field] ?? null)) {
      reasons.push(field)
    }
  }
  return [...new Set(reasons)]
}

export function classifySeries({ account, master, instances, casaRows }) {
  const casaByGoogleId = new Map()
  for (const row of casaRows) {
    const rows = casaByGoogleId.get(row.google_event_id) ?? []
    rows.push(row)
    casaByGoogleId.set(row.google_event_id, rows)
  }
  const instanceById = new Map(instances.map((instance) => [instance.id, instance]))
  const duplicateCasaLinks = [...casaByGoogleId.entries()]
    .filter(([, rows]) => rows.length > 1)
    .map(([googleEventId, rows]) => ({
      googleEventId,
      eventIds: rows.map((row) => row.id).sort(),
    }))
  const missingCasaInstances = instances
    .filter((instance) => instance.status !== 'cancelled' && !casaByGoogleId.has(instance.id))
    .map((instance) => instance.id)
  const unmatchedCasaRows = casaRows
    .filter((row) => !instanceById.has(row.google_event_id))
    .map((row) => ({ eventId: row.id, googleEventId: row.google_event_id }))
  const googleExceptions = instances
    .map((instance) => ({
      googleEventId: instance.id,
      reasons: detectGoogleException(instance, master),
    }))
    .filter((instance) => instance.reasons.length > 0)
  const detailAnalysis = casaRows.length > 0 ? inferReusableBaseline(casaRows) : null
  const proposedCasaExceptions = detailAnalysis?.occurrences.filter(
    (occurrence) => occurrence.exceptionPaths.length > 0,
  ) ?? []
  const occurrenceLinks = casaRows.map((row) => {
    const instance = instanceById.get(row.google_event_id)
    return {
      eventId: row.id,
      googleEventId: row.google_event_id,
      identityMatch: row.identityMatch ?? 'instance_id',
      originalStart: instance ? googleOriginalStart(instance) : row.start_time,
      originalStartSource: instance ? 'google_original_start' : 'casa_start_fallback',
      googleStart: instance ? googleStart(instance) : null,
      googleStatus: instance?.status ?? null,
      googleEtag: instance?.etag ?? null,
      googleUpdatedAt: instance?.updated ?? null,
      allDay: row.all_day,
      durationMs: new Date(row.end_time).getTime() - new Date(row.start_time).getTime(),
    }
  })
  const reviewReasons = []
  if (duplicateCasaLinks.length > 0) reviewReasons.push('duplicate_casa_google_links')
  if (unmatchedCasaRows.length > 0) reviewReasons.push('unmatched_casa_rows')
  if (detailAnalysis?.ambiguousPaths.length) reviewReasons.push('ambiguous_reusable_baseline')
  const identityMatches = Object.fromEntries(
    [...Map.groupBy(casaRows, (row) => row.identityMatch ?? 'instance_id').entries()]
      .map(([identityMatch, rows]) => [identityMatch, rows.length]),
  )

  return {
    account,
    googleMasterId: master.id,
    iCalUID: master.iCalUID ?? null,
    title: master.summary ?? '(untitled)',
    status: master.status ?? null,
    recurrence: master.recurrence ?? [],
    masterStart: googleStart(master),
    masterEnd: master.end?.dateTime ?? master.end?.date ?? null,
    timezone: master.start?.timeZone ?? master.end?.timeZone ?? 'America/New_York',
    googleEtag: master.etag ?? null,
    googleUpdatedAt: master.updated ?? null,
    googleInstanceCount: instances.length,
    casaOccurrenceCount: casaRows.length,
    identityMatches,
    duplicateCasaLinks,
    missingCasaInstances,
    unmatchedCasaRows,
    googleExceptions,
    occurrenceLinks,
    proposedCasaExceptions,
    proposedTemplateBundle: detailAnalysis?.baseline ?? null,
    templateSourceEventId: detailAnalysis?.templateSourceEventId ?? null,
    baselineHash: detailAnalysis?.baselineHash ?? null,
    ambiguousPaths: detailAnalysis?.ambiguousPaths ?? [],
    migrationDisposition: reviewReasons.length > 0
      ? 'manual_review'
      : casaRows.length > 0
        ? 'shadow_ready'
        : 'google_only',
    reviewReasons,
  }
}
