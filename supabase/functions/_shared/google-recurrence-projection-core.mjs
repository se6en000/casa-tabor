const CASA_BLOCK_START = '<!-- CASA-TABOR-DETAILS:START -->'
const CASA_BLOCK_END = '<!-- CASA-TABOR-DETAILS:END -->'
const DEFAULT_DESCRIPTION_LIMIT = 8_000

function text(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function compactLines(lines) {
  return lines.map(text).filter(Boolean)
}

function formatItems(items, labelKey = 'label') {
  if (!Array.isArray(items)) return []
  return items
    .map((item) => text(item?.[labelKey] ?? item?.title ?? item?.description))
    .filter(Boolean)
}

function buildCasaDetailsLines(bundle, eventUrl) {
  const members = Array.isArray(bundle.members)
    ? bundle.members.map((member) => text(member?.name ?? member?.family_member?.name)).filter(Boolean)
    : []
  const enrichment = bundle.enrichment ?? {}
  const transportation = bundle.transportation_plan ?? null
  const logistics = formatItems(bundle.logistics, 'title')
  const checklist = formatItems(bundle.checklist_definitions)
  const actions = formatItems(bundle.action_definitions, 'title')
  const bring = Array.isArray(enrichment.what_to_bring)
    ? enrichment.what_to_bring.map(text).filter(Boolean)
    : []

  return compactLines([
    'Casa Tabor details',
    members.length ? `People: ${members.join(', ')}` : '',
    enrichment.category ? `Category: ${enrichment.category}` : '',
    bring.length ? `Bring: ${bring.join(', ')}` : '',
    enrichment.prep_notes ? `Prep: ${enrichment.prep_notes}` : '',
    enrichment.parking_notes ? `Parking: ${enrichment.parking_notes}` : '',
    transportation ? `Transportation: ${text(transportation.summary) || `${transportation.legs?.length ?? 0} leg(s)`}` : '',
    logistics.length ? `Logistics: ${logistics.join('; ')}` : '',
    checklist.length ? `Checklist: ${checklist.join('; ')}` : '',
    actions.length ? `Actions: ${actions.join('; ')}` : '',
    eventUrl ? `Open in Casa: ${eventUrl}` : '',
  ])
}

export function replaceCasaDetailsBlock(description, casaLines, maxLength = DEFAULT_DESCRIPTION_LIMIT) {
  const current = text(description)
  const start = current.indexOf(CASA_BLOCK_START)
  const end = current.indexOf(CASA_BLOCK_END)
  const withoutCasa = start >= 0 && end > start
    ? `${current.slice(0, start)}${current.slice(end + CASA_BLOCK_END.length)}`.trim()
    : current
  const markerLength = CASA_BLOCK_START.length + CASA_BLOCK_END.length + 2
  const contentBudget = Math.max(0, maxLength - markerLength)
  const preservedBudget = Math.min(withoutCasa.length, Math.floor(contentBudget / 2))
  const preserved = withoutCasa.length > preservedBudget
    ? `${withoutCasa.slice(0, Math.max(0, preservedBudget - 1)).trimEnd()}…`
    : withoutCasa
  const header = preserved ? `${preserved}\n\n` : ''
  const available = Math.max(0, contentBudget - header.length)
  let details = compactLines(casaLines).join('\n')
  if (details.length > available) {
    details = available > 1 ? `${details.slice(0, available - 1).trimEnd()}…` : ''
  }
  return `${header}${CASA_BLOCK_START}\n${details}\n${CASA_BLOCK_END}`
}

function googleTime(event, timezone) {
  if (event.all_day) {
    return {
      start: { date: text(event.start_time).slice(0, 10) },
      end: { date: text(event.end_time).slice(0, 10) },
    }
  }
  return {
    start: { dateTime: new Date(event.start_time).toISOString(), timeZone: timezone },
    end: { dateTime: new Date(event.end_time).toISOString(), timeZone: timezone },
  }
}

export function serializeGoogleRecurrenceProjection({
  event,
  series,
  bundle = {},
  existingGoogleDescription = '',
  invitationAttendees = [],
  casaBaseUrl = 'https://casa-tabor.vercel.app',
}) {
  if (!event?.id || !series?.id || !Number.isInteger(series.revision) || series.revision < 1) {
    throw new Error('A persisted event and revisioned series are required for Google projection.')
  }
  const timezone = text(series.timezone) || 'America/New_York'
  const eventUrl = `${casaBaseUrl.replace(/\/$/, '')}/calendar?event=${encodeURIComponent(event.id)}`
  const location = compactLines([event.location_name, event.address])
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ')
  const attendees = invitationAttendees
    .map((attendee) => ({
      email: text(attendee?.email),
      ...(text(attendee?.displayName) ? { displayName: text(attendee.displayName) } : {}),
    }))
    .filter((attendee) => attendee.email)
  const recurrence = Array.isArray(series.recurrence_lines)
    ? series.recurrence_lines.map(text).filter(Boolean)
    : []

  return {
    summary: text(event.title) || 'Untitled event',
    description: replaceCasaDetailsBlock(
      existingGoogleDescription,
      buildCasaDetailsLines(bundle, eventUrl),
    ),
    ...(location ? { location } : {}),
    ...googleTime(event, timezone),
    ...(recurrence.length ? { recurrence } : {}),
    ...(attendees.length ? { attendees } : {}),
    extendedProperties: {
      private: {
        casaSeriesId: series.id,
        casaEventId: event.id,
        casaRevision: String(series.revision),
        casaProjectionVersion: '2',
      },
    },
  }
}

export function projectionHashInput(payload) {
  const normalize = (value) => {
    if (Array.isArray(value)) return value.map(normalize)
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value)
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([key, child]) => [key, normalize(child)]),
      )
    }
    return value
  }
  return JSON.stringify(normalize(payload))
}
