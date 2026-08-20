import fs from 'fs'
import path from 'path'
import { createClient } from '@supabase/supabase-js'

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
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://flqceijszqvwskwuvsng.supabase.co'
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY || env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

async function inspectConnections() {
  console.log('--- Inspecting calendar_connections ---')
  const { data: conns, error } = await supabase
    .from('calendar_connections')
    .select('*')

  if (error) console.error('Error fetching calendar_connections:', error)
  else console.log(JSON.stringify(conns, null, 2))

  console.log('--- Inspecting google_tokens ---')
  const { data: tokens, error: tokErr } = await supabase
    .from('google_tokens')
    .select('family_member_id, google_email, expires_at, updated_at')

  if (tokErr) console.error('Error fetching google_tokens:', tokErr)
  else console.log(JSON.stringify(tokens, null, 2))

  console.log('--- Inspecting google_sync_jobs (recent failures/pending) ---')
  const { data: jobs, error: jobErr } = await supabase
    .from('google_sync_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(10)

  if (jobErr) console.error('Error fetching google_sync_jobs:', jobErr)
  else console.log(JSON.stringify(jobs, null, 2))
}

inspectConnections()
