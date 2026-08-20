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

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

const routineTitles = [
  'drop off emme & owen @ palm beach public elementary school',
  'pick up liv @ bak middle school of the arts',
  'drop off liv @ bak middle school of the arts',
  'drop off owen @ palm beach public elementary school',
  'drop off emme @ palm beach public elementary school',
  'pick up emme @ palm beach public elementary school',
  'pick up emme & owen @ palm beach public elementary school',
  'owen & emme picked up by giselle',
  'owen drop off',
]

async function cleanup() {
  console.log('🔍 Fetching routine clutter events from database...')
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, google_event_id, google_calendar_id, start_time, deleted_at')
    .is('deleted_at', null)
    .order('start_time')

  if (error) {
    console.error('❌ Error fetching events:', error.message)
    process.exit(1)
  }

  const targets = (events || []).filter((e) => {
    const t = (e.title || '').toLowerCase().trim()
    return routineTitles.includes(t)
  })

  console.log(`🧹 Found ${targets.length} routine clutter events to remove.`)

  // Step 1: Delete from Google Calendar via delete-google-event
  const googleEventsWithId = targets.filter((t) => Boolean(t.google_event_id))
  console.log(`🌐 Deleting ${googleEventsWithId.length} events from Google Calendar...`)

  let googleSuccess = 0
  let googleFail = 0
  const processedGoogleMasters = new Set()

  for (let i = 0; i < googleEventsWithId.length; i++) {
    const ev = googleEventsWithId[i]
    const masterId = ev.google_event_id.split('_')[0]

    // If it is an occurrence of a master series we already deleted, Google might return 404/410, which is fine
    try {
      const res = await supabase.functions.invoke('delete-google-event', {
        body: { event_id: ev.id },
      })
      if (res.error) {
        googleFail++
      } else {
        googleSuccess++
      }
    } catch {
      googleFail++
    }

    if ((i + 1) % 25 === 0 || i === googleEventsWithId.length - 1) {
      console.log(`   Progress: ${i + 1}/${googleEventsWithId.length} processed (${googleSuccess} ok, ${googleFail} skipped/failed)`)
    }
  }

  // Step 2: Soft delete from Supabase events table
  console.log(`💾 Soft deleting ${targets.length} events in Supabase DB...`)
  const targetIds = targets.map((t) => t.id)
  const chunkSize = 100
  let dbSuccess = 0

  for (let i = 0; i < targetIds.length; i += chunkSize) {
    const chunk = targetIds.slice(i, i + chunkSize)
    const { error: delErr } = await supabase
      .from('events')
      .update({ deleted_at: new Date().toISOString() })
      .in('id', chunk)

    if (delErr) {
      console.error(`❌ Error updating chunk ${i / chunkSize}:`, delErr.message)
    } else {
      dbSuccess += chunk.length
    }
  }

  console.log(`✅ Cleaned up ${dbSuccess} events from Supabase DB.`)
  console.log('🎉 Cleanup complete!')
}

cleanup().catch(console.error)
