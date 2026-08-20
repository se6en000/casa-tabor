#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'

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

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function seed() {
  console.log('🌱 Fetching active family members...')
  const { data: family, error: famErr } = await supabase.from('family_members').select('*')
  if (famErr) throw famErr

  const jake = family.find((m) => m.name.toLowerCase().includes('jake')) || family[0]
  const owen = family.find((m) => m.name.toLowerCase().includes('owen')) || family[1]
  const emme = family.find((m) => m.name.toLowerCase().includes('emme')) || family[2]
  const liv = family.find((m) => m.name.toLowerCase().includes('liv')) || family[3]

  console.log(`👤 Using members: Jake (${jake?.id}), Owen (${owen?.id}), Emme (${emme?.id}), Liv (${liv?.id})`)

  const today = new Date()
  const y = today.getFullYear()
  const m = today.getMonth()
  const d = today.getDate()

  const evt1Id = crypto.randomUUID()
  const evt2Id = crypto.randomUUID()
  const evt3Id = crypto.randomUUID()
  const evt4Id = crypto.randomUUID()

  // 1. Create Today's events
  console.log('📅 Inserting today demo events...')
  const events = [
    {
      id: evt1Id,
      title: "Emme | Gymnastics Practice & Pickup",
      description: "Cheer Athletics gym session. Pickup needed at 4:30 PM.",
      start_time: new Date(y, m, d, 15, 0, 0).toISOString(),
      end_time: new Date(y, m, d, 16, 30, 0).toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: "Cheer Athletics",
      status: 'confirmed',
    },
    {
      id: evt2Id,
      title: "Owen | Soccer Training & Scrimmage",
      description: "West Field practice. Bring tournament kit and water bottle.",
      start_time: new Date(y, m, d, 16, 30, 0).toISOString(),
      end_time: new Date(y, m, d, 18, 0, 0).toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: "West Field #3",
      status: 'confirmed',
    },
    {
      id: evt3Id,
      title: "Owen | Piano Lesson",
      description: "Weekly studio piano lesson with Ms. Claire.",
      start_time: new Date(y, m, d, 15, 15, 0).toISOString(),
      end_time: new Date(y, m, d, 16, 0, 0).toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: "Downtown Music Studio",
      status: 'confirmed',
    },
    {
      id: evt4Id,
      title: "Liv | Orthodontist Checkup",
      description: "Wire adjustment and progress check.",
      start_time: new Date(y, m, d, 15, 30, 0).toISOString(),
      end_time: new Date(y, m, d, 16, 15, 0).toISOString(),
      all_day: false,
      event_type: 'event',
      location_name: "McCranels Orthodontics",
      status: 'confirmed',
    },
  ]

  const { error: evtErr } = await supabase.from('events').insert(events)
  if (evtErr) console.warn('Note on events insert:', evtErr.message)

  // 2. Link event members
  if (emme && owen && liv) {
    console.log('👥 Linking event members...')
    await supabase.from('event_members').insert([
      { event_id: evt1Id, family_member_id: emme.id, role: 'attendee', rsvp_status: 'accepted' },
      { event_id: evt2Id, family_member_id: owen.id, role: 'attendee', rsvp_status: 'accepted' },
      { event_id: evt3Id, family_member_id: owen.id, role: 'attendee', rsvp_status: 'accepted' },
      { event_id: evt4Id, family_member_id: liv.id, role: 'attendee', rsvp_status: 'accepted' },
    ])
  }

  // 3. Insert Actionable Conflicts
  console.log('⚡ Inserting diverse conflict cards...')
  const conflicts = [
    {
      id: crypto.randomUUID(),
      event_a_id: evt1Id,
      event_b_id: evt2Id,
      conflict_type: 'drive_time',
      severity: 3,
      description: "Needs a ride: Emme's Gymnastics pickup at 4:30 PM coincides with Owen's Soccer drop-off (Cheer Athletics → West Field)",
      resolved: false,
      resolution: null,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      event_a_id: evt3Id,
      event_b_id: evt4Id,
      conflict_type: 'overlap',
      severity: 2,
      description: "Time overlap: Owen's Piano Lesson overlaps with Liv's Orthodontist Appointment from 3:15 PM – 4:00 PM",
      resolved: false,
      resolution: null,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      event_a_id: evt2Id,
      event_b_id: null,
      conflict_type: 'gear_conflict',
      severity: 1,
      description: "Gear coordination: Owen's Soccer Tournament Kit & Cleats required before 4:30 PM departure",
      resolved: false,
      resolution: null,
      created_at: new Date().toISOString(),
    },
  ]

  const { error: confErr } = await supabase.from('conflicts').insert(conflicts)
  if (confErr) console.warn('Conflict insert warning:', confErr.message)

  // 4. Insert Actionable Prep & Task Items
  console.log('📋 Inserting diverse preparation & task cards...')
  const prepItems = [
    {
      id: crypto.randomUUID(),
      event_id: evt2Id,
      type: "school",
      event_title: "5th Grade Science Camp",
      source_type: "gmail",
      category: "forms_paperwork",
      description: "Sign & return 5th Grade Science Camp medical waiver & packing checklist for Owen (due today)",
      priority: 3,
      due_by: new Date(y, m, d, 17, 0, 0).toISOString(),
      dismissed: false,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      event_id: evt1Id,
      type: "sports",
      event_title: "Gymnastics Practice",
      source_type: "calendar_ai",
      category: "household_errands",
      description: "Pack Emme's gymnastics grips, gym bag & 32oz water bottle before 3:00 PM departure",
      priority: 2,
      due_by: new Date(y, m, d, 15, 0, 0).toISOString(),
      dismissed: false,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      event_id: null,
      type: "dish",
      event_title: "Family Dinner",
      source_type: "calendar_ai",
      category: "food_hosting",
      description: "Thaw & marinate flank steak for Fajita Night dinner (15 min prep)",
      priority: 1,
      due_by: new Date(y, m, d, 18, 30, 0).toISOString(),
      dismissed: false,
      created_at: new Date().toISOString(),
    },
    {
      id: crypto.randomUUID(),
      event_id: null,
      type: "reminder",
      event_title: "Daily Errand",
      source_type: "reminder_manual",
      category: "household_errands",
      description: "Pick up prescription refill and sunscreen from CVS on the drive home",
      priority: 1,
      due_by: new Date(y, m, d, 19, 0, 0).toISOString(),
      dismissed: false,
      created_at: new Date().toISOString(),
    },
  ]

  const { error: prepErr } = await supabase.from('prep_items').insert(prepItems)
  if (prepErr) console.warn('Prep insert warning:', prepErr.message)

  console.log('✅ Database seeded with active Action Hub example cards across all device views!')
}

seed().catch((err) => {
  console.error('❌ Seeding failed:', err)
  process.exit(1)
})
