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

async function debugSync() {
  console.log('=== 1. CALENDAR CONNECTIONS ===')
  const { data: connections, error: connErr } = await supabase.from('calendar_connections').select('*')
  console.log(connErr || connections)

  console.log('\n=== 2. EVENT SERIES IN DATABASE ===')
  const { data: seriesList, error: sErr } = await supabase.from('event_series').select('*')
  console.log(sErr || seriesList)

  console.log('\n=== 3. MASTER EVENTS (record_kind = series_template) ===')
  const { data: masters, error: mErr } = await supabase
    .from('events')
    .select('id, title, record_kind, rrule, google_event_id, google_calendar_id, updated_at, deleted_at')
    .eq('record_kind', 'series_template')
  console.log(mErr || masters)

  console.log('\n=== 4. EMME EVENTS IN DATABASE ===')
  const { data: emmeEvents, error: eErr } = await supabase
    .from('events')
    .select('id, title, record_kind, rrule, start_time, google_event_id, series_id, recurrence_master_id, is_exception')
    .ilike('title', '%Emme%')
    .is('deleted_at', null)
  console.log(eErr || emmeEvents)

  console.log('\n=== 5. PENDING GOOGLE SYNC JOBS / OPERATIONS ===')
  const { data: jobs, error: jErr } = await supabase.from('google_sync_jobs').select('*').limit(10)
  console.log('google_sync_jobs:', jErr || jobs)

  const { data: ops, error: oErr } = await supabase.from('calendar_sync_operations').select('*').limit(10)
  console.log('calendar_sync_operations:', oErr || ops)
}

debugSync().catch(console.error)
