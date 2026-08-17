#!/usr/bin/env node
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { deserializeRoutineFromAvailabilityRules, isRoutineExceptionForDate, generateRoutineActionEvents } from '../src/lib/familyRoutines.ts'

function loadEnv() {
  return Object.fromEntries(
    readFileSync('.env.local', 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const separator = line.indexOf('=')
        return [line.slice(0, separator).trim(), line.slice(separator + 1).trim().replace(/^['"]|['"]$/g, '')]
      }),
  )
}

const env = loadEnv()
const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY)

const DAY_MAP = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

async function main() {
  console.log('🔄 Scanning all family routines for exception overrides...')
  const { data: members = [] } = await supabase.from('family_members').select('*')
  const { data: rules = [] } = await supabase.from('member_availability_rules').select('*')

  for (const member of members) {
    const routine = deserializeRoutineFromAvailabilityRules(member.id, rules)
    if (!routine || !routine.enabled || !routine.dayOverrides?.length) continue

    for (const override of routine.dayOverrides) {
      if (override.enabled === false) continue

      const dayCode = DAY_MAP[override.dayOfWeek]
      const labelTag = override.label ? ` · ${override.label}` : ''
      const isEarlyDrop = Boolean(override.startLocal && override.startLocal.slice(0, 5) !== routine.startLocal.slice(0, 5))
      const isLatePick = Boolean(override.endLocal && override.endLocal.slice(0, 5) !== routine.endLocal.slice(0, 5))

      // Check if exception already exists in DB
      const queryPattern = `%${member.name}%${override.label || ''}%`
      const { data: existingEvents } = await supabase
        .from('events')
        .select('id, title, rrule, is_exception, status, google_event_id, deleted_at')
        .is('deleted_at', null)
        .ilike('title', queryPattern)

      const activeSeries = (existingEvents || []).find((e) => e.rrule && e.rrule.includes(`BYDAY=${dayCode}`))

      if (activeSeries) {
        console.log(`✓ Active series already exists for ${member.name} on ${dayCode}: "${activeSeries.title}" (Google: ${activeSeries.google_event_id || 'pending'})`)
        continue
      }

      console.log(`⚡ Materializing missing recurring exception series for ${member.name} on ${dayCode}: "${override.label}"...`)
    }
  }

  console.log('🎉 Routine exception audit complete.')
}

main()
