import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import path from 'node:path'

test('scan-gmail-inbox routes extracted events into prep_items suggestions, never auto-creating calendar events', () => {
  const filePath = path.resolve(process.cwd(), 'supabase/functions/scan-gmail-inbox/index.ts')
  assert.ok(fs.existsSync(filePath), 'scan-gmail-inbox/index.ts must exist')
  const content = fs.readFileSync(filePath, 'utf-8')

  // 1. Must define persistEventSuggestions helper
  assert.match(content, /async function persistEventSuggestions/, 'Must define persistEventSuggestions')

  // 2. Must persist source_pattern_key: 'event_suggestion' and type: 'appointment'
  assert.match(content, /source_pattern_key:\s*'event_suggestion'/, 'Must set source_pattern_key to event_suggestion')
  assert.match(content, /type:\s*'appointment'/, 'Must set type to appointment')

  // 3. Must NOT automatically insert into events table or dispatch create-google-event in the new_event block
  const newEventBlockMatch = content.match(/\/\/ ── INTENT: new_event \/ Event Suggestions Pipeline ───────────([\s\S]*?)\/\/ Record processed message state/)
  assert.ok(newEventBlockMatch, 'Must contain new_event suggestions pipeline block')
  const newEventBlock = newEventBlockMatch[1]
  assert.doesNotMatch(newEventBlock, /sb\.from\('events'\)\.insert/, 'Must NOT auto-insert into events table')
  assert.doesNotMatch(newEventBlock, /create-google-event/, 'Must NOT auto-invoke create-google-event')
  assert.match(newEventBlock, /persistEventSuggestions/, 'Must call persistEventSuggestions')
})

test('detectSuggestedEvent dynamically extracts suggestions from event_suggestion prep_items', async () => {
  const { detectSuggestedEvent } = await import('../src/utils/actionInspectionSynthesis.ts')

  // 1. Medical Appointment Suggestion from Gmail
  const docItem = {
    id: 'prep-doc-1',
    event_title: 'Dr Hanna Pediatric Checkup',
    description: 'Suggested Appointment: Dr Hanna Pediatric Checkup at Palm Beach Pediatrics — Annual sports physical',
    event_date: '2026-08-19T14:00:00.000Z',
    due_by: '2026-08-19T14:00:00.000Z',
    source_type: 'gmail',
    source_pattern_key: 'event_suggestion',
    category: 'medical_health',
    attention_vendor: 'Palm Beach Pediatrics',
  }

  const plan = detectSuggestedEvent(docItem)
  assert.ok(plan, 'Should detect suggested event plan')
  assert.equal(plan.title, 'Dr Hanna Pediatric Checkup')
  assert.equal(plan.date, '2026-08-19')
  assert.match(plan.displayDate, /Aug 19/)
  assert.equal(plan.location, 'Palm Beach Pediatrics')
  assert.equal(plan.confidence, 'high')

  // 2. School Event Suggestion
  const schoolItem = {
    id: 'prep-school-1',
    event_title: 'Bak MSOA Open House',
    description: 'Suggested Appointment: Bak MSOA Open House at Bak Middle School of the Arts — Meet the teachers',
    event_date: '2026-08-20T18:00:00.000Z',
    due_by: '2026-08-20T18:00:00.000Z',
    source_type: 'gmail',
    type: 'appointment',
    source_pattern_key: 'event_suggestion',
  }

  const schoolPlan = detectSuggestedEvent(schoolItem)
  assert.ok(schoolPlan, 'Should detect school event suggestion')
  assert.equal(schoolPlan.title, 'Bak MSOA Open House')
  assert.equal(schoolPlan.location, 'Bak Middle School of the Arts')
  assert.equal(schoolPlan.confidence, 'high')
})

test('ActionQueueWidget features 1-tap Add to Calendar for suggested event items', () => {
  const filePath = path.resolve(process.cwd(), 'src/components/canvas/widgets/ActionQueueWidget.tsx')
  const content = fs.readFileSync(filePath, 'utf-8')

  // 1. Must import CalendarPlus
  assert.match(content, /CalendarPlus/, 'Must import CalendarPlus icon')

  // 2. Must provide Add to Calendar button on the orange suggested event banner
  assert.match(content, /\+ Add to Calendar/, 'Must provide + Add to Calendar button label')

  // 3. Must invoke handle1TapAddCalendar on tap
  assert.match(content, /handle1TapAddCalendar/, 'Must define and call handle1TapAddCalendar')
  assert.match(content, /useCreateSuggestedEvent/, 'Must use useCreateSuggestedEvent hook')
})
