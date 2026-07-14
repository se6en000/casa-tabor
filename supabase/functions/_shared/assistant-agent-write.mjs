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

function normalizeTitle(value) {
  return typeof value === 'string'
    ? value.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    : ''
}
