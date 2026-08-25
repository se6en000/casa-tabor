import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const envPath = path.resolve(__dirname, '../.env.local')

if (!fs.existsSync(envPath)) {
  console.error('Error: .env.local not found')
  process.exit(1)
}

const envContent = fs.readFileSync(envPath, 'utf-8')
const env = {}
for (const line of envContent.split('\n')) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    const idx = trimmed.indexOf('=')
    if (idx !== -1) {
      env[trimmed.slice(0, idx).trim()] = trimmed.slice(idx + 1).trim()
    }
  }
}

const token = env.SUPABASE_ACCESS_TOKEN
const projectRef = 'sjiejymuuuqzqukyeagk'

async function checkHealth() {
  console.log('🔍 Checking Supabase Platform Services Health...\n')
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${projectRef}/health?services%5B%5D=db&services%5B%5D=rest&services%5B%5D=auth&services%5B%5D=storage&services%5B%5D=realtime&services%5B%5D=pooler`,
      {
        headers: { Authorization: `Bearer ${token}` }
      }
    )

    if (!res.ok) {
      console.error(`HTTP error ${res.status}: ${res.statusText}`)
      process.exit(1)
    }

    const services = await res.json()
    let allHealthy = true

    console.table(
      services.map((s) => {
        const isHealthy = s.healthy === true && s.status === 'ACTIVE_HEALTHY'
        if (!isHealthy) allHealthy = false
        return {
          Service: s.name.toUpperCase(),
          Status: s.status,
          Healthy: isHealthy ? '✅ YES' : '❌ NO',
          Details: s.error || (s.info ? JSON.stringify(s.info) : 'OK')
        }
      })
    )

    if (!allHealthy) {
      console.error('\n⚠️ Some database services are UNHEALTHY!')
      process.exit(1)
    } else {
      console.log('\n✨ All Supabase services are ACTIVE & 100% HEALTHY!')
    }
  } catch (err) {
    console.error('Failed to query health API:', err)
    process.exit(1)
  }
}

checkHealth()
