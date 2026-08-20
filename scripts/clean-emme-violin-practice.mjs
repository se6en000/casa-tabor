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
console.log('Loaded env keys:', Object.keys(env))

const supabaseUrl = env.VITE_SUPABASE_URL || process.env.VITE_SUPABASE_URL
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY

const db = createClient(supabaseUrl, serviceKey)

async function run() {
  const { data: tokens, error } = await db.from('google_tokens').select('*')
  console.log('google_tokens query:', { count: tokens?.length, error })
  if (tokens) {
    for (const t of tokens) {
      console.log(`- Email: ${t.google_email} | Has Refresh: ${!!t.refresh_token} | Has Access: ${!!t.access_token}`)
    }
  }
}

run().catch(console.error)
