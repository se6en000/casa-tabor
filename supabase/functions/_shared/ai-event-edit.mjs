export const EVENT_CATEGORIES = [
  'sports',
  'school',
  'medical',
  'appointment',
  'child_care',
  'home_maintenance',
  'dining',
  'travel',
  'social',
  'birthday',
  'work',
  'errand',
  'holiday',
  'other',
]

export const RECURRING_EDIT_ERROR =
  'AI editing for recurring events is not supported yet. Use the regular event editor so you can choose This event, Future events, or All events.'

export const AI_EVENT_EDIT_LIMITS = {
  whatToBring: 25,
  checklistItems: 30,
  actionItems: 30,
  membersPerAction: 10,
}

const ALLOWED_UPDATE_KEYS = new Set([
  'id',
  'expected_updated_at',
  'recurrence_scope',
  'expected_series_revision',
  'title',
  'start',
  'end',
  'location',
  'address',
  'description',
  'all_day',
  'notes',
  'category',
  'what_to_bring',
  'outfit_suggestion',
  'parking_notes',
  'contact_name',
  'contact_phone',
  'cost_estimate',
  'dietary_notes',
  'meal_impact',
  'checklist_items',
  'action_items',
  'members_add',
  'members_remove',
])

export function normalizeOptionalText(value) {
  if (value === undefined) return undefined
  if (value == null) return null
  const text = String(value).trim()
  return text === '' ? null : text
}

export function normalizeStringList(value) {
  if (value === undefined) return undefined
  const items = Array.isArray(value) ? value : String(value).split(/\n|,/)
  return items.map((item) => String(item).trim()).filter(Boolean)
}

export function preserveChecklistStateForLegacyBringList(replacementItems, currentItems) {
  const currentByLabel = new Map()
  for (const item of currentItems ?? []) {
    const key = String(item.label ?? '').trim().toLowerCase()
    if (!key) continue
    const matches = currentByLabel.get(key) ?? []
    matches.push(item)
    currentByLabel.set(key, matches)
  }

  return (replacementItems ?? []).map((item) => {
    const key = String(item.label ?? '').trim().toLowerCase()
    const matches = currentByLabel.get(key)
    const current = matches?.shift()
    if (!current) return item
    return {
      ...item,
      id: current.id,
      note: current.note ?? item.note,
      checked: current.checked === true,
      category: current.category ?? item.category,
    }
  })
}

function isBoolean(value) {
  return typeof value === 'boolean'
}

function isValidIsoDateTime(value) {
  return typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Date.parse(value))
}

function normalizeExpectedUpdatedAt(value, errors) {
  if (value === undefined) return undefined
  if (!isValidIsoDateTime(value)) {
    errors.push('expected_updated_at must be an ISO datetime')
    return undefined
  }
  return String(value)
}

function normalizeChecklistItems(value, errors) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push('checklist_items must be an array')
    return undefined
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`checklist_items[${index}] must be an object`)
      return null
    }
    const label = normalizeOptionalText(item.label)
    if (!label) errors.push(`checklist_items[${index}].label is required`)
    if (item.checked !== undefined && !isBoolean(item.checked)) {
      errors.push(`checklist_items[${index}].checked must be a boolean`)
    }
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
      label: label ?? '',
      note: normalizeOptionalText(item.note),
      checked: item.checked === true,
      category: normalizeOptionalText(item.category),
    }
  }).filter(Boolean)
}

function normalizeActionItems(value, errors) {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) {
    errors.push('action_items must be an array')
    return undefined
  }
  return value.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`action_items[${index}] must be an object`)
      return null
    }
    const title = normalizeOptionalText(item.title)
    if (!title) errors.push(`action_items[${index}].title is required`)
    if (item.is_urgent !== undefined && !isBoolean(item.is_urgent)) {
      errors.push(`action_items[${index}].is_urgent must be a boolean`)
    }
    if (item.completed !== undefined && !isBoolean(item.completed)) {
      errors.push(`action_items[${index}].completed must be a boolean`)
    }
    if (item.due_date !== undefined && item.due_date !== null && normalizeOptionalText(item.due_date) !== null && !isValidIsoDateTime(String(item.due_date))) {
      errors.push(`action_items[${index}].due_date must be an ISO datetime`)
    }
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : undefined,
      title: title ?? '',
      description: normalizeOptionalText(item.description),
      due_date: normalizeOptionalText(item.due_date),
      is_urgent: item.is_urgent === true,
      completed: item.completed === true,
      assigned_to: normalizeOptionalText(item.assigned_to),
    }
  }).filter(Boolean)
}

