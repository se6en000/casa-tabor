#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load environment variables from .env.local or .env
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
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY
const supabaseServiceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('=========================================')
console.log('⚡ Casa Tabor Supabase Connection Verification')
console.log('=========================================')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Error: Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

console.log(`📍 Project URL: ${supabaseUrl}`)
console.log(`🔑 Anon Key:    ${supabaseAnonKey.slice(0, 12)}...${supabaseAnonKey.slice(-6)}`)
if (supabaseServiceKey) {
  console.log(`🛡️  Service Key: ${supabaseServiceKey.slice(0, 12)}...${supabaseServiceKey.slice(-6)}`)
}
console.log('')

const client = createClient(supabaseUrl, supabaseAnonKey)

const tablesToCheck = [
  'family_members',
  'calendar_events',
  'prep_items',
  'notifications',
  'household_profiles',
  'google_services_sync_state'
]

async function runCheck() {
  console.log('🔍 Testing table connections...')
  let successCount = 0

  for (const table of tablesToCheck) {
    const start = Date.now()
    const { data, count, error } = await client
      .from(table)
      .select('*', { count: 'exact', head: true })

    const duration = Date.now() - start
    if (error) {
      console.log(`  ❌ [${table.padEnd(28)}] Error: ${error.message} (${duration}ms)`)
    } else {
      console.log(`  ✅ [${table.padEnd(28)}] Connected — ${count ?? 0} rows (${duration}ms)`)
      successCount++
    }
  }

  console.log('')
  if (successCount === tablesToCheck.length) {
    console.log('🎉 Supabase connection is fully healthy and verified!')
  } else {
    console.log(`⚠️  ${successCount}/${tablesToCheck.length} tables verified successfully.`)
  }
}

runCheck().catch((err) => {
  console.error('Fatal connection error:', err)
  process.exit(1)
})
