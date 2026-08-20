import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

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
const sbUrl = env.VITE_SUPABASE_URL
const sbKey = env.VITE_SUPABASE_ANON_KEY
const sb = createClient(sbUrl, sbKey)

const JACOB_MEMBER_ID = '8bf81a21-f2b8-4232-91c6-5a5e9d5b9488'

function parseIcs(icsPath, titleQuery) {
  const content = fs.readFileSync(icsPath, 'utf8')
  const blocks = content.split('BEGIN:VEVENT')
  const matches = []

  for (const block of blocks.slice(1)) {
    const summaryMatch = block.match(/SUMMARY:(.*)/)
    const uidMatch = block.match(/UID:(.*)/)
    const dtstartMatch = block.match(/DTSTART.*:(.*)/)

    const summary = summaryMatch ? summaryMatch[1].trim() : ''
    const rawUid = uidMatch ? uidMatch[1].trim() : ''
    const dtstart = dtstartMatch ? dtstartMatch[1].trim() : ''

    const cleanUid = rawUid.replace(/@google\.com$/, '')

    if (summary.toLowerCase().includes(titleQuery.toLowerCase())) {
      matches.push({
        summary,
        rawUid,
        cleanUid,
        dtstart,
      })
    }
  }

  return matches
}

async function purgeEvents() {
  const icsPath = 'scratch_ical/Jacob Tabor_jacobrtabor@gmail.com.ics'
  const query = 'Emme Violin Practice'

  console.log(`==================================================`)
  console.log(`Parsing .ics file: ${icsPath} for query: '${query}'`)
  console.log(`==================================================`)

  const matches = parseIcs(icsPath, query)
  console.log(`Found ${matches.length} matching events in .ics export.\n`)

  let successCount = 0
  let failCount = 0

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i]
    const tempId = crypto.randomUUID()

    // 1. Insert temporary marker row in events table
    const { error: insErr } = await sb.from('events').insert({
      id: tempId,
      title: m.summary,
      start_time: '2026-09-11T20:30:00Z',
      end_time: '2026-09-11T21:00:00Z',
      google_event_id: m.cleanUid,
      source_member_id: JACOB_MEMBER_ID,
      status: 'confirmed',
    })

    if (insErr) {
      console.error(`❌ [${i + 1}/${matches.length}] Insert error for ${m.cleanUid}:`, insErr.message)
      failCount++
      continue
    }

    // 2. Invoke delete-google-event Edge Function
    try {
      const res = await fetch(`${sbUrl}/functions/v1/delete-google-event`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          apikey: sbKey,
          authorization: `Bearer ${sbKey}`,
        },
        body: JSON.stringify({ event_id: tempId }),
      })

      const resJson = await res.json()
      if (res.ok && resJson.ok) {
        successCount++
        console.log(`✅ [${i + 1}/${matches.length}] Deleted Google Event: ${m.cleanUid} (${m.dtstart} - ${m.summary})`)
      } else {
        failCount++
        console.error(`❌ [${i + 1}/${matches.length}] Delete failed for ${m.cleanUid}:`, resJson)
      }
    } catch (err) {
      failCount++
      console.error(`❌ [${i + 1}/${matches.length}] Exception for ${m.cleanUid}:`, err.message)
    } finally {
      // 3. Delete temporary marker row from events table
      await sb.from('events').delete().eq('id', tempId)
    }
  }

  console.log(`\n==================================================`)
  console.log(`Purge Complete! ${successCount} deleted, ${failCount} failed out of ${matches.length} total.`)
  console.log(`==================================================`)
}

purgeEvents().catch(console.error)
