import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sjiejymuuuqzqukyeagk.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function reconcile() {
  console.log('=== Starting Calendar & Routine Reconciliation ===\n')

  const nowIso = new Date().toISOString()
  const purgeAfterIso = new Date(Date.now() + 30 * 86400000).toISOString()

  // 1. Fetch Family Members
  const { data: members, error: memErr } = await supabase.from('family_members').select('*')
  if (memErr) throw memErr

  const liv = members.find((m) => m.name.toLowerCase() === 'liv')
  const emme = members.find((m) => m.name.toLowerCase() === 'emme')
  const owen = members.find((m) => m.name.toLowerCase() === 'owen')
  const jake = members.find((m) => m.name.toLowerCase() === 'jake')
  const giselle = members.find((m) => m.name.toLowerCase() === 'giselle')

  console.log('Found members:', { liv: liv?.id, emme: emme?.id, owen: owen?.id, jake: jake?.id, giselle: giselle?.id })

  // 2. Update Liv's Routine to Bak Middle School of the Arts (8:00 AM drop / 3:30 PM pickup, exceptions_only)
  if (liv) {
    const kelly = members.find((m) => m.name.toLowerCase() === 'kelly')
    console.log('\nReconciling Liv routine rules in member_availability_rules...')
    const livPayload = {
      type: 'school_routine',
      routineType: 'school',
      title: 'School Routine',
      venueName: 'Bak Middle School of the Arts',
      shortVenueName: 'Bak Middle School',
      venueAddress: '1725 Echo Lake Dr, West Palm Beach, FL',
      daysOfWeek: [1, 2, 3, 4, 5],
      startLocal: '08:00',
      endLocal: '15:30',
      dropoffDriverName: 'Kelly',
      dropoffDriverId: kelly?.id || null,
      pickupDriverName: 'Giselle',
      pickupDriverId: giselle?.id || null,
      dayOverrides: [],
      syncMode: 'exceptions_only',
      syncToGoogle: true,
      enabled: true,
    }

    // Delete existing rules for Liv and re-insert canonical Mon-Fri rules
    await supabase.from('member_availability_rules').delete().eq('member_id', liv.id)
    const livRules = [1, 2, 3, 4, 5].map((dow) => ({
      member_id: liv.id,
      day_of_week: dow,
      start_local: '08:00:00',
      end_local: '15:30:00',
      availability_type: 'unavailable',
      reason: JSON.stringify(livPayload),
      timezone: 'America/New_York',
      created_at: nowIso,
      updated_at: nowIso,
    }))
    const { error: livRuleErr } = await supabase.from('member_availability_rules').insert(livRules)
    if (livRuleErr) console.error('Error inserting Liv rules:', livRuleErr)
    else console.log('✓ Successfully updated Liv routine to Bak Middle School of the Arts (exceptions_only).')
  }

  // 3. Update Emme's Routine (PBP, Tuesday 7:00 AM Early Strings, Thursday 3:15 PM Late Strings)
  if (emme) {
    console.log('\nReconciling Emme routine rules in member_availability_rules...')
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
          dayOfWeek: 2, // Tuesday
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
          dayOfWeek: 4, // Thursday
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
      if (dow === 4) end = '15:00:00'
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
    const { error: emmeRuleErr } = await supabase.from('member_availability_rules').insert(emmeRules)
    if (emmeRuleErr) console.error('Error inserting Emme rules:', emmeRuleErr)
    else console.log('✓ Successfully updated Emme routine with Tuesday 7:00 AM & Thursday 3:15 PM exceptions.')
  }

  // 4. Update Owen's Routine (PBP, Standard 8:00 AM drop / 2:00 PM pickup, no exceptions)
  if (owen) {
    console.log('\nReconciling Owen routine rules in member_availability_rules...')
    const owenPayload = {
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
      dayOverrides: [],
      syncMode: 'exceptions_only',
      syncToGoogle: true,
      enabled: true,
    }

    await supabase.from('member_availability_rules').delete().eq('member_id', owen.id)
    const owenRules = [1, 2, 3, 4, 5].map((dow) => ({
      member_id: owen.id,
      day_of_week: dow,
      start_local: '08:00:00',
      end_local: '14:00:00',
      availability_type: 'unavailable',
      reason: JSON.stringify(owenPayload),
      timezone: 'America/New_York',
      created_at: nowIso,
      updated_at: nowIso,
    }))
    const { error: owenRuleErr } = await supabase.from('member_availability_rules').insert(owenRules)
    if (owenRuleErr) console.error('Error inserting Owen rules:', owenRuleErr)
    else console.log('✓ Successfully updated Owen routine to standard PBP schedule (exceptions_only).')
  }

  // 5. Reconcile Google Events in Supabase `events` table
  console.log('\nReconciling Google events in Supabase events table...')

  // A. Normalize Tuesday Aug 18 Beethoven Strings start time to 7:00 AM EDT (11:00 UTC)
  const { data: tueStringsRows } = await supabase
    .from('events')
    .select('id, title, start_time, end_time')
    .is('deleted_at', null)
    .ilike('title', '%Beethoven Strings%')
    .gte('start_time', '2026-08-18T00:00:00Z')
    .lte('start_time', '2026-08-18T23:59:59Z')

  if (tueStringsRows && tueStringsRows.length > 0) {
    for (const r of tueStringsRows) {
      console.log(`Updating Tuesday strings row ${r.id} to start at 7:00 AM EDT (11:00:00Z)...`)
      await supabase.from('events').update({
        start_time: '2026-08-18T11:00:00.000Z',
        end_time: '2026-08-18T11:15:00.000Z',
        updated_at: nowIso,
      }).eq('id', r.id)
    }
    console.log('✓ Tuesday Beethoven Strings updated to 7:00 AM start.')
  }

  // B. Thursday Late Strings deduplication: Keep single canonical row, soft-delete duplicates
  const { data: thuStringsRows } = await supabase
    .from('events')
    .select('id, title, start_time, google_event_id')
    .is('deleted_at', null)
    .ilike('title', '%Strings%')
    .gte('start_time', '2026-08-20T00:00:00Z')
    .lte('start_time', '2026-08-20T23:59:59Z')

  console.log(`Found ${thuStringsRows?.length || 0} active Strings rows on Thursday Aug 20.`)
  if (thuStringsRows && thuStringsRows.length > 1) {
    // Keep the first one with a google_event_id, soft-delete the others
    const keep = thuStringsRows.find((r) => r.google_event_id) || thuStringsRows[0]
    const deleteIds = thuStringsRows.filter((r) => r.id !== keep.id).map((r) => r.id)

    console.log(`Keeping canonical row ${keep.id} (${keep.title}), soft-deleting ${deleteIds.length} duplicate(s)...`)
    await supabase.from('events').update({
      deleted_at: nowIso,
      purge_after: purgeAfterIso,
      status: 'cancelled',
      updated_at: nowIso,
    }).in('id', deleteIds)
    console.log('✓ Thursday duplicate Strings rows soft-deleted.')
  }

  console.log('\n=== Calendar & Routine Reconciliation Complete! ===')
}

reconcile().catch(console.error)
