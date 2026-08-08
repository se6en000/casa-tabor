import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildCalendarScoreScenarioGroups } from '../scripts/assistant-calendar-score-scenarios.mjs'

const qaRunner = readFileSync(new URL('../scripts/ai-assistant-qa-sweep.mjs', import.meta.url), 'utf8')
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))

const base = new Date('2026-08-07T12:00:00.000Z')
const fixtureTitles = [
  'Soccer practice',
  'Vet appointment',
  'School open house',
  'Dentist appointment',
  'Birthday dinner',
  'Airport pickup',
  'Library story time',
  'Piano recital',
  'PTA meeting',
  'Edge dentist appointment',
  'School meeting',
  'School pickup',
  'Recurring softball practice',
]
const fixtures = fixtureTitles.flatMap((title, index) => {
  const count = title === 'Edge dentist appointment' ? 2 : 1
  return Array.from({ length: count }, (_, duplicateIndex) => ({
    id: `${index}-${duplicateIndex}`,
    title: `[QA] ${title}`,
    start_time: new Date(base.getTime() + (index + 1) * 86400000 + duplicateIndex * 3600000).toISOString(),
    end_time: new Date(base.getTime() + (index + 1) * 86400000 + (duplicateIndex + 1) * 3600000).toISOString(),
    updated_at: 'v1',
  }))
})

test('calendar scorecard contains 50 unique management requests across core categories', () => {
  const groups = buildCalendarScoreScenarioGroups(fixtures, ['Jake', 'Owen'], base)
  const steps = groups.flatMap((group) => group.steps.map((step) => ({
    ...step,
    category: step.scoreCategory ?? group.scoreCategory,
  })))

  assert.equal(steps.length, 50)
  assert.equal(new Set(steps.map((step) => step.text.toLowerCase())).size, 50)
  assert.deepEqual(
    Object.fromEntries(
      [...new Set(steps.map((step) => step.category))]
        .sort()
        .map((category) => [category, steps.filter((step) => step.category === category).length]),
    ),
    {
      cancellation: 6,
      create: 10,
      edit: 10,
      follow_up: 6,
      read: 12,
      reminder: 6,
    },
  )
  assert.ok(steps.some((step) => /what's going on saturday/i.test(step.text)))
  assert.ok(steps.some((step) => /create|add|schedule|book/i.test(step.text)))
  assert.ok(steps.some((step) => /move|change|make it/i.test(step.text)))
  assert.ok(steps.some((step) => /delete|cancel/i.test(step.text)))
})

test('calendar scorecard is wired into the safe QA runner with category scoring', () => {
  assert.match(qaRunner, /'calendar-score'/)
  assert.match(qaRunner, /buildCalendarScoreScenarioGroups\(calendarFixtures, familyNames, now\)/)
  assert.match(qaRunner, /category_scores/)
  assert.match(qaRunner, /assistant_request_failed/)
  assert.equal(
    packageJson.scripts['qa:ai-assistant:calendar-score'],
    'node scripts/ai-assistant-qa-sweep.mjs --mode=calendar-score --model=gemini-2.5-flash',
  )
})
