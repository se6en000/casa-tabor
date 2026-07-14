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
  if (!Array.isArray(entities) || !args || typeof args !== 'object') return false
  const target = entities.find((entity) => entity?.type === 'event' && entity?.id === args.id)
  if (!target) return false
  if (activeEntity?.type === 'event' && activeEntity.id === target.id) return true
  const targetTitle = normalizeTitle(target.title)
  if (!targetTitle) return false
  return entities.filter((entity) =>
    entity?.type === 'event' && normalizeTitle(entity.title) === targetTitle
  ).length === 1
}

function normalizeTitle(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : ''
}
