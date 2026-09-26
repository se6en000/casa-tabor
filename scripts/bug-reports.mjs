#!/usr/bin/env node
// Read the assistant bug reports sent from the wall's bug icon (read-only).
//   node scripts/bug-reports.mjs [hours=48]
// Each report: when, who, what they expected vs what happened, the whole conversation,
// and the server's own events for the same session (ai_drawer_debug_events).
// Uses SUPABASE_ACCESS_TOKEN from .env.local through the Management API in read-only mode;
// the token is never printed.
import fs from 'node:fs'

const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n')
  .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const PROJECT = 'sjiejymuuuqzqukyeagk'
const hours = Number(process.argv[2] ?? 48)
const q = async (query) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, read_only: true }),
  })
  if (!r.ok) throw new Error(`query failed: ${r.status}`)
  return r.json()
}

const reports = await q(`select received_at, session_id, detail, payload, device_id, source_href
  from ai_drawer_debug_events where event = 'user_bug_report' and received_at > now() - interval '${hours} hours'
  order by received_at desc limit 20`)
if (reports.length === 0) console.log(`No bug reports in the last ${hours} hours.`)
for (const r of reports) {
  const p = r.payload ?? {}
  console.log('━'.repeat(80))
  console.log(`${r.received_at} · ${p.context?.viewer ?? '?'} · ${p.context?.surface ?? '?'} · build ${p.context?.build ?? '?'}`)
  console.log(`  ${r.detail}`)
  if (p.heard) console.log(`  heard: "${p.heard}"`)
  for (const m of p.conversation ?? []) {
    console.log(`  ${m.at ?? '        '} ${m.role === 'user' ? 'YOU' : 'CASA'}: ${m.text}${m.action ? `  [${m.action.tool} ${m.action.status}: ${m.action.shown}]` : ''}${m.images ? `  [${m.images} image(s)]` : ''}`)
  }
  console.log(`  context: ${JSON.stringify(p.context)}`)
  if (r.session_id) {
    const server = await q(`select received_at, event, left(detail, 160) as detail from ai_drawer_debug_events
      where session_id = '${String(r.session_id).replace(/'/g, "''")}' and event like 'server_%' order by received_at limit 40`)
    for (const e of server) console.log(`    server ${e.received_at} ${e.event} ${e.detail ?? ''}`)
  }
}
