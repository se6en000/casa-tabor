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
const supabaseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

async function run() {
  console.log('Triggering `sync-calendars` Edge Function...')
  const res = await fetch(`${supabaseUrl}/functions/v1/sync-calendars`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'apikey': anonKey,
      'authorization': `Bearer ${anonKey}`,
    },
    body: JSON.stringify({}),
  })

  console.log('Status:', res.status)
  const body = await res.json()
  console.log('Result:', JSON.stringify(body, null, 2))
}

run().catch(console.error)
