#!/usr/bin/env node
// Records a nightly result in public.nightly_checks for the morning email (see nightly-assistant-check.mjs).
//   node scripts/nightly-record.mjs <kind> <ok:true|false> <summary> [details-file]
import fs from 'node:fs'
const env = Object.fromEntries(fs.readFileSync(new URL('../.env.local', import.meta.url), 'utf8').split('\n').map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/g, '')]))
const [kind, ok, summary, file] = process.argv.slice(2)
const lit = (s) => `'${String(s).replace(/'/g, "''")}'`
const details = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(0, 40) : []
// Three tries a minute apart (Oct 6: the 3:47 AM screens result never landed, and the reason was thrown away).
for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch('https://api.supabase.com/v1/projects/sjiejymuuuqzqukyeagk/database/query', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${env.SUPABASE_ACCESS_TOKEN}` },
      body: JSON.stringify({ query: `insert into public.nightly_checks (kind, ok, summary, details) values (${lit(kind)}, ${ok === 'true'}, ${lit(summary)}, ${lit(JSON.stringify(details))}::jsonb)` }),
    })
    if (res.ok) break
    throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`)
  } catch (error) {
    console.error(`${new Date().toISOString()} record try ${attempt} failed: ${error.message}`)
    if (attempt >= 3) process.exit(1)
    await new Promise((r) => setTimeout(r, 60_000))
  }
}
