import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const heroIntelSource = readFileSync(
  new URL('../src/hooks/useHeroIntelligence.ts', import.meta.url),
  'utf8',
)
const familyRoutineSource = readFileSync(
  new URL('../src/hooks/useFamilyRoutineIntelligence.ts', import.meta.url),
  'utf8',
)
const imminentWidgetSource = readFileSync(
  new URL('../src/components/canvas/widgets/ImminentTransitWidget.tsx', import.meta.url),
  'utf8',
)

test('Hero intelligence prioritizes imminent events (e.g. 6:30 AM workout or 7:30 PM evening event) over ambient launchpad/prep', () => {
  const imminentIdx = heroIntelSource.indexOf("if (isImminentUrgent) {")
  const morningIdx = heroIntelSource.indexOf("return 'morning_launchpad'")
  const tomorrowIdx = heroIntelSource.lastIndexOf("return 'tomorrow_readiness'")

  assert.ok(imminentIdx !== -1, 'isImminentUrgent must be evaluated in useHeroIntelligence')
  assert.ok(morningIdx !== -1, 'morning_launchpad must be evaluated in useHeroIntelligence')
  assert.ok(imminentIdx < morningIdx, 'isImminentUrgent MUST be checked before morning_launchpad to spotlight 6:30 AM workouts')
  assert.ok(imminentIdx < tomorrowIdx, 'isImminentUrgent MUST be checked before tomorrow_readiness to spotlight 7-9 PM evening events')
})

test('Hero intelligence terminates morning school routine immediately at school arrival time or 8:30 AM', () => {
  assert.match(
    heroIntelSource,
    /decimalTime\s*<\s*8\.5/,
    'useHeroIntelligence must gate morning_launchpad at decimalTime < 8.5 (8:30 AM)',
  )
  assert.match(
    familyRoutineSource,
    /decimalTime\s*<\s*8\.5/,
    'useFamilyRoutineIntelligence must gate morning phase at decimalTime < 8.5 (8:30 AM)',
  )
  assert.match(
    familyRoutineSource,
    /now\.getTime\(\)\s*>=\s*arrivalTime/,
    'useFamilyRoutineIntelligence must mark dropoff complete immediately upon arrivalTime',
  )
  assert.match(
    heroIntelSource,
    /!routineIntel\.allTodayDeparturesCompleted/,
    'useHeroIntelligence must stop morning_launchpad immediately when all dropoffs are completed',
  )
})

test('Hero ImminentTransitWidget renders Multi-Track Concurrent Events and Companion Ribbons', () => {
  assert.match(
    imminentWidgetSource,
    /Simultaneous Family Logistics/,
    'ImminentTransitWidget must support simultaneous family logistics with multi-event tracking',
  )
  assert.match(
    imminentWidgetSource,
    /School Launchpad Ahead/,
    'ImminentTransitWidget must render morning school dropoffs companion ribbon during early parent workouts',
  )
  assert.match(
    imminentWidgetSource,
    /Tomorrow at a Glance/,
    'ImminentTransitWidget must render tomorrow prep companion ribbon during live evening commitments',
  )
})

test('Hero intelligence provides clean weekend flow and daytime logistics fallbacks', () => {
  assert.match(heroIntelSource, /return 'weekend_flow'/)
  assert.match(heroIntelSource, /return 'daytime_logistics'/)
  assert.match(heroIntelSource, /return 'tomorrow_readiness'/)
})
