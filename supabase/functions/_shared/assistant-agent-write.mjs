export function findAgentCalendarDuplicates(events, args) {
  if (!Array.isArray(events) || !args || typeof args !== 'object') return []
  const title = normalizeTitle(args.title)
  const start = Date.parse(String(args.start ?? ''))
  if (!title || !Number.isFinite(start)) return []
  return events.filter((event) =>
    normalizeTitle(event?.title) === title &&
    Date.parse(String(event?.start_time ?? '')) === start
  )
}

export function isAgentCalendarUpdateTargetUnambiguous(entities, args, activeEntity) {
  return isExactTargetUnambiguous(entities, args, activeEntity, 'event', 'title')
}

export function isAgentGroceryUpdateTargetUnambiguous(entities, args, activeEntity) {
  return isExactTargetUnambiguous(entities, args, activeEntity, 'grocery_item', 'name')
}

export function adaptAgentGroceryUpdate(args) {
  if (!args || typeof args !== 'object' || typeof args.id !== 'string') return null
  const commonArgs = {
    item_id: args.id,
    expected_updated_at: args.expected_updated_at,
  }
  if (typeof args.checked === 'boolean' && typeof args.quantity !== 'string') {
    return {
      tool: 'check_grocery_item',
      args: { ...commonArgs, checked: args.checked },
    }
  }
  if (typeof args.quantity === 'string' && typeof args.checked !== 'boolean') {
    return {
      tool: 'update_grocery_item_quantity',
      args: {
        ...commonArgs,
        quantity: args.quantity,
        ...(typeof args.unit === 'string' ? { unit: args.unit } : {}),
      },
    }
  }
  return null
}

export function repairInvalidCalendarMoveDuration(args, entities) {
  if (!args || typeof args !== 'object' || !Array.isArray(entities)) return args
  const newStart = Date.parse(String(args.start ?? ''))
  const proposedEnd = Date.parse(String(args.end ?? ''))
  if (!Number.isFinite(newStart) || (Number.isFinite(proposedEnd) && proposedEnd > newStart)) return args

  const target = entities.find((entity) => entity?.type === 'event' && entity?.id === args.id)
  const oldStart = Date.parse(String(target?.start ?? ''))
  const oldEnd = Date.parse(String(target?.end ?? ''))
  const duration = oldEnd - oldStart
  if (!Number.isFinite(duration) || duration <= 0) return args

  const offset = String(args.start).match(/([+-])(\d{2}):(\d{2})$/)
  if (!offset) return args
  const offsetMinutes = (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3]))
  const localEnd = new Date(newStart + duration + offsetMinutes * 60000)
  return {
    ...args,
    end: `${localEnd.toISOString().slice(0, 19)}${offset[0]}`,
  }
}

export function alignCalendarMoveToRequestedTime(args, entities, requestedTime, expectedUtcOffset) {
  if (
    !args ||
    typeof args !== 'object' ||
    !Array.isArray(entities) ||
    !Number.isInteger(requestedTime?.hour) ||
    !Number.isInteger(requestedTime?.minute) ||
    requestedTime.hour < 0 ||
    requestedTime.hour > 23 ||
    requestedTime.minute < 0 ||
    requestedTime.minute > 59
  ) return args

  const proposedStart = Date.parse(String(args.start ?? ''))
  const target = entities.find((entity) => entity?.type === 'event' && entity?.id === args.id)
  const oldStart = Date.parse(String(target?.start ?? ''))
  const oldEnd = Date.parse(String(target?.end ?? ''))
  const duration = oldEnd - oldStart
  const offset = String(expectedUtcOffset ?? '').match(/^([+-])(\d{2}):(\d{2})$/) ??
    String(args.start ?? '').match(/([+-])(\d{2}):(\d{2})$/)
  if (!Number.isFinite(proposedStart) || !Number.isFinite(duration) || duration <= 0 || !offset) return args

  const offsetMinutes = (offset[1] === '+' ? 1 : -1) * (Number(offset[2]) * 60 + Number(offset[3]))
  const proposedLocalDate = new Date(proposedStart + offsetMinutes * 60000)
  const alignedStart = Date.UTC(
    proposedLocalDate.getUTCFullYear(),
    proposedLocalDate.getUTCMonth(),
    proposedLocalDate.getUTCDate(),
    requestedTime.hour,
    requestedTime.minute,
  ) - offsetMinutes * 60000
  return {
    ...args,
    start: formatAtOffset(alignedStart, offsetMinutes, offset[0]),
    end: formatAtOffset(alignedStart + duration, offsetMinutes, offset[0]),
  }
}

function formatAtOffset(timestamp, offsetMinutes, offsetText) {
  return `${new Date(timestamp + offsetMinutes * 60000).toISOString().slice(0, 19)}${offsetText}`
}

function isExactTargetUnambiguous(entities, args, activeEntity, type, labelKey) {
  if (!Array.isArray(entities) || !args || typeof args !== 'object') return false
  const target = entities.find((entity) => entity?.type === type && entity?.id === args.id)
  if (!target) return false
  if (activeEntity?.type === type && activeEntity.id === target.id) return true
  const targetLabel = normalizeTitle(target[labelKey])
  if (!targetLabel) return false
  return entities.filter((entity) =>
    entity?.type === type && normalizeTitle(entity[labelKey]) === targetLabel
  ).length === 1
}

function normalizeTitle(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : ''
}
