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

function titleCase(value) {
  return text(value)
    .replaceAll('_', ' ')
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function placeLabel(place) {
  if (!place || typeof place !== 'object') return ''
  const name = text(place.name)
  const address = text(place.address)
  return name && address && name !== address ? `${name} (${address})` : name || address
}

function transportationLines(plan) {
  if (!plan || !Array.isArray(plan.legs)) return []
  return plan.legs.flatMap((leg, index) => {
    const origin = placeLabel(leg?.origin)
    const destination = placeLabel(leg?.destination)
    if (!origin || !destination) return []
    const details = compactLines([
      text(leg?.driverName) ? `Driver: ${text(leg.driverName)}` : '',
      Array.isArray(leg?.passengers) && leg.passengers.length
        ? `Passengers: ${leg.passengers.map(text).filter(Boolean).join(', ')}`
        : '',
      text(leg?.timing) && text(leg?.time)
        ? `${titleCase(leg.timing)}: ${text(leg.time)}`
        : '',
    ])
    const purpose = titleCase(leg?.purpose) || 'Drive'
    return [`Transportation ${index + 1}: ${purpose} | ${origin} -> ${destination}${details.length ? ` | ${details.join(' | ')}` : ''}`]
  })
}

export function locationProjectionBlocked(bundle = {}) {
  return bundle?.plan_override?.location_projection_blocked === true
}

export function googleLocationForEvent(event = {}, bundle = {}) {
  if (locationProjectionBlocked(bundle)) return undefined
  const location = compactLines([event.location_name, event.address])
    .filter((value, index, all) => all.indexOf(value) === index)
    .join(', ')
  return location || undefined
}

function planningLines(bundle) {
  const planning = bundle.plan_override ?? bundle.planning ?? null
  if (!planning || typeof planning !== 'object') return []
  const flags = compactLines([
    text(planning.mode_override) ? `Mode: ${titleCase(planning.mode_override)}` : '',
    planning.waits === true ? 'Driver waits' : planning.waits === false ? 'Driver does not wait' : '',
    planning.two_driver_confirmed === true ? 'Two-driver plan confirmed' : '',
  ])
  const driverNames = planning.driver_names && typeof planning.driver_names === 'object'
    ? Object.entries(planning.driver_names)
        .sort(([left], [right]) => Number(left) - Number(right))
        .map(([leg, name]) => `Leg ${Number(leg) + 1}: ${text(name)}`)
        .filter((line) => !line.endsWith(': '))
    : []
  return [
    ...(flags.length ? [`Driving plan: ${flags.join('; ')}`] : []),
    ...(driverNames.length ? [`Driver assignments: ${driverNames.join('; ')}`] : []),
  ]
}

export function buildCasaDetailsLines(bundle = {}, eventUrl = '') {
  const members = Array.isArray(bundle.members)
    ? bundle.members.map((member) => text(member?.name ?? member?.family_member?.name)).filter(Boolean)
    : []
  const enrichment = bundle.enrichment ?? {}
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
    ...(!locationProjectionBlocked(bundle) ? transportationLines(bundle.transportation_plan) : []),
    ...planningLines(bundle),
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
    ? `${withoutCasa.slice(0, Math.max(0, preservedBudget - 1)).trimEnd()}...`
    : withoutCasa
  const header = preserved ? `${preserved}\n\n` : ''
  const available = Math.max(0, contentBudget - header.length)
  let details = compactLines(casaLines).join('\n')
  if (details.length > available) {
    details = available > 3 ? `${details.slice(0, available - 3).trimEnd()}...` : ''
  }
  return `${header}${CASA_BLOCK_START}\n${details}\n${CASA_BLOCK_END}`
}

export function buildGoogleEventDescription({
  bundle = {},
  existingDescription = '',
  eventId,
  casaBaseUrl = 'https://casa-tabor.vercel.app',
}) {
  const eventUrl = eventId
    ? `${casaBaseUrl.replace(/\/$/, '')}/calendar?event=${encodeURIComponent(eventId)}`
    : ''
  return replaceCasaDetailsBlock(
    existingDescription,
    buildCasaDetailsLines(bundle, eventUrl),
  )
}
