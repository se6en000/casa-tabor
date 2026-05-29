/** Fields relevant per event category — drives both read display and edit sheet */

export type EnrichmentFieldKey =
  | 'what_to_bring'
  | 'outfit_suggestion'
  | 'parking_notes'
  | 'contact_name'
  | 'contact_phone'
  | 'cost_estimate'
  | 'dietary_notes'
  | 'meal_impact'
  | 'prep_notes'

export const FIELD_CONFIG: Record<EnrichmentFieldKey, {
  label: string
  placeholder: string
  multiline?: boolean
  type?: string
}> = {
  what_to_bring:     { label: 'What to Bring',  placeholder: 'One item per line\ne.g. Shin guards\nWater bottle', multiline: true },
  outfit_suggestion: { label: 'What to Wear',   placeholder: 'e.g. Soccer uniform, cleats' },
  parking_notes:     { label: 'Parking',         placeholder: 'e.g. Street parking on Oak Ave' },
  contact_name:      { label: 'Contact Name',    placeholder: 'e.g. Coach Glen / AC Repair Co.' },
  contact_phone:     { label: 'Contact Phone',   placeholder: 'e.g. (555) 123-4567', type: 'tel' },
  cost_estimate:     { label: 'Cost Estimate',   placeholder: 'e.g. $50–80' },
  dietary_notes:     { label: 'Dietary Notes',   placeholder: 'e.g. Nut allergy, bring snacks' },
  meal_impact:       { label: 'Meal Impact',     placeholder: 'e.g. Eat before 5pm, late dinner' },
  prep_notes:        { label: 'Notes',           placeholder: 'Any prep notes or reminders…', multiline: true },
}

export const CATEGORY_FIELDS: Record<string, EnrichmentFieldKey[]> = {
  sports:           ['what_to_bring', 'outfit_suggestion', 'parking_notes', 'contact_name', 'contact_phone', 'prep_notes'],
  school:           ['what_to_bring', 'contact_name', 'contact_phone', 'parking_notes', 'prep_notes'],
  medical:          ['contact_name', 'contact_phone', 'cost_estimate', 'what_to_bring', 'dietary_notes', 'prep_notes'],
  appointment:      ['contact_name', 'contact_phone', 'cost_estimate', 'parking_notes', 'prep_notes'],
  home_maintenance: ['contact_name', 'contact_phone', 'cost_estimate', 'prep_notes'],
  dining:           ['dietary_notes', 'cost_estimate', 'outfit_suggestion', 'contact_name', 'contact_phone', 'prep_notes'],
  travel:           ['what_to_bring', 'cost_estimate', 'parking_notes', 'prep_notes'],
  social:           ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'cost_estimate', 'contact_name', 'contact_phone', 'prep_notes'],
  birthday:         ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'cost_estimate', 'contact_name', 'contact_phone', 'prep_notes'],
  work:             ['contact_name', 'contact_phone', 'what_to_bring', 'parking_notes', 'prep_notes'],
  errand:           ['contact_name', 'contact_phone', 'cost_estimate', 'prep_notes'],
  holiday:          ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'meal_impact', 'prep_notes'],
  other:            ['outfit_suggestion', 'what_to_bring', 'dietary_notes', 'meal_impact', 'contact_name', 'contact_phone', 'cost_estimate', 'parking_notes', 'prep_notes'],
}

export function getFieldsForCategory(category: string | null | undefined): EnrichmentFieldKey[] {
  if (!category) return CATEGORY_FIELDS.other
  return CATEGORY_FIELDS[category] ?? CATEGORY_FIELDS.other
}

export const CATEGORY_LABEL: Record<string, string> = {
  sports: 'Sports',
  school: 'School',
  medical: 'Medical',
  appointment: 'Appointment',
  home_maintenance: 'Home Maintenance',
  dining: 'Dining',
  travel: 'Travel',
  social: 'Social',
  birthday: 'Birthday',
  work: 'Work',
  errand: 'Errand',
  holiday: 'Holiday',
  other: 'Other',
}
