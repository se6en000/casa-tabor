export function findAgentCalendarDuplicates(events, args) {
  if (!Array.isArray(events) || !args || typeof args !== 'object') return []
  const title = normalizeTitle(args.title)
  const start = Date.parse(String(args.start ?? ''))
  const eventType = args.event_type === 'reminder' ? 'reminder' : 'event'
  if (!title || !Number.isFinite(start)) return []
  return events.filter((event) =>
    normalizeTitle(event?.title) === title &&
    Date.parse(String(event?.start_time ?? '')) === start &&
    (event?.event_type === 'reminder' ? 'reminder' : 'event') === eventType
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

export function normalizeAgentGroceryAddArgs(args) {
  if (!args || typeof args !== 'object' || !Array.isArray(args.items)) return args
  return {
    ...args,
    items: args.items.map((item) => {
      if (!item || typeof item !== 'object') return item
      const normalized = { ...item }
      const quantity = normalizeQuantity(item.quantity)
      const unit = typeof item.unit === 'string' && !/^(?:thing|things|item|items)$/i.test(item.unit.trim())
        ? item.unit.trim()
        : null
      const category = typeof item.category === 'string' && !/^for\s+/i.test(item.category.trim())
        ? item.category.trim()
        : null
      if (quantity) normalized.quantity = quantity
      else delete normalized.quantity
      if (unit) normalized.unit = unit
      else delete normalized.unit
      if (category) normalized.category = category
      else delete normalized.category
      return normalized
    }),
  }
}

export function shouldUseAgentWritePlanner(options = {}) {
  return options.agentRuntimeEnabled === true &&
    options.agentWriteEnabled === true &&
    Number(options.agentWriteRate) > 0 &&
    options.isCalendarSemanticRead !== true &&
    options.reminderDomainLanguage !== true &&
    options.explicitReminderCreate !== true &&
    options.hasGroceryFrame !== true &&
    options.pageEligible === true &&
    options.chefMode !== true &&
    options.hasImage !== true &&
    Number(options.sample) < Number(options.agentWriteRate)
}

export function normalizeLegacyCalendarActionArgs(tool, args) {
  if (
    !['create_event', 'update_event', 'bulk_update_events'].includes(tool) ||
    !args ||
    typeof args !== 'object' ||
    Array.isArray(args)
  ) {
    return args
  }

  const normalized = { ...args }
  if (normalized.start === undefined && typeof normalized.start_time === 'string') {
    normalized.start = normalized.start_time
  }
  if (normalized.end === undefined && typeof normalized.end_time === 'string') {
    normalized.end = normalized.end_time
  }
  delete normalized.start_time
  delete normalized.end_time
  return normalized
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

function normalizeQuantity(value) {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  const numberWords = {
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    ten: '10',
    eleven: '11',
    twelve: '12',
  }
  const genericCount = normalized.match(/^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+(?:\.\d+)?)\s+(?:thing|things|item|items)$/)
  if (genericCount) return numberWords[genericCount[1]] ?? genericCount[1]
  return numberWords[normalized] ?? normalized
}
