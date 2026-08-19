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
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://flqceijszqvwskwuvsng.supabase.co'
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectEmme() {
  console.log('--- Inspecting Emme events in DB ---')
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, record_kind, rrule, google_event_id, google_calendar_id, google_connection_id, status, created_at, updated_at, recurrence_master_id, series_id')
    .ilike('title', '%Emme%')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) {
    console.error('Error fetching events:', error)
    return
  }

  console.log(`Found ${events.length} Emme events:`)
  console.log(JSON.stringify(events, null, 2))

  // Also check active Google connections
  const { data: connections, error: connErr } = await supabase
    .from('google_calendar_connections')
    .select('*')

  console.log('--- Active Google Calendar Connections ---')
  if (connErr) console.error('Conn error:', connErr)
  else console.log(JSON.stringify(connections, null, 2))
}

inspectEmme()
