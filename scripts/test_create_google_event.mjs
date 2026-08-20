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

async function testCreate() {
  console.log('--- TESTING CREATE-GOOGLE-EVENT EDGE FUNCTION ---')

  // Find master event without google_event_id
  const { data: event, error: fetchErr } = await supabase
    .from('events')
    .select('id, title, rrule, record_kind, google_event_id')
    .eq('record_kind', 'series_template')
    .is('google_event_id', null)
    .is('deleted_at', null)
    .limit(1)
    .single()

  if (fetchErr || !event) {
    console.error('No master event without google_event_id found:', fetchErr)
    return
  }

  console.log(`Found master event: "${event.title}" (ID: ${event.id})`)

  console.log('\nInvoking create-google-event...')
  const res = await supabase.functions.invoke('create-google-event', {
    body: { event_id: event.id }
  })

  console.log('Response:', JSON.stringify(res, null, 2))
}

testCreate().catch(console.error)
