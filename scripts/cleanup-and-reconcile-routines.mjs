import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sjiejymuuuqzqukyeagk.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function runCleanup() {
  console.log('=== Cleaning up Legacy / Redundant Routine Events in Supabase ===\n')

  // 1. Soft-delete 75 legacy "Pick up Emme @ Bak Middle School of the Arts" rows
  const { data: bakRows, error: bakFindErr } = await supabase
    .from('events')
    .select('id, title, start_time')
    .is('deleted_at', null)
    .ilike('title', '%Pick up Emme @ Bak Middle School%')

  if (bakFindErr) {
    console.error('Error finding Bak rows:', bakFindErr)
  } else {
    console.log(`Found ${bakRows?.length || 0} active "Pick up Emme @ Bak Middle School" rows.`)
    if (bakRows && bakRows.length > 0) {
      const ids = bakRows.map((r) => r.id)
      const nowIso = new Date().toISOString()
      const purgeAfterIso = new Date(Date.now() + 30 * 86400000).toISOString()
      const { error: delErr } = await supabase
        .from('events')
        .update({
          deleted_at: nowIso,
          purge_after: purgeAfterIso,
          status: 'cancelled',
        })
        .in('id', ids)

      if (delErr) {
        console.error('Error soft-deleting Bak rows:', delErr)
      } else {
        console.log(`Successfully soft-deleted ${ids.length} legacy Emme @ Bak rows.`)
      }
    }
  }

  // 2. Inspect "Emme 7am: Beethoven Strings"
  const { data: stringsRows, error: stringsErr } = await supabase
    .from('events')
    .select('id, title, start_time, google_event_id, rrule')
    .is('deleted_at', null)
    .ilike('title', '%Beethoven Strings%')

  console.log(`\nFound ${stringsRows?.length || 0} active Beethoven Strings rows.`)
  if (stringsRows && stringsRows.length > 0) {
    const byStartTime = new Map()
    const duplicateIds = []

    for (const r of stringsRows) {
      const timeKey = r.start_time
      if (!byStartTime.has(timeKey)) {
        byStartTime.set(timeKey, r)
      } else {
        const existing = byStartTime.get(timeKey)
        if (!existing.google_event_id && r.google_event_id) {
          duplicateIds.push(existing.id)
          byStartTime.set(timeKey, r)
        } else {
          duplicateIds.push(r.id)
        }
      }
    }

    if (duplicateIds.length > 0) {
      console.log(`Soft-deleting ${duplicateIds.length} duplicate Beethoven Strings rows...`)
      const nowIso = new Date().toISOString()
      const purgeAfterIso = new Date(Date.now() + 30 * 86400000).toISOString()
      const { error: dupDelErr } = await supabase
        .from('events')
        .update({
          deleted_at: nowIso,
          purge_after: purgeAfterIso,
          status: 'cancelled',
        })
        .in('id', duplicateIds)

      if (dupDelErr) console.error('Error deleting duplicate strings rows:', dupDelErr)
      else console.log(`Soft-deleted ${duplicateIds.length} duplicate strings rows.`)
    }
  }

  // 3. Check for redundant non-exception Palm Beach Public drop-off series if stored as hard database rows
  const { data: pbpDropRows } = await supabase
    .from('events')
    .select('id, title, start_time, rrule')
    .is('deleted_at', null)
    .ilike('title', '%Drop off Emme & Owen @ Palm Beach Public%')

  console.log(`\nFound ${pbpDropRows?.length || 0} stored standard PBP drop-off rows in DB.`)
  if (pbpDropRows && pbpDropRows.length > 0) {
    // Note: Standard days should be ambient when sync mode is 'exceptions_only'.
    // If there are standalone standard daily rows created manually, we soft-delete them so in-memory engine controls exceptions.
    console.log('Soft-deleting redundant standard daily drop-off rows from database...')
    const ids = pbpDropRows.map((r) => r.id)
    await supabase.from('events').update({ deleted_at: new Date().toISOString() }).in('id', ids)
    console.log(`Soft-deleted ${ids.length} standard daily drop-off rows.`)
  }

  console.log('\n=== Cleanup Complete ===')
}

runCleanup().catch(console.error)
