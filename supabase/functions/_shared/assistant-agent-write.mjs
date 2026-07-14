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
