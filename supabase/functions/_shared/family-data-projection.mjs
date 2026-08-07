import { redactFamilyEvidenceText } from './family-email-evidence.mjs'

function compact(values) {
  return values
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
}

function unique(values) {
  return [...new Set(compact(values))]
}

function safeText(lines) {
  return redactFamilyEvidenceText(compact(lines).join('\n')).slice(0, 16000)
}

function isoAfter(value, days) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString()
}

function eventProjection(sourceType, row) {
  if (!row?.id || row.status === 'cancelled') return null
  const enrichment = row.event_enrichments?.[0] ?? row.enrichment ?? {}
  const category = enrichment.category ?? (sourceType === 'reminder' ? 'reminder' : 'calendar')
  const memberNames = (row.event_members ?? []).map((member) =>
    member.family_members?.name ?? member.family_member?.name ?? member.name
  )
  const checklist = (row.event_checklist_items ?? row.checklist ?? [])
    .filter((item) => !item.checked)
    .map((item) => item.label)
  const actions = (row.event_action_items ?? row.actions ?? [])
    .filter((item) => !item.completed)
    .map((item) => item.title ?? item.description)
  const description = category === 'medical' ? null : row.description

  return {
    title: redactFamilyEvidenceText(row.title || (sourceType === 'reminder' ? 'Reminder' : 'Calendar event')).slice(0, 300),
    redacted_text: safeText([
      `Type: ${sourceType}`,
      `Title: ${row.title ?? ''}`,
      row.start_time ? `Starts: ${row.start_time}` : '',
      row.end_time ? `Ends: ${row.end_time}` : '',
      row.location_name ? `Location: ${row.location_name}` : '',
      row.address ? `Address: ${row.address}` : '',
      memberNames.length ? `Family: ${memberNames.join(', ')}` : '',
      description ? `Details: ${description}` : '',
      enrichment.prep_notes ? `Preparation: ${enrichment.prep_notes}` : '',
      checklist.length ? `Checklist: ${checklist.join('; ')}` : '',
      actions.length ? `Open actions: ${actions.join('; ')}` : '',
    ]),
    category,
    entity_refs: unique(memberNames),
    occurred_at: row.updated_at ?? row.created_at ?? row.start_time ?? null,
    effective_at: row.start_time ?? null,
    expires_at: null,
    status: 'active',
    confidence: 1,
    privacy_class: 'standard',
    metadata: {
      start_time: row.start_time ?? null,
      end_time: row.end_time ?? null,
      event_type: sourceType,
    },
  }
}

export function buildFamilyDataProjection(sourceType, row) {
  switch (sourceType) {
    case 'event':
    case 'reminder':
      return eventProjection(sourceType, row)
    case 'prep':
      if (!row?.id || row.dismissed) return null
      return {
        title: redactFamilyEvidenceText(row.event_title || row.description || 'Family preparation').slice(0, 300),
        redacted_text: safeText([
          row.event_title ? `For: ${row.event_title}` : '',
          row.description ? `Action: ${row.description}` : '',
          row.due_by ? `Due: ${row.due_by}` : '',
        ]),
        category: row.type ?? 'prep',
        entity_refs: [],
        occurred_at: row.created_at ?? null,
        effective_at: row.event_date ?? row.due_by ?? null,
        expires_at: row.due_by ?? null,
        status: 'active',
        confidence: Number(row.source_confidence ?? 1),
        privacy_class: 'standard',
        metadata: { priority: row.priority ?? null, event_id: row.event_id ?? null },
      }
    case 'activity':
      if (!row?.id) return null
      return {
        title: redactFamilyEvidenceText(row.title || 'Family activity').slice(0, 300),
        redacted_text: safeText([row.title, row.body]),
        category: row.type ?? 'activity',
        entity_refs: [],
        occurred_at: row.created_at ?? null,
        effective_at: row.created_at ?? null,
        expires_at: isoAfter(row.created_at, 30),
        status: 'active',
        confidence: 1,
        privacy_class: 'standard',
        metadata: { event_id: row.event_id ?? null, source: row.source ?? null },
      }
    case 'person':
      if (!row?.id || row.confirmed !== true || row.dismissed_at) return null
      return {
        title: redactFamilyEvidenceText(row.name || 'Saved person').slice(0, 300),
        redacted_text: safeText([
          `Person: ${row.name ?? ''}`,
          row.relationship ? `Role: ${row.relationship}` : '',
          row.aliases?.length ? `Also known as: ${row.aliases.join(', ')}` : '',
        ]),
        category: 'person',
        entity_refs: unique([row.name, ...(row.aliases ?? [])]),
        occurred_at: row.updated_at ?? row.created_at ?? null,
        effective_at: row.updated_at ?? row.created_at ?? null,
        expires_at: null,
        status: 'active',
        confidence: 1,
        privacy_class: 'standard',
        metadata: { primary_place_id: row.primary_place_id ?? null },
      }
    case 'place':
      if (!row?.id || row.confirmed !== true || row.dismissed_at) return null
      return {
        title: redactFamilyEvidenceText(row.name || 'Saved place').slice(0, 300),
        redacted_text: safeText([
          `Place: ${row.name ?? ''}`,
          row.aliases?.length ? `Also known as: ${row.aliases.join(', ')}` : '',
          row.address ? `Address: ${row.address}` : '',
          compact([row.city, row.state, row.zip]).length
            ? `City: ${compact([row.city, row.state, row.zip]).join(', ')}`
            : '',
        ]),
        category: row.category ?? 'place',
        entity_refs: unique([row.name, ...(row.aliases ?? [])]),
        occurred_at: row.updated_at ?? row.created_at ?? null,
        effective_at: row.updated_at ?? row.created_at ?? null,
        expires_at: null,
        status: 'active',
        confidence: 1,
        privacy_class: 'standard',
        metadata: {},
      }
    case 'relationship': {
      if (!row?.id || row.confirmed !== true || row.dismissed_at) return null
      const memberName = row.family_members?.name ?? row.family_member?.name
      const contactName = row.saved_contacts?.name ?? row.contact?.name
      const placeName = row.saved_places?.name ?? row.place?.name
      const names = unique([memberName, contactName, placeName])
      return {
        title: redactFamilyEvidenceText(names.join(' and ') || 'Confirmed family relationship').slice(0, 300),
        redacted_text: safeText([
          memberName && contactName ? `${memberName}'s ${row.relationship}: ${contactName}` : '',
          contactName && placeName ? `${contactName} is reached at ${placeName}` : '',
        ]),
        category: 'relationship',
        entity_refs: names,
        occurred_at: row.updated_at ?? row.created_at ?? null,
        effective_at: row.updated_at ?? row.created_at ?? null,
        expires_at: null,
        status: 'active',
        confidence: Number(row.confidence ?? 1),
        privacy_class: 'standard',
        metadata: {},
      }
    }
    case 'memory':
      if (!row?.id || row.status !== 'active') return null
      return {
        title: redactFamilyEvidenceText(row.title || 'Family memory').slice(0, 300),
        redacted_text: safeText([row.title, row.details]),
        category: row.category ?? 'memory',
        entity_refs: [],
        occurred_at: row.observed_at ?? row.updated_at ?? row.created_at ?? null,
        effective_at: row.observed_at ?? null,
        expires_at: null,
        status: 'active',
        confidence: Number(row.confidence ?? 0.8),
        privacy_class: 'standard',
        metadata: { source: row.source ?? null },
      }
    default:
      return null
  }
}
