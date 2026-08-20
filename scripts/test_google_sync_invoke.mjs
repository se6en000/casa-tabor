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

async function testSync() {
  console.log('--- TESTING SYNC-EVENT-TO-GOOGLE EDGE FUNCTION ---')

  // Find a series template event that has an rrule
  const { data: event, error: fetchErr } = await supabase
    .from('events')
    .select('id, title, rrule, record_kind, google_event_id')
    .eq('record_kind', 'series_template')
    .not('rrule', 'is', null)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (fetchErr || !event) {
    console.error('No non-deleted recurring series template found:', fetchErr)
    return
  }

  console.log(`Found master recurring event: "${event.title}" (ID: ${event.id}, RRULE: ${event.rrule}, Google ID: ${event.google_event_id})`)

  console.log('\nInvoking sync-event-to-google...')
  const res = await supabase.functions.invoke('sync-event-to-google', {
    body: {
      event_id: event.id,
      enqueue_on_failure: true,
    },
  })

  console.log('Response:', JSON.stringify(res, null, 2))
}

testSync().catch(console.error)
