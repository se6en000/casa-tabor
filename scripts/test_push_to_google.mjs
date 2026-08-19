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

async function testPush() {
  console.log('--- TESTING PUSH-TO-GOOGLE FOR EMME VIOLIN MASTER ---')
  const masterId = '1d4ee58c-b721-4b9c-9e85-569120d74ad8'

  const { data: event } = await supabase.from('events').select('*').eq('id', masterId).single()
  console.log('Master Event details:', {
    id: event.id,
    title: event.title,
    rrule: event.rrule,
    google_event_id: event.google_event_id,
    google_calendar_id: event.google_calendar_id,
  })

  console.log('\nInvoking push-to-google...')
  const res = await supabase.functions.invoke('push-to-google', {
    body: { event_id: masterId }
  })

  console.log('push-to-google Result:', JSON.stringify(res, null, 2))
}

testPush().catch(console.error)
