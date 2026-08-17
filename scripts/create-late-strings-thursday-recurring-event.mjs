#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

function loadEnv() {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')]
      }),
  )
}

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function main() {
  console.log('🚀 Creating recurring Thursday Late Strings pickup event for Emme...')

  const { data: members, error: memFetchErr } = await supabase.from('family_members').select('id, name, role')
  if (memFetchErr) {
    console.error('Failed to fetch family members:', memFetchErr)
    process.exit(1)
  }

  const giselle = members.find((m) => m.name.toLowerCase() === 'giselle')
  const emme = members.find((m) => m.name.toLowerCase() === 'emme')

  if (!giselle || !emme) {
    console.error('Could not find Giselle or Emme in family members:', members)
    process.exit(1)
  }

  const eventId = crypto.randomUUID()
  const title = 'Pick up Emme @ Palm Beach Public Elementary School · Late Strings Program'
  const startTime = '2026-08-20T19:15:00.000Z' // 3:15 PM EDT (UTC-4)
  const endTime = '2026-08-20T19:30:00.000Z' // 3:30 PM EDT (UTC-4)
  const departureTime = '2026-08-20T19:00:00.000Z' // 3:00 PM EDT (10 min drive + 5 min buffer)
  const locationName = 'Palm Beach Public Elementary School'
  const address = '239 Cocoanut Row, Palm Beach, FL, 33480'
  const rrule = 'FREQ=WEEKLY;BYDAY=TH;UNTIL=20270528T235959Z'

  // 1. Insert into events
  const { data: event, error: evErr } = await supabase
    .from('events')
    .insert({
      id: eventId,
      title,
      description: 'Afternoon school pickup for Emme. Note: Late Strings Program. Dismissal at 3:15 PM. Leave home by 3:00 PM.',
      start_time: startTime,
      end_time: endTime,
      all_day: false,
      event_type: 'event',
      location_name: locationName,
      address,
      lat: 26.706751,
      lng: -80.0404812,
      status: 'confirmed',
      is_enriched: true,
      is_exception: true,
      rrule,
      record_kind: 'single',
      source_member_id: giselle.id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (evErr) {
    console.error('Failed to create event:', evErr)
    process.exit(1)
  }

  console.log('✅ Created event record:', event.id, event.title)

  // 2. Insert event_members
  const { error: memberErr } = await supabase.from('event_members').insert([
    {
      event_id: eventId,
      family_member_id: giselle.id,
      role: 'driver',
      rsvp_status: 'accepted',
    },
    {
      event_id: eventId,
      family_member_id: emme.id,
      role: 'passenger',
      rsvp_status: 'accepted',
    },
  ])

  if (memberErr) {
    console.warn('Warning: Failed to insert event members:', memberErr)
  } else {
    console.log('✅ Assigned event members: Giselle (driver) and Emme (passenger)')
  }

  // 3. Insert event_enrichments
  const { error: enrichErr } = await supabase.from('event_enrichments').insert({
    id: crypto.randomUUID(),
    event_id: eventId,
    category: 'school',
    category_locked: true,
    confidence: 'high',
    drive_time_mins: 10,
    departure_time: departureTime,
    route_summary: '10 min drive • 4.2 mi',
    weather_summary: 'Clear sky, 85°F, 5% rain chance',
    weather_at_event: 'Clear sky, 85°F, 5% rain chance',
    what_to_bring: ['Violin / Strings instrument', 'Backpack'],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })

  if (enrichErr) {
    console.warn('Warning: Failed to insert event enrichment:', enrichErr)
  } else {
    console.log('✅ Inserted event enrichment (10 min drive, leave 3:00 PM, category School)')
  }

  // 4. Insert transportation plan override
  const homeAddress = '3209 Washington Road, West Palm Beach, FL, 33405-1646'
  const transportationPlan = {
    mode: 'drive',
    waitOnSite: false,
    driverName: giselle.name,
    legs: [
      {
        id: crypto.randomUUID(),
        sequence: 1,
        purpose: 'pickup',
        driverName: giselle.name,
        driverId: giselle.id,
        passengers: ['Emme'],
        timing: 'depart_at',
        time: '15:15',
        origin: { name: locationName, address, kind: 'event' },
        destination: { name: 'Home', address: homeAddress, kind: 'home' },
        driveMinutes: 10,
        distanceMiles: 4.2,
      },
    ],
  }

  const { error: planErr } = await supabase.from('event_plan_overrides').upsert({
    event_id: eventId,
    verified: true,
    waits: false,
    mode_override: 'pickup',
    two_driver_confirmed: false,
    transportation_plan: transportationPlan,
    location_signature: `${locationName}|${address}`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'event_id' })

  if (planErr) {
    console.warn('Warning: Failed to insert plan override:', planErr)
  } else {
    console.log('✅ Inserted transportation plan override')
  }

  // 5. Trigger Google Calendar sync
  console.log('🔄 Triggering Google Calendar sync for event...')
  try {
    const syncRes = await supabase.functions.invoke('sync-event-to-google', {
      body: {
        event_id: eventId,
        enqueue_on_failure: true,
      },
    })
    console.log('Google sync response:', syncRes.error ? `Error: ${syncRes.error.message}` : syncRes.data)
  } catch (err) {
    console.warn('Google sync invocation error (will retry in background):', err)
  }

  console.log('🎉 Done! Thursday Late Strings event created and queued for sync.')
}

main()
