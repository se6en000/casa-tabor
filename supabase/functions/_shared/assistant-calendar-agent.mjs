export const CALENDAR_SEMANTIC_TURN_VERSION = 'calendar-semantic-turn-v1'

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']

export function resolveCalendarSemanticTurn(turn, context = {}) {
  if (!turn || turn.version !== CALENDAR_SEMANTIC_TURN_VERSION) {
    return reject('invalid_calendar_semantic_turn')
  }
  if (!['create', 'revise', 'update', 'delete', 'complete'].includes(turn.action)) {
    return reject('unsupported_calendar_action')
  }

  const pending = normalizePendingCalendarAction(context.pendingAction)
  const entities = Array.isArray(context.authoritativeEntities)
    ? context.authoritativeEntities.filter((entity) => entity?.type === 'event')
    : []
  const activeEntity = context.activeEntity?.type === 'event'
    ? entities.find((entity) => entity.id === context.activeEntity.id) ?? null
    : null
  const action = turn.action === 'revise' && pending?.toolName !== 'calendar.create' && activeEntity
    ? 'update'
    : turn.action === 'update' && pending?.toolName === 'calendar.create'
      ? 'revise'
      : turn.action

  if (action === 'create' || action === 'revise') {
    if (action === 'revise' && pending?.toolName !== 'calendar.create') {
      return reject('pending_calendar_create_required')
    }
    return resolveCreate(turn, pending?.args ?? null, context)
  }

  const target = resolveTarget(turn, activeEntity, entities, context)
  if (target.kind !== 'target') return target
  if (action === 'delete' || action === 'complete') {
    if (action === 'complete' && target.entity.eventType !== 'reminder') {
      return reject('calendar_reminder_required')
    }
    return {
      kind: 'tool',
      toolName: action === 'complete' ? 'calendar.complete_reminder' : 'calendar.delete',
      args: {
        id: target.entity.id,
        expected_updated_at: target.entity.version,
        title: target.entity.title,
      },
    }
  }
  return resolveUpdate(turn, target.entity, context)
}

