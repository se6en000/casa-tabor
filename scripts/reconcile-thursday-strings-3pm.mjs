import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sjiejymuuuqzqukyeagk.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function reconcileThursday3pm() {
  console.log('=== Reconciling Thursday Strings Pickup to 3:00 PM (15:00) ===\n')

  const nowIso = new Date().toISOString()
  const purgeAfterIso = new Date(Date.now() + 30 * 86400000).toISOString()

  // 1. Update Emme routine rules in member_availability_rules (Thursday endLocal: 15:00)
  const { data: members } = await supabase.from('family_members').select('*')
  const emme = members.find((m) => m.name.toLowerCase() === 'emme')
  const jake = members.find((m) => m.name.toLowerCase() === 'jake')
  const giselle = members.find((m) => m.name.toLowerCase() === 'giselle')

  if (emme) {
    console.log('Updating Emme routine in member_availability_rules...')
    const emmePayload = {
      type: 'school_routine',
      routineType: 'school',
      title: 'School Routine',
      venueName: 'Palm Beach Public Elementary School',
      venueAddress: '239 Cocoanut Row, Palm Beach, FL, 33480',
      daysOfWeek: [1, 2, 3, 4, 5],
      startLocal: '08:00',
      endLocal: '14:00',
      dropoffDriverName: 'Jake',
      dropoffDriverId: jake?.id || null,
      pickupDriverName: 'Giselle',
      pickupDriverId: giselle?.id || null,
      dayOverrides: [
        {
          dayOfWeek: 2, // Tuesday Early Strings
          startLocal: '07:00',
          endLocal: '14:00',
          dropoffDriverName: 'Jake',
          dropoffDriverId: jake?.id || null,
          pickupDriverName: 'Giselle',
          pickupDriverId: giselle?.id || null,
          enabled: true,
          label: 'Beethoven Strings',
        },
        {
          dayOfWeek: 4, // Thursday Late Strings at 3:00 PM (15:00)
          startLocal: '08:00',
          endLocal: '15:00',
          dropoffDriverName: 'Jake',
          dropoffDriverId: jake?.id || null,
          pickupDriverName: 'Giselle',
          pickupDriverId: giselle?.id || null,
          enabled: true,
          label: 'Late Strings Pickup',
        },
      ],
      syncMode: 'exceptions_only',
      syncToGoogle: true,
      enabled: true,
    }

    await supabase.from('member_availability_rules').delete().eq('member_id', emme.id)
    const emmeRules = [1, 2, 3, 4, 5].map((dow) => {
      let start = '08:00:00'
      let end = '14:00:00'
      if (dow === 2) start = '07:00:00'
      if (dow === 4) end = '15:00:00' // 3:00 PM
      return {
        member_id: emme.id,
        day_of_week: dow,
        start_local: start,
        end_local: end,
        availability_type: 'unavailable',
        reason: JSON.stringify(emmePayload),
        timezone: 'America/New_York',
        created_at: nowIso,
        updated_at: nowIso,
      }
    })
    const { error } = await supabase.from('member_availability_rules').insert(emmeRules)
    if (error) console.error('Error updating Emme rules:', error)
    else console.log('✓ Successfully set Emme Thursday exception to 3:00 PM (15:00).')
  }

  // 2. Reconcile Thursday Aug 20 row in `events`
  console.log('\nReconciling Thursday Aug 20 events in Supabase...')

  // Fetch all Thursday Aug 20 strings rows
  const { data: thuRows } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, google_event_id, status, deleted_at')
    .gte('start_time', '2026-08-20T00:00:00Z')
    .lte('start_time', '2026-08-20T23:59:59Z')
    .ilike('title', '%Strings%')

  console.log('Thursday Strings rows:', thuRows)

  // Soft delete any 3:15 PM row (19:15 UTC)
  const rows315 = (thuRows || []).filter((r) => r.start_time.includes('19:15'))
  if (rows315.length > 0) {
    const ids = rows315.map((r) => r.id)
    console.log('Soft-deleting 3:15 PM row(s):', ids)
    await supabase.from('events').update({
      deleted_at: nowIso,
      purge_after: purgeAfterIso,
      status: 'cancelled',
      updated_at: nowIso,
    }).in('id', ids)
  }

  // Ensure canonical 3:00 PM row (19:00 UTC) is active and confirmed
  let row300 = (thuRows || []).find((r) => r.start_time.includes('19:00'))

  if (row300) {
    console.log('Restoring / updating canonical 3:00 PM row:', row300.id)
    await supabase.from('events').update({
      title: 'Pick up Emme @ Palm Beach Public Elementary School · Late Strings Program',
      start_time: '2026-08-20T19:00:00.000Z', // 3:00 PM EDT
      end_time: '2026-08-20T19:15:00.000Z',
      location_name: 'Palm Beach Public Elementary School',
      address: '239 Cocoanut Row, Palm Beach, FL, 33480',
      status: 'confirmed',
      deleted_at: null,
      purge_after: null,
      updated_at: nowIso,
    }).eq('id', row300.id)

    // Ensure enrichment has 10 min drive and 2:50 PM departure time (18:50 UTC)
    const { data: enr } = await supabase.from('event_enrichments').select('id').eq('event_id', row300.id)
    if (enr && enr.length > 0) {
      await supabase.from('event_enrichments').update({
        drive_time_mins: 10,
        departure_time: '2026-08-20T18:50:00.000Z', // 2:50 PM EDT
        route_summary: '10 min drive',
        category: 'School',
        updated_at: nowIso,
      }).eq('id', enr[0].id)
    } else {
      await supabase.from('event_enrichments').insert({
        id: crypto.randomUUID(),
        event_id: row300.id,
        drive_time_mins: 10,
        departure_time: '2026-08-20T18:50:00.000Z',
        route_summary: '10 min drive',
        category: 'School',
        category_locked: true,
        confidence: 'high',
        enriched_by: 'family_routines',
        created_at: nowIso,
        updated_at: nowIso,
      })
    }
    console.log('✓ Canonical Thursday 3:00 PM event configured with 2:50 PM departure.')
  } else {
    // If no row exists at 19:00, update existing or create one
    console.log('Creating canonical 3:00 PM row for Thursday...')
    const newId = crypto.randomUUID()
    await supabase.from('events').insert({
      id: newId,
      title: 'Pick up Emme @ Palm Beach Public Elementary School · Late Strings Program',
      start_time: '2026-08-20T19:00:00.000Z',
      end_time: '2026-08-20T19:15:00.000Z',
      all_day: false,
      event_type: 'event',
      location_name: 'Palm Beach Public Elementary School',
      address: '239 Cocoanut Row, Palm Beach, FL, 33480',
      status: 'confirmed',
      record_kind: 'single',
      is_enriched: true,
      created_at: nowIso,
      updated_at: nowIso,
    })
    await supabase.from('event_enrichments').insert({
      id: crypto.randomUUID(),
      event_id: newId,
      drive_time_mins: 10,
      departure_time: '2026-08-20T18:50:00.000Z',
      route_summary: '10 min drive',
      category: 'School',
      category_locked: true,
      confidence: 'high',
      enriched_by: 'family_routines',
      created_at: nowIso,
      updated_at: nowIso,
    })
    console.log('✓ Created canonical Thursday 3:00 PM event.')
  }

  console.log('\n=== Thursday Strings 3:00 PM Reconciliation Complete ===')
}

reconcileThursday3pm().catch(console.error)
