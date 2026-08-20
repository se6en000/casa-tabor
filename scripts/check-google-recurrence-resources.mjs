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
const supabaseUrl = env.VITE_SUPABASE_URL
const anonKey = env.VITE_SUPABASE_ANON_KEY

const supabase = createClient(supabaseUrl, anonKey)

async function inspect() {
  console.log('=== Searching `google_recurrence_resources` ===')
  const { data: resources, error } = await supabase
    .from('google_recurrence_resources')
    .select('*')

  console.log(`Query result error:`, error)
  console.log(`Found ${resources?.length ?? 0} resources:`)
  if (resources) {
    for (const r of resources) {
      if (JSON.stringify(r).toLowerCase().includes('violin') || JSON.stringify(r).toLowerCase().includes('emme')) {
        console.log('MATCH:', r)
      }
    }
  }
}

inspect().catch(console.error)