function resolveCreate(turn, baseArgs, context) {
  const patch = normalizePatch(turn.patch)
  const eventType = patch.eventType ?? normalizeEventType(baseArgs?.event_type)
  const title = patch.title ?? optionalText(baseArgs?.title)
  if (!title) return clarify(`What should I call the ${eventType}?`, 'title')

  const range = resolveRange(patch, baseArgs, context, {
    requireTime: eventType !== 'reminder',
    defaultDurationMinutes: eventType === 'reminder' ? 30 : 60,
  })
  if (range.kind !== 'range') return range

  const members = mergeNames(
    Array.isArray(baseArgs?.members) ? baseArgs.members : [],
    patch.membersAdd,
    patch.membersRemove,
  )
  return {
    kind: 'tool',
    toolName: 'calendar.create',
    args: {
      ...(baseArgs && typeof baseArgs === 'object' ? baseArgs : {}),
      title,
      start: range.start,
      end: range.end,
      ...(eventType === 'reminder' ? { event_type: 'reminder' } : {}),
      ...(members.length > 0 ? { members } : {}),
      ...(patch.location !== undefined ? { location: patch.location } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      ...(patch.allDay !== undefined ? { all_day: patch.allDay } : {}),
    },
  }
}

function resolveUpdate(turn, target, context) {
  if (typeof target.version !== 'string' || !target.version) {
    return reject('authoritative_event_version_required')
  }
  const patch = normalizePatch(turn.patch)
  const range = resolveRange(patch, {
    start: target.start,
    end: target.end,
    all_day: target.allDay,
  }, context, { requireTime: false, defaultDurationMinutes: 60 })
  if (range.kind !== 'range') return range

  const args = {
    id: target.id,
    expected_updated_at: target.version,
  }
  if (patch.title !== undefined) args.title = patch.title
  if (range.changed) {
    args.start = range.start
    args.end = range.end
  }
  if (patch.membersAdd.length > 0) args.members_add = patch.membersAdd
  if (patch.membersRemove.length > 0) args.members_remove = patch.membersRemove
  if (patch.location !== undefined) args.location = patch.location
  if (patch.notes !== undefined) args.notes = patch.notes
  if (patch.allDay !== undefined) args.all_day = patch.allDay
  if (Object.keys(args).length === 2) return clarify('What would you like to change?', 'calendar_change')

  return { kind: 'tool', toolName: 'calendar.update', args }
}

function resolveRange(patch, baseArgs, context, options) {
  const offset = validOffset(context.utcOffset)
  if (!offset) return reject('valid_household_utc_offset_required')
  if (patch.relativeMinutes) {
    const current = Date.parse(String(context.currentDate ?? ''))
    if (!Number.isFinite(current)) return reject('valid_current_date_required')
    const startMs = current + patch.relativeMinutes * 60000
    const durationMinutes = patch.durationMinutes ?? options.defaultDurationMinutes
    if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 366 * 24 * 60) {
      return reject('invalid_calendar_duration')
    }
    return {
      kind: 'range',
      start: formatAtOffset(startMs, offset),
      end: formatAtOffset(startMs + durationMinutes * 60000, offset),
      changed: true,
    }
  }
  const baseStart = parseLocalDateTime(baseArgs?.start, offset)
  const baseEnd = parseLocalDateTime(baseArgs?.end, offset)
  const date = patch.dateReference
    ? resolveDateReference(patch.dateReference, context.currentDate, offset.minutes)
    : baseStart?.date ?? null
  if (!date) return clarify('What day should I use?', 'date')

  const time = patch.time
    ? resolveClock(patch.time, baseStart)
    : baseStart
      ? { hour: baseStart.hour, minute: baseStart.minute }
      : null
  if (!time && options.requireTime && patch.allDay !== true) {
    return clarify('What time should I use?', 'time')
  }

  const allDay = patch.allDay ?? baseArgs?.all_day === true
  const startHour = allDay ? 0 : time?.hour
  const startMinute = allDay ? 0 : time?.minute
  if (!Number.isInteger(startHour) || !Number.isInteger(startMinute)) {
    return clarify('What time should I use?', 'time')
  }

  const baseDurationMinutes = baseStart && baseEnd
    ? Math.round((baseEnd.timestamp - baseStart.timestamp) / 60000)
    : null
  const startMs = timestampForLocal(date, startHour, startMinute, offset.minutes) +
    (patch.shiftDays && !patch.dateReference ? patch.shiftDays * 24 * 60 * 60000 : 0)
  let durationMinutes = patch.durationMinutes
  if (patch.endDateReference) {
    if (!allDay) return reject('multi_day_range_requires_all_day')
    const inclusiveEndDate = resolveDateReference(
      patch.endDateReference,
      context.currentDate,
      offset.minutes,
    )
    if (!inclusiveEndDate) return clarify('What is the last day of the event?', 'end_date')
    const exclusiveEndMs = timestampForLocal(inclusiveEndDate, 0, 0, offset.minutes) + 24 * 60 * 60000
    durationMinutes = Math.round((exclusiveEndMs - startMs) / 60000)
  } else if (patch.durationDays) {
    if (!allDay) return reject('calendar_day_duration_requires_all_day')
    durationMinutes = patch.durationDays * 24 * 60
  } else if (!durationMinutes && baseDurationMinutes) {
    durationMinutes = baseDurationMinutes
  }
  if (!durationMinutes) durationMinutes = allDay ? 24 * 60 : options.defaultDurationMinutes
  if (!Number.isSafeInteger(durationMinutes) || durationMinutes <= 0 || durationMinutes > 366 * 24 * 60) {
    return reject('invalid_calendar_duration')
  }

  const changed = Boolean(
    patch.dateReference ||
    patch.endDateReference ||
    patch.time ||
    patch.durationMinutes ||
    patch.durationDays ||
    patch.shiftDays ||
    patch.relativeMinutes ||
    patch.allDay !== undefined
  )
  return {
    kind: 'range',
    start: formatAtOffset(startMs, offset),
    end: formatAtOffset(startMs + durationMinutes * 60000, offset),
    changed,
  }
}