export function buildValidatedUpdatePayload(args) {
  const errors = []

  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    return { errors: ['update_event arguments must be an object'] }
  }

  for (const key of Object.keys(args)) {
    if (!ALLOWED_UPDATE_KEYS.has(key)) {
      errors.push(`Unsupported update_event field: ${key}`)
    }
  }

  if (typeof args.id !== 'string' || !args.id.trim()) {
    errors.push('id is required')
  }

  const eventUpdates = {}
  const enrichmentUpdates = {}
  const expectedUpdatedAt = normalizeExpectedUpdatedAt(args.expected_updated_at, errors)
  if (expectedUpdatedAt === undefined) {
    errors.push('expected_updated_at is required')
  }
  const recurrenceScope = args.recurrence_scope === undefined
    ? undefined
    : ['this', 'future', 'all'].includes(args.recurrence_scope)
      ? args.recurrence_scope
      : (errors.push('recurrence_scope must be this, future, or all'), undefined)
  const expectedSeriesRevision = args.expected_series_revision === undefined
    ? undefined
    : Number.isSafeInteger(args.expected_series_revision) && args.expected_series_revision > 0
      ? args.expected_series_revision
      : (errors.push('expected_series_revision must be a positive integer'), undefined)

  if (args.title !== undefined) {
    const title = normalizeOptionalText(args.title)
    if (!title) errors.push('title cannot be empty')
    else eventUpdates.title = title
  }

  if (args.start !== undefined) {
    if (!isValidIsoDateTime(args.start)) errors.push('start must be an ISO datetime')
    else eventUpdates.start_time = String(args.start)
  }

  if (args.end !== undefined) {
    if (!isValidIsoDateTime(args.end)) errors.push('end must be an ISO datetime')
    else eventUpdates.end_time = String(args.end)
  }

  if (eventUpdates.start_time && eventUpdates.end_time) {
    if (Date.parse(eventUpdates.end_time) <= Date.parse(eventUpdates.start_time)) {
      errors.push('end must be after start')
    }
  }

  if (args.location !== undefined) eventUpdates.location_name = normalizeOptionalText(args.location)
  if (args.address !== undefined) eventUpdates.address = normalizeOptionalText(args.address)
  if (args.description !== undefined) eventUpdates.description = normalizeOptionalText(args.description)

  if (args.all_day !== undefined) {
    if (!isBoolean(args.all_day)) errors.push('all_day must be a boolean')
    else eventUpdates.all_day = args.all_day
  }

  if (args.notes !== undefined) enrichmentUpdates.prep_notes = normalizeOptionalText(args.notes)
  if (args.category !== undefined) {
    const category = normalizeOptionalText(args.category)
    if (category !== null && category !== undefined && !EVENT_CATEGORIES.includes(category)) {
      errors.push(`category must be one of: ${EVENT_CATEGORIES.join(', ')}`)
    } else {
      enrichmentUpdates.category = category ?? null
    }
  }

  const bringList = normalizeStringList(args.what_to_bring)

  for (const [argKey, targetKey] of [
    ['outfit_suggestion', 'outfit_suggestion'],
    ['parking_notes', 'parking_notes'],
    ['contact_name', 'contact_name'],
    ['contact_phone', 'contact_phone'],
    ['cost_estimate', 'cost_estimate'],
    ['dietary_notes', 'dietary_notes'],
    ['meal_impact', 'meal_impact'],
  ]) {
    if (args[argKey] !== undefined) enrichmentUpdates[targetKey] = normalizeOptionalText(args[argKey])
  }

  const explicitChecklistItems = normalizeChecklistItems(args.checklist_items, errors)
  const checklistItems = explicitChecklistItems ?? bringList?.map((label) => ({
    id: undefined,
    label,
    note: null,
    checked: false,
    category: undefined,
  }))
  const actionItems = normalizeActionItems(args.action_items, errors)

  const membersAdd = args.members_add === undefined
    ? undefined
    : Array.isArray(args.members_add)
      ? args.members_add.map((name) => String(name).trim()).filter(Boolean)
      : (errors.push('members_add must be an array'), undefined)

  const membersRemove = args.members_remove === undefined
    ? undefined
    : Array.isArray(args.members_remove)
      ? args.members_remove.map((name) => String(name).trim()).filter(Boolean)
      : (errors.push('members_remove must be an array'), undefined)

  if (bringList && bringList.length > AI_EVENT_EDIT_LIMITS.whatToBring) {
    errors.push(`what_to_bring cannot exceed ${AI_EVENT_EDIT_LIMITS.whatToBring} items`)
  }
  if (checklistItems && checklistItems.length > AI_EVENT_EDIT_LIMITS.checklistItems) {
    errors.push(`checklist_items cannot exceed ${AI_EVENT_EDIT_LIMITS.checklistItems} items`)
  }
  if (actionItems && actionItems.length > AI_EVENT_EDIT_LIMITS.actionItems) {
    errors.push(`action_items cannot exceed ${AI_EVENT_EDIT_LIMITS.actionItems} items`)
  }
  if (membersAdd && membersAdd.length > AI_EVENT_EDIT_LIMITS.membersPerAction) {
    errors.push(`members_add cannot exceed ${AI_EVENT_EDIT_LIMITS.membersPerAction} names`)
  }
  if (membersRemove && membersRemove.length > AI_EVENT_EDIT_LIMITS.membersPerAction) {
    errors.push(`members_remove cannot exceed ${AI_EVENT_EDIT_LIMITS.membersPerAction} names`)
  }

  if (
    Object.keys(eventUpdates).length === 0 &&
    Object.keys(enrichmentUpdates).length === 0 &&
    checklistItems === undefined &&
    actionItems === undefined &&
    membersAdd === undefined &&
    membersRemove === undefined
  ) {
    errors.push('update_event must include at least one editable field')
  }

  return {
    errors,
    normalized: {
      eventId: String(args.id ?? '').trim(),
      expectedUpdatedAt,
      recurrenceScope,
      expectedSeriesRevision,
      eventUpdates,
      enrichmentUpdates,
      checklistItems,
      actionItems,
      membersAdd,
      membersRemove,
      destinationChanged: args.location !== undefined || args.address !== undefined,
      changedEventFields: [
        ...(args.title !== undefined ? ['title'] : []),
        ...(args.start !== undefined ? ['start_time'] : []),
        ...(args.end !== undefined ? ['end_time'] : []),
        ...(args.location !== undefined ? ['location_name'] : []),
        ...(args.address !== undefined ? ['address'] : []),
        ...(args.description !== undefined ? ['description'] : []),
        ...(args.all_day !== undefined ? ['all_day'] : []),
      ],
      changedEnrichmentFields: [
        ...(args.category !== undefined ? ['category'] : []),
        ...(args.notes !== undefined ? ['prep_notes'] : []),
        ...(args.outfit_suggestion !== undefined ? ['outfit_suggestion'] : []),
        ...(args.parking_notes !== undefined ? ['parking_notes'] : []),
        ...(args.contact_name !== undefined ? ['contact_name'] : []),
        ...(args.contact_phone !== undefined ? ['contact_phone'] : []),
        ...(args.cost_estimate !== undefined ? ['cost_estimate'] : []),
        ...(args.dietary_notes !== undefined ? ['dietary_notes'] : []),
        ...(args.meal_impact !== undefined ? ['meal_impact'] : []),
      ],
      membersChanged: (membersAdd?.length ?? 0) > 0 || (membersRemove?.length ?? 0) > 0,
    },
  }
}
