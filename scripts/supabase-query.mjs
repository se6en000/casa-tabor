#!/usr/bin/env node
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
const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const supabaseAnonKey = env.VITE_SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ Missing Supabase credentials in .env.local')
  process.exit(1)
}

const args = process.argv.slice(2)
const table = args[0] || 'family_members'
let limit = 10

const limitIdx = args.indexOf('--limit')
if (limitIdx !== -1 && args[limitIdx + 1]) {
  limit = parseInt(args[limitIdx + 1], 10)
}

const client = createClient(supabaseUrl, supabaseAnonKey)

async function queryTable() {
  console.log(`📡 Querying table: "${table}" (limit: ${limit})...`)
  const { data, error } = await client.from(table).select('*').limit(limit)

  if (error) {
    console.error(`❌ Error querying "${table}":`, error.message)
    process.exit(1)
  }

  console.log(`✅ Retrieved ${data.length} records:`)
  console.dir(data, { depth: null, colors: true })
}

queryTable().catch(console.error)
