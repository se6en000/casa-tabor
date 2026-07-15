export const REUSABLE_DETAIL_PATHS = Object.freeze([
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
  'googleInvitees',
])

export const OCCURRENCE_FACT_PATHS = Object.freeze([
  'checklistProgress',
  'actionProgress',
  'rsvpResponses',
  'weather',
  'traffic',
  'audit',
  'sync',
])

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function clone(value) {
  return value === undefined ? undefined : structuredClone(value)
}

function pathParts(path) {
  if (typeof path !== 'string' || !path || path.startsWith('.') || path.endsWith('.') || path.includes('..')) {
    throw new Error(`Invalid recurrence detail path: ${String(path)}`)
  }
  return path.split('.')
}

function readPath(source, path) {
  return pathParts(path).reduce(
    (current, part) => isPlainObject(current) || Array.isArray(current)
      ? current[part]
      : undefined,
    source,
  )
}

function writePath(target, path, value) {
  const parts = pathParts(path)
  const leaf = parts.pop()
  let cursor = target
  for (const part of parts) {
    if (!isPlainObject(cursor[part]) && !Array.isArray(cursor[part])) cursor[part] = {}
    cursor = cursor[part]
  }
  if (value === undefined) delete cursor[leaf]
  else cursor[leaf] = clone(value)
}

function isReusablePath(path) {
  return REUSABLE_DETAIL_PATHS.some(
    (allowed) => path === allowed || path.startsWith(`${allowed}.`),
  )
}

export function normalizeExceptionPaths(value) {
  if (!Array.isArray(value)) throw new Error('Occurrence exception paths must be an array.')
  const paths = [...new Set(value.map((path) => {
    pathParts(path)
    if (!isReusablePath(path)) throw new Error(`Occurrence path is not reusable: ${path}`)
    return path
  }))]
  return paths.sort()
}

export function assertReusableDetailBundle(bundle) {
  if (!isPlainObject(bundle)) throw new Error('Reusable event details must be an object.')
  for (const occurrencePath of OCCURRENCE_FACT_PATHS) {
    if (Object.hasOwn(bundle, occurrencePath)) {
      throw new Error(`Occurrence-only data cannot be stored in series defaults: ${occurrencePath}`)
    }
  }
  return bundle
}

export function resolveEffectiveDetailBundle({ template, occurrence }) {
  if (!isPlainObject(template) || !isPlainObject(template.reusable)) {
    throw new Error('A series template with reusable details is required.')
  }
  if (!isPlainObject(occurrence) || !isPlainObject(occurrence.reusable) || !isPlainObject(occurrence.facts)) {
    throw new Error('An occurrence with reusable details and facts is required.')
  }

  assertReusableDetailBundle(template.reusable)
  assertReusableDetailBundle(occurrence.reusable)
  const exceptionPaths = normalizeExceptionPaths(occurrence.exceptionPaths ?? [])
  const reusable = clone(template.reusable)

  for (const path of exceptionPaths) {
    writePath(reusable, path, readPath(occurrence.reusable, path))
  }

  return {
    reusable,
    facts: clone(occurrence.facts),
    exceptionPaths,
    templateRevision: template.revision,
    occurrenceRevisionApplied: occurrence.seriesRevisionApplied,
  }
}

export function applyReusablePatch(bundle, patch, changedPaths) {
  assertReusableDetailBundle(bundle)
  if (!isPlainObject(patch)) throw new Error('Reusable detail patch must be an object.')
  const paths = normalizeExceptionPaths(changedPaths)
  const next = clone(bundle)
  for (const path of paths) writePath(next, path, readPath(patch, path))
  return next
}
