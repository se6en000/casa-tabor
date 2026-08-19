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

async function updateMasterRrule() {
  console.log('--- UPDATING MASTER RRULE TO OCT 16 2026 ---')
  const masterId = '1d4ee58c-b721-4b9c-9e85-569120d74ad8'
  const newRrule = 'RRULE:FREQ=WEEKLY;BYDAY=FR;UNTIL=20261016T235959Z'

  // 1. Update events master row
  const { error: masterErr } = await supabase
    .from('events')
    .update({
      rrule: newRrule,
      updated_at: new Date().toISOString(),
    })
    .eq('id', masterId)

  if (masterErr) {
    console.error('Failed to update master event rrule:', masterErr)
    return
  }
  console.log('✔ Master event rrule updated to:', newRrule)

  // 2. Update event_series row
  const { data: series } = await supabase
    .from('event_series')
    .select('id')
    .eq('template_event_id', masterId)
    .maybeSingle()

  if (series) {
    await supabase.from('event_series').update({
      recurrence_lines: [newRrule],
      updated_at: new Date().toISOString(),
    }).eq('id', series.id)
    console.log('✔ Event series recurrence_lines updated')
  }

  // 3. Prune out-of-bounds occurrences after Oct 16
  const oct16Cutoff = '2026-10-16T23:59:59.999Z'
  const { data: pruned } = await supabase
    .from('events')
    .delete()
    .eq('recurrence_master_id', masterId)
    .gt('start_time', oct16Cutoff)
    .select('id, start_time')

  console.log(`✔ Pruned ${pruned?.length ?? 0} out-of-bounds occurrences past Oct 16:`, pruned?.map(p => p.start_time))

  // 4. Push updated RRULE to Google Calendar API!
  console.log('\nPushing updated series to Google Calendar API...')
  const pushRes = await supabase.functions.invoke('push-to-google', {
    body: { event_id: masterId }
  })
  console.log('push-to-google result:', JSON.stringify(pushRes, null, 2))
}

updateMasterRrule().catch(console.error)
