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

async function inspectConstraint() {
  const kinds = ['single', 'series_template', 'occurrence', 'exception', 'series', 'master', 'override']
  for (const k of kinds) {
    const { error } = await supabase.from('events').insert({
      title: 'TEST_KIND_CHECK',
      start_time: '2026-09-01T10:00:00Z',
      end_time: '2026-09-01T11:00:00Z',
      record_kind: k,
    }).select('id')
    if (error) {
      console.log(`Kind '${k}': REJECTED (${error.message})`)
    } else {
      console.log(`Kind '${k}': ALLOWED ✔`)
      await supabase.from('events').delete().eq('title', 'TEST_KIND_CHECK')
    }
  }
}

inspectConstraint().catch(console.error)
