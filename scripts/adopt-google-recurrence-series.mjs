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
const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function main() {
  console.log('🔄 Step 1: Invoking import-google-recurrence (force_full: true)...')
  const importRes = await client.functions.invoke('import-google-recurrence', {
    body: { force_full: true },
  })
  console.log('Import result status:', importRes.error ? `Error: ${importRes.error.message}` : 'Success', importRes.data)

  console.log('🔄 Step 2: Materializing active recurring series for full year window...')
  const rangeStart = new Date(Date.now() - 90 * 86400000).toISOString()
  const rangeEnd = new Date(Date.now() + 365 * 86400000).toISOString()
  const matRes = await client.functions.invoke('materialize-recurring-events', {
    body: { range_start: rangeStart, range_end: rangeEnd },
  })
  console.log('Materialization result:', matRes.error ? `Error: ${matRes.error.message}` : matRes.data)

  console.log('🔄 Step 3: Verifying Emme Strings @ PBP (Late Pickup) and overall recurrence link status...')
  const { data: emmeEvents } = await client
    .from('events')
    .select('id, title, start_time, record_kind, series_id, google_event_id, status')
    .ilike('title', '%Strings%')
    .order('start_time')

  const occurrences = (emmeEvents || []).filter(e => e.record_kind === 'occurrence' && e.series_id)
  const singles = (emmeEvents || []).filter(e => e.record_kind === 'single')
  console.log(`✅ Emme Strings: ${occurrences.length} canonical occurrences, ${singles.length} legacy single records`)

  // If there are duplicate single records for dates that have a canonical occurrence, clean them up
  const occurrenceGoogleIds = new Set(occurrences.map(o => o.google_event_id).filter(Boolean))
  const staleSingles = singles.filter(s => occurrenceGoogleIds.has(s.google_event_id) || s.status === 'cancelled')
  if (staleSingles.length > 0) {
    console.log(`🧹 Retiring ${staleSingles.length} stale/cancelled single records that now have canonical occurrences...`)
    for (const stale of staleSingles) {
      await client.from('events').delete().eq('id', stale.id)
    }
    console.log('✓ Stale duplicate single records cleaned up.')
  }

  // Count unlinked Google instances across the whole DB
  const { data: allEvents } = await client
    .from('events')
    .select('id, title, google_event_id, series_id, record_kind, status')
    .not('google_event_id', 'is', null)

  const unlinked = (allEvents || []).filter(e => {
    const isInstanceId = /^[a-zA-Z0-9]+_\d{8}(T\d{6}Z?)?$/.test(e.google_event_id) || e.google_event_id.includes('_R')
    return isInstanceId && !e.series_id && e.record_kind === 'single'
  })

  console.log(`📊 Final Status: ${unlinked.length} unlinked instances remaining across database.`)
}

main().catch(err => {
  console.error('❌ Script failed:', err)
  process.exit(1)
})
