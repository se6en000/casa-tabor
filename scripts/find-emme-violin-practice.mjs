import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

function loadEnv() {
  const envPaths = ['.env.local', '.env']
  const env = {}
  for (const envPath of envPaths) {
    const fullPath = path.resolve(process.cwd(), envPath)
    if (fs.existsSync(fullPath)) {
      const content = fs.readFileSync(fullPath, 'utf8')
      for (const line of content.split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        const eqIdx = trimmed.indexOf('=')
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim()
          let val = trimmed.slice(eqIdx + 1).trim()
          if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
            val = val.slice(1, -1)
          }
          env[key] = val
        }
      }
    }
  }
  return env
}

const env = loadEnv()
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function inspect() {
  console.log('=== Searching `events` table for Emme / Violin / Practice / Meredith ===')
  const { data: events, error: evErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, status, google_event_id, series_id, deleted_at, record_kind')
    .or('title.ilike.%Emme%,title.ilike.%Violin%,title.ilike.%Practice%,title.ilike.%Meredith%')

  console.log(`Found ${events?.length ?? 0} matching events:`)
  if (events) {
    for (const ev of events) {
      console.log(`- ID: ${ev.id} | Title: "${ev.title}" | Start: ${ev.start_time} | Status: ${ev.status} | DeletedAt: ${ev.deleted_at} | RecordKind: ${ev.record_kind} | Google ID: ${ev.google_event_id} | SeriesID: ${ev.series_id}`)
    }
  }
}

inspect().catch(console.error)
