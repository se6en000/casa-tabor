import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sjiejymuuuqzqukyeagk.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

export function deriveEventOrigination(event) {
  if (!event) return 'casa'
  if (event.source_type) return event.source_type

  const title = (event.title || '').toLowerCase()
  const desc = (event.description || '').toLowerCase()
  const enrichedBy = event.enrichment?.enriched_by || ''

  // 1. Routine: School/camp/work routines, strings orchestra exceptions, drop-off/pickup
  if (
    event.id?.startsWith('routine-') ||
    enrichedBy === 'family_routines' ||
    title.includes('beethoven strings') ||
    title.includes('strings @ pbp') ||
    title.includes('late strings') ||
    title.includes('early strings') ||
    (title.includes('drop off') && (title.includes('palm beach') || title.includes('bak') || title.includes('tri-rail') || title.includes('school'))) ||
    (title.includes('pick up') && (title.includes('palm beach') || title.includes('bak') || title.includes('tri-rail') || title.includes('school')))
  ) {
    return 'routine'
  }

  // 2. Gmail: Flights, shipments, orders, email extractions
  if (
    event.flight_number ||
    event.confirmation_number ||
    desc.includes('from: ') ||
    desc.includes('order confirmation') ||
    title.includes('ordered:')
  ) {
    return 'gmail'
  }

  // 3. Google: Imported external Google Calendar entries
  if (event.raw_google_json || event.google_ical_uid) {
    return 'google'
  }

  // 4. Casa: Manually created in Casa (e.g. Drop off Election Ballots)
  return 'casa'
}

async function testClassification() {
  const { data: rows } = await supabase
    .from('events')
    .select('*')
    .gte('start_time', '2026-08-18T00:00:00Z')
    .lte('start_time', '2026-08-25T23:59:59Z')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('start_time')

  console.log('=== Event Origination Classification ===\n')
  for (const r of rows || []) {
    const origin = deriveEventOrigination(r)
    console.log(`[${origin.toUpperCase().padEnd(7)}] ${r.title}`)
  }
}

testClassification().catch(console.error)
