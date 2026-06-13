export const ENRICHMENT_FIELDS = [
  'category',
  'confidence',
  'what_to_bring',
  'outfit_suggestion',
  'parking_notes',
  'contact_name',
  'contact_phone',
  'cost_estimate',
  'dietary_notes',
  'meal_impact',
  'prep_notes',
  'departure_time',
  'drive_time_mins',
  'route_summary',
  'weather_at_event',
  'weather_summary',
]

const IMPACT_MAP = {
  title: ['category', 'what_to_bring', 'outfit_suggestion', 'contact_name', 'contact_phone', 'cost_estimate', 'dietary_notes', 'meal_impact', 'prep_notes'],
  description: ['category', 'what_to_bring', 'outfit_suggestion', 'contact_name', 'contact_phone', 'cost_estimate', 'dietary_notes', 'meal_impact', 'prep_notes'],
  start_time: ['departure_time', 'drive_time_mins', 'route_summary', 'weather_at_event', 'weather_summary', 'meal_impact', 'prep_notes'],
  end_time: ['departure_time', 'drive_time_mins', 'route_summary', 'weather_at_event', 'weather_summary', 'meal_impact', 'prep_notes'],
  all_day: ['departure_time', 'drive_time_mins', 'route_summary', 'weather_at_event', 'weather_summary', 'meal_impact', 'prep_notes'],
  location_name: ['parking_notes', 'contact_name', 'contact_phone', 'cost_estimate', 'departure_time', 'drive_time_mins', 'route_summary', 'weather_at_event', 'weather_summary', 'prep_notes'],
  address: ['parking_notes', 'contact_name', 'contact_phone', 'cost_estimate', 'departure_time', 'drive_time_mins', 'route_summary', 'weather_at_event', 'weather_summary', 'prep_notes'],
  members: ['what_to_bring', 'outfit_suggestion', 'dietary_notes', 'meal_impact', 'prep_notes'],
  category: ['category', 'what_to_bring', 'outfit_suggestion', 'parking_notes', 'contact_name', 'contact_phone', 'cost_estimate', 'dietary_notes', 'meal_impact', 'prep_notes'],
}

export function normalizeEnrichmentFieldList(values) {
  if (!Array.isArray(values)) return []
  return [...new Set(values.map((v) => String(v).trim()).filter((v) => ENRICHMENT_FIELDS.includes(v)))]
}

export function deriveImpactedEnrichmentFields({
  changedEventFields = [],
  changedEnrichmentFields = [],
  membersChanged = false,
  lockedFields = [],
}) {
  const impacted = new Set()
  const addFromKey = (key) => (IMPACT_MAP[key] ?? []).forEach((field) => impacted.add(field))

  changedEventFields.forEach(addFromKey)
  changedEnrichmentFields.forEach((field) => {
    if (field === 'category') addFromKey('category')
    else if (ENRICHMENT_FIELDS.includes(field)) impacted.add(field)
  })
  if (membersChanged) addFromKey('members')

  const locked = new Set(normalizeEnrichmentFieldList(lockedFields))
  return [...impacted].filter((field) => !locked.has(field))
}

export function hasSmartEnrichmentInputs({
  changedEventFields = [],
  changedEnrichmentFields = [],
  membersChanged = false,
}) {
  return changedEventFields.length > 0 || changedEnrichmentFields.length > 0 || membersChanged
}
