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
const supabaseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY
const db = createClient(supabaseUrl, anonKey)

async function deleteFromGoogle(eventId, googleEventId) {
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/delete-google-event`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'apikey': anonKey,
        'authorization': `Bearer ${anonKey}`,
      },
      body: JSON.stringify({
        event_id: eventId,
        google_event_id: googleEventId,
        google_calendar_id: 'jacobrtabor@gmail.com',
        source_member_id: '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488',
      }),
    })
    const body = await res.json()
    return { status: res.status, body }
  } catch (err) {
    return { error: err.message }
  }
}

async function sweep() {
  console.log('=== Step 1: Finding all events matching "Emme Violin Practice*" or "Violin Practice" ===')
  
  const { data: events, error: searchError } = await db
    .from('events')
    .select('id, title, start_time, status, google_event_id, series_id, deleted_at')
    .or('title.ilike.%Emme%Violin%,title.ilike.%Violin%Practice%')

  if (searchError) {
    console.error('Error searching events:', searchError)
    return
  }

  const emmeViolinEvents = (events || []).filter(e => 
    e.title.toLowerCase().includes('violin') && 
    (e.title.toLowerCase().includes('emme') || e.title.toLowerCase().includes('meredith'))
  )

  console.log(`Matched ${emmeViolinEvents.length} Emme Violin Practice event(s):`)
  for (const ev of emmeViolinEvents) {
    console.log(`  - ID: ${ev.id} | Title: "${ev.title}" | Start: ${ev.start_time} | Status: ${ev.status} | Google ID: ${ev.google_event_id}`)
  }

  console.log('\n=== Step 2: Deleting identified events from Google Calendar ===')
  for (const ev of emmeViolinEvents) {
    if (ev.google_event_id) {
      console.log(`Deleting Google event ${ev.google_event_id} for event ${ev.id}...`)
      const googleRes = await deleteFromGoogle(ev.id, ev.google_event_id)
      console.log(`Google API result for ${ev.google_event_id}:`, googleRes)
    } else {
      console.log(`Event ${ev.id} has no attached google_event_id (already removed or local-only).`)
    }
  }

  console.log('\n=== Step 3: Cancelling and soft-deleting database records (with purge_after) ===')
  const now = new Date()
  const nowIso = now.toISOString()
  const purgeAfter = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString()

  for (const ev of emmeViolinEvents) {
    const { error: updateErr } = await db
      .from('events')
      .update({
        status: 'cancelled',
        deleted_at: nowIso,
        purge_after: purgeAfter,
        google_event_id: null,
        google_calendar_id: null,
        google_connection_id: null,
        updated_at: nowIso,
      })
      .eq('id', ev.id)

    if (updateErr) {
      console.error(`Failed to update DB event ${ev.id}:`, updateErr)
    } else {
      console.log(`Updated DB event ${ev.id} -> cancelled & deleted_at set.`)
    }
  }

  console.log('\n=== Step 4: Re-syncing calendar state via sync-calendars Edge Function ===')
  const syncRes = await fetch(`${supabaseUrl}/functions/v1/sync-calendars`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': anonKey,
      'authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ family_member_id: '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488' }),
  })
  const syncBody = await syncRes.json()
  console.log('Calendar sync response:', syncBody)

  console.log('\n=== Step 5: Final Verification ===')
  const { data: finalEvents } = await db
    .from('events')
    .select('id, title, start_time, status, google_event_id, deleted_at')
    .or('title.ilike.%Emme%Violin%,title.ilike.%Violin%Practice%')
    .is('deleted_at', null)

  const activeMatches = (finalEvents || []).filter(e => 
    e.title.toLowerCase().includes('violin') && 
    (e.title.toLowerCase().includes('emme') || e.title.toLowerCase().includes('meredith'))
  )

  console.log(`Active (non-deleted) Emme Violin Practice events remaining in DB: ${activeMatches.length}`)
  if (activeMatches.length === 0) {
    console.log('SUCCESS: All "Emme Violin Practice*" events have been completely deleted!')
  } else {
    console.warn('WARNING: Remaining active events:', activeMatches)
  }
}

sweep().catch(console.error)
