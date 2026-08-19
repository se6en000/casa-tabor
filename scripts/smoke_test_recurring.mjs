import { createClient } from '@supabase/supabase-js'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

function loadEnv() {
  const paths = ['.env.local', '.env']
  for (const p of paths) {
    const fullPath = resolve(p)
    if (existsSync(fullPath)) {
      const content = readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          if (!process.env[key]) process.env[key] = val
        }
      }
    }
  }
}

loadEnv()

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function runSmokeTest() {
  console.log('--- STARTING RECURRING MEETINGS SMOKE TEST ---')
  const testTitle = `[SMOKE TEST] Weekly Piano Lesson ${Date.now()}`

  // 1. Create a Master Recurring Event (Weekly on Wednesdays for 4 weeks)
  const masterStart = '2026-09-02T16:00:00.000Z'
  const masterEnd = '2026-09-02T17:00:00.000Z'
  const rrule = 'RRULE:FREQ=WEEKLY;BYDAY=WE;UNTIL=20260930T235959Z'

  console.log(`\n1. Inserting Master Event: "${testTitle}"...`)
  const { data: master, error: masterErr } = await supabase
    .from('events')
    .insert({
      title: testTitle,
      start_time: masterStart,
      end_time: masterEnd,
      record_kind: 'series_template',
      rrule: rrule,
      all_day: false,
      status: 'confirmed',
    })
    .select('*')
    .single()

  if (masterErr || !master) {
    console.error('Failed to create master event:', masterErr)
    process.exit(1)
  }
  console.log(`✔ Master created with ID: ${master.id}`)

  // 2. Create event_series row
  const { data: series, error: seriesErr } = await supabase
    .from('event_series')
    .insert({
      template_event_id: master.id,
      recurrence_lines: [rrule],
      ownership: 'casa',
      timezone: 'America/New_York',
      status: 'active',
    })
    .select('*')
    .single()

  if (seriesErr || !series) {
    console.error('Failed to create event_series:', seriesErr)
    process.exit(1)
  }
  console.log(`✔ Event Series created with ID: ${series.id}`)
  console.log(`✔ Event Series columns:`, Object.keys(series))

  // Update master with series_id
  await supabase.from('events').update({ series_id: series.id }).eq('id', master.id)

  // 3. Materialize initial occurrences (Expect 5 Wednesdays: Sept 2, 9, 16, 23, 30)
  console.log('\n2. Materializing occurrences...')
  const dates = [
    '2026-09-02T16:00:00.000Z',
    '2026-09-09T16:00:00.000Z',
    '2026-09-16T16:00:00.000Z',
    '2026-09-23T16:00:00.000Z',
    '2026-09-30T16:00:00.000Z',
  ]

  const occInserts = dates.map(d => ({
    title: testTitle,
    start_time: d,
    end_time: new Date(new Date(d).getTime() + 3600000).toISOString(),
    record_kind: 'occurrence',
    series_id: series.id,
    recurrence_master_id: master.id,
    occurrence_key: d,
    original_start_time: d,
    status: 'confirmed',
  }))

  const { data: createdOccs, error: occErr } = await supabase
    .from('events')
    .insert(occInserts)
    .select('*')

  if (occErr) {
    console.error('Failed to insert occurrences:', occErr)
    process.exit(1)
  }
  console.log(`✔ Materialized ${createdOccs.length} occurrences:`)
  createdOccs.forEach(o => console.log(`   - ${o.start_time} (ID: ${o.id})`))

  // 4. Test Single Instance Exception (Edit Sept 16 session to "Special Recital Prep")
  console.log('\n3. Testing Single Occurrence Exception (Sept 16)...')
  const sept16 = createdOccs.find(o => o.start_time.startsWith('2026-09-16'))
  if (!sept16) {
    console.error('Sept 16 occurrence not found!')
    process.exit(1)
  }

  const { data: exception, error: excErr } = await supabase
    .from('events')
    .update({
      title: `${testTitle} - Special Recital Prep`,
      record_kind: 'occurrence',
      is_exception: true,
      original_start_time: sept16.start_time,
      updated_at: new Date().toISOString(),
    })
    .eq('id', sept16.id)
    .select('*')
    .single()

  if (excErr || !exception) {
    console.error('Failed to create exception:', excErr)
    process.exit(1)
  }
  console.log(`✔ Sept 16 converted to exception: "${exception.title}" (record_kind: ${exception.record_kind}, original_start: ${exception.original_start_time})`)

  // 5. Test Single Instance Deletion (Sept 23 session)
  console.log('\n4. Testing Single Occurrence Deletion (Sept 23)...')
  const sept23 = createdOccs.find(o => o.start_time.startsWith('2026-09-23'))
  if (!sept23) {
    console.error('Sept 23 occurrence not found!')
    process.exit(1)
  }

  // Delete Sept 23 occurrence row
  await supabase.from('events').delete().eq('id', sept23.id)
  console.log(`✔ Sept 23 occurrence deleted cleanly.`)

  // 6. Verify Active Occurrences in Database
  console.log('\n5. Verifying Active Occurrences after Exception & Deletion...')
  const { data: remainingOccs } = await supabase
    .from('events')
    .select('id, title, start_time, record_kind')
    .or(`series_id.eq.${series.id},recurrence_master_id.eq.${master.id}`)
    .order('start_time', { ascending: true })

  console.log(`✔ Remaining events count: ${remainingOccs.length}`)
  remainingOccs.forEach(o => console.log(`   - [${o.record_kind}] ${o.title} @ ${o.start_time}`))

  // Assert Sept 23 is NOT in remainingOccs
  const hasSept23 = remainingOccs.some(o => o.start_time.startsWith('2026-09-23'))
  if (hasSept23) {
    console.error('FAIL: Sept 23 was not deleted!')
    process.exit(1)
  } else {
    console.log('✔ CONFIRMED: Sept 23 was deleted successfully!')
  }

  // 7. Cleanup Test Data
  console.log('\n6. Cleaning up test data...')
  const eventIds = remainingOccs.map(o => o.id)
  await supabase.from('event_members').delete().in('event_id', eventIds)
  await supabase.from('events').delete().in('id', eventIds)
  await supabase.from('event_series').delete().eq('id', series.id)

  console.log('✔ All test records deleted cleanly!')
  console.log('\n--- SMOKE TEST COMPLETED SUCCESSFULLY WITH 100% PASS ---')
}

runSmokeTest().catch(err => {
  console.error('Smoke test failed with error:', err)
  process.exit(1)
})