function resolveTarget(turn, activeEntity, entities, context) {
  if (activeEntity && context.preferActiveEntity === true) {
    return { kind: 'target', entity: activeEntity }
  }
  const requestedId = optionalText(turn.targetEntityId)
  if (requestedId) {
    const target = entities.find((entity) => entity.id === requestedId)
    return target ? { kind: 'target', entity: target } : reject('unknown_authoritative_event')
  }
  if (activeEntity && !hasTargetClues(turn.target)) {
    return { kind: 'target', entity: activeEntity }
  }

  const candidateIds = Array.isArray(turn.candidateEntityIds)
    ? [...new Set(turn.candidateEntityIds.filter((id) => typeof id === 'string'))]
    : []
  let candidates = candidateIds.flatMap((id) => {
    const entity = entities.find((candidate) => candidate.id === id)
    return entity ? [entity] : []
  })
  if (candidates.length === 0 && turn.target) candidates = [...entities]
  if (turn.target && candidates.length > 0) {
    const target = normalizePatch(turn.target)
    if (target.title) {
      const hint = normalizeSearchText(target.title)
      candidates = candidates.filter((candidate) => {
        const label = normalizeSearchText(candidate.title)
        return label.includes(hint) || hint.includes(label)
      })
    }

    const offset = validOffset(context.utcOffset)
    const date = target.dateReference && offset
      ? resolveDateReference(target.dateReference, context.currentDate, offset.minutes)
      : null
    if (date && offset) {
      candidates = candidates.filter((candidate) =>
        parseLocalDateTime(candidate.start, offset)?.date === date
      )
    }
    if (target.time && offset) {
      const clock = resolveClock(target.time, null)
      if (clock) {
        candidates = candidates.filter((candidate) => {
          const start = parseLocalDateTime(candidate.start, offset)
          return start?.hour === clock.hour && start?.minute === clock.minute
        })
      }
    }
  }
  if (candidates.length === 1) return { kind: 'target', entity: candidates[0] }
  if (candidates.length > 1) {
    return {
      kind: 'clarify',
      code: 'ambiguous_authoritative_target',
      slot: 'event_id',
      candidates,
      text: `Which event do you mean: ${candidates.map((candidate) => candidate.title).join(', ')}?`,
    }
  }
  return clarify('Which calendar event do you mean?', 'event_id')
}

export function shouldPreferActiveCalendarEntity(text, activeEntity, entities = []) {
  if (
    activeEntity?.type !== 'event' ||
    typeof activeEntity.id !== 'string' ||
    !/\b(?:it|that|this|same one)\b/i.test(String(text ?? ''))
  ) {
    return false
  }

  const normalizedText = normalizeSearchText(text)
  return !entities.some((entity) => {
    if (entity?.type !== 'event' || entity.id === activeEntity.id) return false
    const literalTitle = String(entity.title ?? '')
    const titleCandidates = [
      literalTitle,
      ...(literalTitle.includes(' | ') ? [literalTitle.slice(literalTitle.indexOf(' | ') + 3)] : []),
    ].map(normalizeSearchText)
    return titleCandidates.some((title) => title.length >= 4 && normalizedText.includes(title))
  })
}

function hasTargetClues(value) {
  if (!value || typeof value !== 'object') return false
  return Boolean(
    optionalText(value.title) ||
    normalizeDateReference(value.date_reference) ||
    normalizeTime(value.time),
  )
}

function normalizePatch(value) {
  const patch = value && typeof value === 'object' ? value : {}
  return {
    title: optionalText(patch.title),
    dateReference: normalizeDateReference(patch.date_reference),
    endDateReference: normalizeDateReference(patch.end_date_reference),
    time: normalizeTime(patch.time),
    durationMinutes: positiveInteger(patch.duration_minutes),
    durationDays: positiveInteger(patch.duration_days),
    shiftDays: safeInteger(patch.shift_days),
    relativeMinutes: boundedPositiveInteger(patch.relative_minutes, 366 * 24 * 60),
    membersAdd: stringList(patch.members_add),
    membersRemove: stringList(patch.members_remove),
    location: optionalPatchText(patch, 'location'),
    notes: optionalPatchText(patch, 'notes'),
    allDay: typeof patch.all_day === 'boolean' ? patch.all_day : undefined,
    eventType: normalizeEventType(patch.event_type, undefined),
  }
}

function normalizeEventType(value, fallback = 'event') {
  return value === 'reminder' || value === 'event' ? value : fallback
}

function normalizeDateReference(value) {
  if (!value || typeof value !== 'object') return null
  const kind = optionalText(value.kind)
  if (kind === 'absolute') {
    const year = positiveInteger(value.year)
    const month = positiveInteger(value.month)
    const day = positiveInteger(value.day)
    return month && day ? { kind, ...(year ? { year } : {}), month, day } : null
  }

  if (kind === 'weekday' && WEEKDAYS.includes(value.weekday)) {
    return { kind, weekday: value.weekday }
  }
  if (['today', 'tomorrow', 'day_after_tomorrow'].includes(kind)) return { kind }
  if (kind === 'relative_days' && Number.isSafeInteger(value.offset_days)) {
    return { kind, offsetDays: value.offset_days }
  }
  return null
}

function safeInteger(value) {
  return Number.isSafeInteger(value) && Math.abs(value) <= 366 ? value : null
}

function normalizeTime(value) {
  if (!value || typeof value !== 'object') return null
  const hour = positiveInteger(value.hour)
  const minute = value.minute === undefined ? 0 : Number(value.minute)
  const period = ['am', 'pm', 'ambiguous'].includes(value.period) ? value.period : null
  if (!hour || hour > 12 || !period || !Number.isInteger(minute) || minute < 0 || minute > 59) {
    return null
  }
  return { hour, minute, period }
}

