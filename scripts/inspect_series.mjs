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

async function inspectSeries() {
  console.log('=== ALL EVENT SERIES ===')
  const { data: series } = await supabase.from('event_series').select('*')
  console.log(JSON.stringify(series, null, 2))

  console.log('=== ALL MASTER TEMPLATES ===')
  const { data: masters } = await supabase
    .from('events')
    .select('id, title, record_kind, rrule, google_event_id, google_calendar_id, start_time, end_time, series_id, deleted_at')
    .eq('record_kind', 'series_template')
  console.log(JSON.stringify(masters, null, 2))
}

inspectSeries().catch(console.error)
