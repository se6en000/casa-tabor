import { createClient } from '@supabase/supabase-js'
import { format, startOfDay, addDays, eachDayOfInterval } from 'date-fns'
import {
  deserializeRoutineFromAvailabilityRules,
  generateConsolidatedRoutineActionEvents,
  isRoutineDropoffException,
  isRoutinePickupException,
  getEstimatedDriveMinutes,
} from '../src/lib/familyRoutines.ts'

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://sjiejymuuuqzqukyeagk.supabase.co'
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNqaWVqeW11dXVxenF1a3llYWdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5MTY3MzIsImV4cCI6MjA5NTQ5MjczMn0.sfEpSQkkq7ZbIwjEffEfEKIir15RgqZMGILO_mF4XhM'

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

async function runValidationAudit() {
  console.log('=================================================================')
  console.log('🔍 Comprehensive Validation Audit: Calendar & Routine State')
  console.log('=================================================================\n')

  let errorsFound = 0
  let passes = 0

  function assert(condition, description) {
    if (!condition) {
      console.error(`❌ FAILED: ${description}`)
      errorsFound++
    } else {
      console.log(`✅ PASSED: ${description}`)
      passes++
    }
  }

  // 1. Fetch DB state
  const { data: members, error: memErr } = await supabase.from('family_members').select('*')
  if (memErr) throw memErr

  const { data: rules, error: ruleErr } = await supabase.from('member_availability_rules').select('*')
  if (ruleErr) throw ruleErr

  const startIso = '2026-08-18T00:00:00.000Z'
  const endIso = '2026-08-26T00:00:00.000Z'

  const { data: dbEvents, error: evErr } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, deleted_at, status, record_kind, google_event_id')
    .lt('start_time', endIso)
    .gt('end_time', startIso)
    .neq('record_kind', 'series_template')
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('start_time')

  if (evErr) throw evErr

  // ── AUDIT 1: DB Events Cleanliness ──
  console.log('\n--- AUDIT 1: Database Events Cleanliness ---')

  // A. No soft-deleted rows returned
  const deletedInResults = dbEvents.filter((e) => e.deleted_at !== null || e.status === 'cancelled')
  assert(deletedInResults.length === 0, `Query returns 0 deleted/cancelled rows (found ${deletedInResults.length})`)

  // B. No hardcoded standard daily drop-off rows in DB
  const standardDropInDb = dbEvents.filter((e) =>
    e.title.toLowerCase().includes('drop off emme & owen') ||
    e.title.toLowerCase().includes('drop off liv @ bak')
  )
  assert(standardDropInDb.length === 0, `DB contains 0 standard daily drop-off rows (found ${standardDropInDb.length})`)

  // C. No legacy "Pick up Emme @ Bak" rows in DB
  const emmeBakInDb = dbEvents.filter((e) => e.title.toLowerCase().includes('emme @ bak'))
  assert(emmeBakInDb.length === 0, `DB contains 0 legacy "Emme @ Bak" rows (found ${emmeBakInDb.length})`)

  // D. No duplicate Thursday late strings rows in DB
  const thuEvents = dbEvents.filter((e) => e.start_time.startsWith('2026-08-20') && e.title.toLowerCase().includes('string'))
  assert(thuEvents.length <= 1, `Thursday Aug 20 contains at most 1 Strings exception in DB (found ${thuEvents.length})`)

  // E. Tuesday strings start time is 7:00 AM EDT (11:00 UTC)
  const tueStrings = dbEvents.find((e) => e.start_time.startsWith('2026-08-18') && e.title.toLowerCase().includes('string'))
  if (tueStrings) {
    const tueStart = new Date(tueStrings.start_time)
    const tueHours = tueStart.getUTCHours() // 11 UTC = 7 AM EDT
    assert(tueHours === 11, `Tuesday Early Strings starts at 7:00 AM EDT / 11:00 UTC (actual UTC hour: ${tueHours})`)
  }

  // ── AUDIT 2: Availability Rules & Routine Configurations ──
  console.log('\n--- AUDIT 2: Availability Rules & Routine Configurations ---')

  const liv = members.find((m) => m.name.toLowerCase() === 'liv')
  const emme = members.find((m) => m.name.toLowerCase() === 'emme')
  const owen = members.find((m) => m.name.toLowerCase() === 'owen')

  const livRoutine = deserializeRoutineFromAvailabilityRules(liv.id, rules)
  const emmeRoutine = deserializeRoutineFromAvailabilityRules(emme.id, rules)
  const owenRoutine = deserializeRoutineFromAvailabilityRules(owen.id, rules)

  assert(Boolean(livRoutine), 'Liv has an active routine configured')
  assert(Boolean(emmeRoutine), 'Emme has an active routine configured')
  assert(Boolean(owenRoutine), 'Owen has an active routine configured')

  // Liv destination & syncMode
  assert(livRoutine?.venueName === 'Tri-Rail Station', `Liv destination is Tri-Rail Station (actual: "${livRoutine?.venueName}")`)
  assert(livRoutine?.syncMode === 'exceptions_only', `Liv syncMode is exceptions_only (actual: "${livRoutine?.syncMode}")`)
  assert((livRoutine?.dayOverrides?.length || 0) === 0, `Liv has 0 day overrides (standard daily schedule)`)

  // Owen destination & syncMode
  assert(owenRoutine?.venueName.includes('Palm Beach Public'), `Owen destination is Palm Beach Public`)
  assert(owenRoutine?.syncMode === 'exceptions_only', `Owen syncMode is exceptions_only`)
  assert((owenRoutine?.dayOverrides?.length || 0) === 0, `Owen has 0 day overrides (standard daily schedule)`)

  // Emme destination & exceptions
  assert(emmeRoutine?.venueName.includes('Palm Beach Public'), `Emme destination is Palm Beach Public`)
  assert(emmeRoutine?.syncMode === 'exceptions_only', `Emme syncMode is exceptions_only`)
  const emmeTueOverride = emmeRoutine?.dayOverrides?.find((o) => o.dayOfWeek === 2)
  const emmeThuOverride = emmeRoutine?.dayOverrides?.find((o) => o.dayOfWeek === 4)
  assert(Boolean(emmeTueOverride && emmeTueOverride.startLocal === '07:00'), `Emme has Tuesday 7:00 AM Early Strings override`)
  assert(Boolean(emmeThuOverride && emmeThuOverride.endLocal === '15:00'), `Emme has Thursday 3:00 PM Late Strings override`)

  // ── AUDIT 3: Full Calendar Projection Simulation (Aug 18 - 25) ──
  console.log('\n--- AUDIT 3: Calendar Projection Simulation (Aug 18 - 25) ---')

  const routines = [livRoutine, emmeRoutine, owenRoutine].filter(Boolean)
  const start = new Date('2026-08-18T04:00:00.000Z')
  const end = new Date('2026-08-26T04:00:00.000Z')

  const days = eachDayOfInterval({ start: startOfDay(start), end: startOfDay(new Date(end.getTime() - 1)) })

  const generatedRoutineEvents = days.flatMap((day) => {
    return generateConsolidatedRoutineActionEvents({
      routines,
      members,
      date: day,
      filterBySyncMode: true,
    })
  })

  // Group active DB events and generated routine events by date
  const allEventsByDate = new Map()

  for (const e of dbEvents) {
    const dStr = e.start_time.slice(0, 10)
    if (!allEventsByDate.has(dStr)) allEventsByDate.set(dStr, [])
    allEventsByDate.get(dStr).push({ ...e, source: 'db' })
  }

  for (const re of generatedRoutineEvents) {
    const dStr = re.start_time.slice(0, 10)
    if (!allEventsByDate.has(dStr)) allEventsByDate.set(dStr, [])
    // Check if already in DB (deduplication)
    const existing = allEventsByDate.get(dStr)
    const duplicate = existing.some((be) => {
      const beTitle = (be.title || '').toLowerCase()
      const reTitle = (re.title || '').toLowerCase()
      if (beTitle === reTitle) return true
      if (reTitle.includes('string') && beTitle.includes('string')) return true
      return false
    })
    if (!duplicate) {
      allEventsByDate.get(dStr).push({ ...re, source: 'routine' })
    }
  }

  // Validate day by day
  const dateList = ['2026-08-18', '2026-08-19', '2026-08-20', '2026-08-21']

  for (const dStr of dateList) {
    const dayEvents = allEventsByDate.get(dStr) || []
    console.log(`\n📅 Date: ${dStr} (Total visible events: ${dayEvents.length})`)
    for (const ev of dayEvents) {
      console.log(`   - [${ev.source.toUpperCase()}] ${ev.title} (${ev.start_time})`)
    }

    if (dStr === '2026-08-18') {
      // Tuesday: Must have Tuesday Early Strings, NO standard dropoff/pickup clutter
      const strings = dayEvents.find((e) => e.title.toLowerCase().includes('string'))
      assert(Boolean(strings), 'Tuesday has Early Strings event')
      const standardDrop = dayEvents.find((e) => e.title.toLowerCase().includes('drop off emme & owen'))
      assert(!standardDrop, 'Tuesday has NO standard dropoff card')
      const standardLiv = dayEvents.find((e) => e.title.toLowerCase().includes('pick up liv'))
      assert(!standardLiv, 'Tuesday has NO standard Liv pickup card')
    }

    if (dStr === '2026-08-19') {
      // Wednesday: Standard day -> ZERO routine dropoff or pickup cards
      const routineCards = dayEvents.filter((e) =>
        e.title.toLowerCase().includes('drop off emme') ||
        e.title.toLowerCase().includes('pick up liv') ||
        e.title.toLowerCase().includes('palm beach public') ||
        e.title.toLowerCase().includes('tri-rail')
      )
      assert(routineCards.length === 0, `Wednesday has 0 standard school routine cards (found ${routineCards.length})`)
    }

    if (dStr === '2026-08-20') {
      // Thursday: Exactly ONE late strings pickup exception card, NO morning dropoff clutter
      const morningDrop = dayEvents.find((e) => e.title.toLowerCase().includes('drop off emme'))
      assert(!morningDrop, 'Thursday has NO morning dropoff card')
      const stringsCards = dayEvents.filter((e) => e.title.toLowerCase().includes('string'))
      assert(stringsCards.length === 1, `Thursday has exactly 1 Late Strings pickup card (found ${stringsCards.length})`)
      if (stringsCards.length === 1) {
        const thuStart = new Date(stringsCards[0].start_time)
        const is3pm = thuStart.getUTCHours() === 19 // 19 UTC = 3:00 PM EDT
        assert(is3pm, `Thursday Late Strings event starts at 3:00 PM EDT / 19:00 UTC (actual UTC hour: ${thuStart.getUTCHours()})`)
      }
      const standardLiv = dayEvents.find((e) => e.title.toLowerCase().includes('pick up liv'))
      assert(!standardLiv, 'Thursday has NO standard Liv pickup card')
    }

    if (dStr === '2026-08-21') {
      // Friday: Standard day -> ZERO routine dropoff or pickup cards
      const routineCards = dayEvents.filter((e) =>
        e.title.toLowerCase().includes('drop off emme') ||
        e.title.toLowerCase().includes('pick up liv') ||
        e.title.toLowerCase().includes('palm beach public')
      )
      assert(routineCards.length === 0, `Friday has 0 standard school routine cards (found ${routineCards.length})`)
    }
  }

  // ── AUDIT 4: Departure Math Validation ──
  console.log('\n--- AUDIT 4: Departure Math Validation ---')

  const pbpDrive = getEstimatedDriveMinutes('Palm Beach Public Elementary School', '239 Cocoanut Row')
  assert(pbpDrive === 10, `PBP drive time is 10 minutes (actual: ${pbpDrive})`)

  // Target arrival 8:00 AM -> Departure 7:50 AM
  const arrival8am = new Date('2026-08-20T08:00:00.000-04:00')
  const dep8am = new Date(arrival8am.getTime() - pbpDrive * 60000)
  assert(dep8am.getHours() === 7 && dep8am.getMinutes() === 50, `8:00 AM arrival calculates departure as 7:50 AM`)

  // Target arrival 7:00 AM -> Departure 6:50 AM
  const arrival7am = new Date('2026-08-18T07:00:00.000-04:00')
  const dep7am = new Date(arrival7am.getTime() - pbpDrive * 60000)
  assert(dep7am.getHours() === 6 && dep7am.getMinutes() === 50, `7:00 AM arrival calculates departure as 6:50 AM`)

  // Target pickup 3:00 PM -> Departure 2:50 PM
  const pickup3pm = new Date('2026-08-20T15:00:00.000-04:00')
  const dep3pm = new Date(pickup3pm.getTime() - pbpDrive * 60000)
  assert(dep3pm.getHours() === 14 && dep3pm.getMinutes() === 50, `3:00 PM pickup calculates departure as 2:50 PM`)

  console.log('\n=================================================================')
  console.log(`📊 Final Audit Summary: ${passes} Passed, ${errorsFound} Failed`)
  console.log('=================================================================')

  if (errorsFound > 0) {
    process.exit(1)
  }
}

runValidationAudit().catch((err) => {
  console.error('Audit failed with error:', err)
  process.exit(1)
})
