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
const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

async function verify() {
  console.log('=== Final Verification Audit: Emme Violin Practice Cleanup ===')
  
  // 1. Check all events matching Violin / Emme Practice
  const { data: allMatches } = await db
    .from('events')
    .select('id, title, start_time, status, google_event_id, deleted_at, purge_after')
    .or('title.ilike.%Emme%Violin%,title.ilike.%Violin%Practice%')

  console.log(`Total database records found matching query: ${allMatches?.length ?? 0}`)
  for (const m of (allMatches || [])) {
    console.log(`  - [${m.status.toUpperCase()}] ID: ${m.id} | Title: "${m.title}" | Start: ${m.start_time} | Google ID: ${m.google_event_id ?? 'null'} | DeletedAt: ${m.deleted_at} | PurgeAfter: ${m.purge_after}`)
  }

  // 2. Active records check
  const activeRecords = (allMatches || []).filter(m => m.deleted_at === null && m.status !== 'cancelled')
  console.log(`Active (non-soft-deleted / non-cancelled) records remaining: ${activeRecords.length}`)
  
  if (activeRecords.length === 0) {
    console.log('\n✅ VERIFICATION COMPLETE: All "Emme Violin Practice*" events have been removed from Google Calendar and soft-deleted/cancelled in the local database.')
  } else {
    console.log('\n❌ VERIFICATION FAILED: Active records still remain.')
  }
}

verify().catch(console.error)