function resolveClock(time, baseStart) {
  const explicitPeriod = ['am', 'pm'].includes(time.period) ? time.period : null
  if (explicitPeriod) {
    return {
      hour: (time.hour % 12) + (explicitPeriod === 'pm' ? 12 : 0),
      minute: time.minute,
    }
  }
  if (baseStart) {
    const morning = time.hour % 12
    const evening = morning + 12
    const selected = Math.abs(evening - baseStart.hour) < Math.abs(morning - baseStart.hour)
      ? evening
      : morning
    return { hour: selected, minute: time.minute }
  }
  return null
}

function resolveDateReference(reference, currentDate, offsetMinutes) {
  if (reference.kind === 'absolute') {
    const current = new Date(currentDate)
    if (!Number.isFinite(current.getTime())) return null
    const currentLocal = new Date(current.getTime() + offsetMinutes * 60000)
    let year = reference.year ?? currentLocal.getUTCFullYear()
    let value = new Date(Date.UTC(year, reference.month - 1, reference.day, 12))
    if (
      reference.year === undefined &&
      formatDate(value) < formatDate(currentLocal)
    ) {
      year += 1
      value = new Date(Date.UTC(year, reference.month - 1, reference.day, 12))
    }
    if (
      value.getUTCFullYear() !== year ||
      value.getUTCMonth() !== reference.month - 1 ||
      value.getUTCDate() !== reference.day
    ) return null
    return formatDate(value)
  }

  const base = new Date(currentDate)
  if (!Number.isFinite(base.getTime())) return null
  const baseLocal = new Date(base.getTime() + offsetMinutes * 60000)
  const localDate = new Date(Date.UTC(
    baseLocal.getUTCFullYear(),
    baseLocal.getUTCMonth(),
    baseLocal.getUTCDate(),
    12,
  ))
  let days = reference.kind === 'tomorrow'
    ? 1
    : reference.kind === 'day_after_tomorrow'
      ? 2
      : reference.kind === 'relative_days'
        ? reference.offsetDays
        : 0
  if (reference.kind === 'weekday') {
    const target = WEEKDAYS.indexOf(reference.weekday)
    days = (target - localDate.getUTCDay() + 7) % 7 || 7
  }
  localDate.setUTCDate(localDate.getUTCDate() + days)
  return formatDate(localDate)
}

function parseLocalDateTime(value, offset) {
  const timestamp = Date.parse(String(value ?? ''))
  if (!Number.isFinite(timestamp)) return null
  const local = new Date(timestamp + offset.minutes * 60000)
  return {
    timestamp,
    date: formatDate(local),
    hour: local.getUTCHours(),
    minute: local.getUTCMinutes(),
  }
}

function timestampForLocal(date, hour, minute, offsetMinutes) {
  const [year, month, day] = date.split('-').map(Number)
  return Date.UTC(year, month - 1, day, hour, minute) - offsetMinutes * 60000
}

function formatAtOffset(timestamp, offset) {
  return `${new Date(timestamp + offset.minutes * 60000).toISOString().slice(0, 19)}${offset.text}`
}

function formatDate(value) {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

function validOffset(value) {
  const match = String(value ?? '').match(/^([+-])(\d{2}):(\d{2})$/)
  if (!match) return null
  const minutes = (match[1] === '+' ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3]))
  return { text: match[0], minutes }
}

function normalizePendingCalendarAction(value) {
  if (!value || typeof value !== 'object') return null
  if (!['calendar.create', 'calendar.update', 'calendar.delete'].includes(value.toolName)) return null
  return {
    toolName: value.toolName,
    args: value.args && typeof value.args === 'object' ? value.args : {},
  }
}

function mergeNames(current, additions, removals) {
  const removed = new Set(removals.map((name) => name.toLocaleLowerCase()))
  const values = [...current, ...additions].filter((name) => !removed.has(name.toLocaleLowerCase()))
  return [...new Map(values.map((name) => [name.toLocaleLowerCase(), name])).values()]
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === 'string' && item.trim()).map((item) => item.trim())
    : []
}

function positiveInteger(value) {
  const number = Number(value)
  return Number.isSafeInteger(number) && number > 0 ? number : null
}

function boundedPositiveInteger(value, maximum) {
  const number = positiveInteger(value)
  return number && number <= maximum ? number : null
}

function optionalText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function optionalPatchText(value, key) {
  if (!(key in value) || typeof value[key] !== 'string') return undefined
  return value[key].trim()
}

function clarify(text, slot) {
  return { kind: 'clarify', code: 'calendar_detail_required', slot, text }
}

function reject(code) {
  return { kind: 'reject', code }
}
