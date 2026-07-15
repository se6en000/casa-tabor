import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import rrulePackage from 'rrule'
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { createRecurrenceEngine } from '../supabase/functions/_shared/recurrence-engine-core.mjs'
import {
  applyReusablePatch,
  resolveEffectiveDetailBundle,
} from '../supabase/functions/_shared/recurrence-detail-bundle-core.mjs'

const migration = readFileSync(
  resolve('supabase/migrations/20260715193000_recurrence_v2_feature_flags.sql'),
  'utf8',
)
const clientFlags = readFileSync(resolve('src/lib/recurrenceFeatureFlags.ts'), 'utf8')
const edgeFlags = readFileSync(
  resolve('supabase/functions/_shared/recurrence-feature-flags.ts'),
  'utf8',
)
const schema = readFileSync(
  resolve('supabase/migrations/20260715194500_recurrence_v2_foundation.sql'),
  'utf8',
)
const { rrulestr } = rrulePackage
const recurrenceEngine = createRecurrenceEngine({ rrulestr, formatInTimeZone, fromZonedTime })

test('recurrence v2 rollout flags default off in storage and both runtimes', () => {
  for (const name of [
    'recurrence_v2_read',
    'recurrence_v2_write',
    'google_sync_v2',
    'recurrence_v2_delete',
  ]) {
    assert.match(migration, new RegExp(`'${name}', false`))
    assert.match(clientFlags, new RegExp(`${name}: false`))
    assert.match(edgeFlags, new RegExp(`${name}: false`))
  }
  assert.match(migration, /on conflict \(key\) do nothing/)
})

test('recurrence v2 flags fail closed and surface database errors', () => {
  assert.match(clientFlags, /source\[name\] === true/)
  assert.match(clientFlags, /throw new Error\(`Could not load recurrence feature flags:/)
  assert.match(edgeFlags, /source\.recurrence_v2_read === true/)
  assert.match(edgeFlags, /throw new Error\(`Could not load recurrence feature flags:/)
})

test('recurrence v2 schema separates series, occurrences, audit, and sync operations', () => {
  assert.match(schema, /create table if not exists public\.event_series/)
  assert.match(schema, /recurrence_lines jsonb/)
  assert.match(schema, /timezone text not null default 'America\/New_York'/)
  assert.match(schema, /record_kind in \('single', 'series_template', 'occurrence'\)/)
  assert.match(schema, /unique index if not exists events_series_occurrence_key_unique/)
  assert.match(schema, /exception_paths jsonb/)
  assert.match(schema, /create table if not exists public\.recurrence_mutation_history/)
  assert.match(schema, /action_id text not null unique/)
  assert.match(schema, /create table if not exists public\.calendar_sync_operations/)
  assert.match(schema, /unique \(action_id, operation_key\)/)
  assert.match(schema, /depends_on_operation_id uuid references public\.calendar_sync_operations/)
})

test('recurrence v2 schema supports reversible deletion and stable child definitions', () => {
  assert.match(schema, /deleted_at timestamptz/)
  assert.match(schema, /purge_after timestamptz/)
  assert.match(schema, /event_checklist_items[\s\S]*template_item_key uuid not null/)
  assert.match(schema, /event_action_items[\s\S]*template_item_key uuid not null/)
  assert.match(schema, /event_logistics[\s\S]*template_item_key uuid not null/)
})

test('recurrence engine keeps weekly wall time stable across daylight saving time', () => {
  const result = recurrenceEngine.generateOccurrences({
    dtstart: '2026-03-01T14:00:00.000Z',
    durationMs: 60 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    timezone: 'America/New_York',
    rangeStart: '2026-03-01T00:00:00.000Z',
    rangeEnd: '2026-03-20T00:00:00.000Z',
  })

  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.start), [
    '2026-03-01T14:00:00.000Z',
    '2026-03-08T13:00:00.000Z',
    '2026-03-15T13:00:00.000Z',
  ])
  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.occurrenceKey), [
    '2026-03-01T09:00:00[America/New_York]',
    '2026-03-08T09:00:00[America/New_York]',
    '2026-03-15T09:00:00[America/New_York]',
  ])
})

test('recurrence engine supports ordinal weekdays, RDATE, and EXDATE', () => {
  const ordinal = recurrenceEngine.generateOccurrences({
    dtstart: '2026-01-13T15:00:00.000Z',
    durationMs: 30 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=MONTHLY;BYDAY=2TU;COUNT=3'],
    timezone: 'America/New_York',
    rangeStart: '2026-01-01T00:00:00.000Z',
    rangeEnd: '2026-04-01T00:00:00.000Z',
  })
  assert.deepEqual(ordinal.occurrences.map((occurrence) => occurrence.occurrenceKey), [
    '2026-01-13T10:00:00[America/New_York]',
    '2026-02-10T10:00:00[America/New_York]',
    '2026-03-10T10:00:00[America/New_York]',
  ])

  const exceptions = recurrenceEngine.generateOccurrences({
    dtstart: '2026-01-05T14:00:00.000Z',
    durationMs: 60 * 60 * 1000,
    recurrenceLines: [
      'RRULE:FREQ=WEEKLY;COUNT=3',
      'EXDATE;TZID=America/New_York:20260112T090000',
      'RDATE;TZID=America/New_York:20260113T090000',
    ],
    timezone: 'America/New_York',
    rangeStart: '2026-01-01T00:00:00.000Z',
    rangeEnd: '2026-02-01T00:00:00.000Z',
  })
  assert.deepEqual(exceptions.occurrences.map((occurrence) => occurrence.occurrenceKey), [
    '2026-01-05T09:00:00[America/New_York]',
    '2026-01-13T09:00:00[America/New_York]',
    '2026-01-19T09:00:00[America/New_York]',
  ])
})

test('recurrence engine supports last-weekday rules and fall daylight saving time', () => {
  const lastFriday = recurrenceEngine.generateOccurrences({
    dtstart: '2026-01-30T17:00:00.000Z',
    durationMs: 45 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=MONTHLY;BYDAY=FR;BYSETPOS=-1;COUNT=3'],
    timezone: 'America/New_York',
    rangeStart: '2026-01-01T00:00:00.000Z',
    rangeEnd: '2026-04-01T00:00:00.000Z',
  })
  assert.deepEqual(lastFriday.occurrences.map((occurrence) => occurrence.occurrenceKey), [
    '2026-01-30T12:00:00[America/New_York]',
    '2026-02-27T12:00:00[America/New_York]',
    '2026-03-27T12:00:00[America/New_York]',
  ])

  const fallBack = recurrenceEngine.generateOccurrences({
    dtstart: '2026-10-25T13:00:00.000Z',
    durationMs: 60 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=WEEKLY;COUNT=3'],
    timezone: 'America/New_York',
    rangeStart: '2026-10-20T00:00:00.000Z',
    rangeEnd: '2026-11-15T00:00:00.000Z',
  })
  assert.deepEqual(fallBack.occurrences.map((occurrence) => occurrence.start), [
    '2026-10-25T13:00:00.000Z',
    '2026-11-01T14:00:00.000Z',
    '2026-11-08T14:00:00.000Z',
  ])
})

test('recurrence engine preserves all-day leap-day identity and reports truncation', () => {
  const result = recurrenceEngine.generateOccurrences({
    dtstart: '2024-02-29T00:00:00.000Z',
    durationMs: 24 * 60 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=YEARLY;COUNT=3'],
    timezone: 'America/New_York',
    rangeStart: '2024-01-01T00:00:00.000Z',
    rangeEnd: '2033-01-01T00:00:00.000Z',
    allDay: true,
    limit: 2,
  })

  assert.equal(result.truncated, true)
  assert.deepEqual(result.occurrences.map((occurrence) => occurrence.occurrenceKey), [
    '2024-02-29',
    '2028-02-29',
  ])
  assert.equal(result.occurrences[0].originalStartTime, null)
  assert.equal(result.occurrences[0].originalStartDate, '2024-02-29')
})

test('recurrence engine rejects unsupported rules and invalid timezones', () => {
  assert.throws(() => recurrenceEngine.generateOccurrences({
    dtstart: '2026-01-01T14:00:00.000Z',
    durationMs: 60 * 60 * 1000,
    recurrenceLines: ['DTSTART:20260101T090000'],
    timezone: 'America/New_York',
    rangeStart: '2026-01-01T00:00:00.000Z',
    rangeEnd: '2026-02-01T00:00:00.000Z',
  }), /Unsupported recurrence line/)

  assert.throws(() => recurrenceEngine.generateOccurrences({
    dtstart: '2026-01-01T14:00:00.000Z',
    durationMs: 60 * 60 * 1000,
    recurrenceLines: ['RRULE:FREQ=WEEKLY'],
    timezone: 'Not/A_Timezone',
    rangeStart: '2026-01-01T00:00:00.000Z',
    rangeEnd: '2026-02-01T00:00:00.000Z',
  }), /Invalid recurrence timezone/)
})

test('effective detail bundles preserve explicit exceptions and occurrence progress', () => {
  const template = {
    revision: 7,
    reusable: {
      event: { title: 'Therapy', locationName: 'Hope Center' },
      assignments: [{ familyMemberId: 'owen', role: 'primary' }],
      transportationPlan: { version: 1, legs: [{ driverName: 'Jake' }] },
      checklistDefinitions: [{ templateItemKey: 'water', label: 'Bring water' }],
    },
  }
  const occurrence = {
    seriesRevisionApplied: 6,
    exceptionPaths: ['transportationPlan'],
    reusable: {
      transportationPlan: { version: 1, legs: [{ driverName: 'Giselle' }] },
    },
    facts: {
      checklistProgress: [{ templateItemKey: 'water', checked: true }],
      weather: { summary: 'Rain' },
    },
  }

  const effective = resolveEffectiveDetailBundle({ template, occurrence })
  assert.equal(effective.reusable.event.title, 'Therapy')
  assert.equal(effective.reusable.transportationPlan.legs[0].driverName, 'Giselle')
  assert.equal(effective.facts.checklistProgress[0].checked, true)
  assert.equal(effective.facts.weather.summary, 'Rain')

  template.reusable.transportationPlan.legs[0].driverName = 'Kelly'
  assert.equal(effective.reusable.transportationPlan.legs[0].driverName, 'Giselle')
})

test('series patches update reusable definitions without accepting occurrence-only state', () => {
  const original = {
    event: { title: 'Therapy', locationName: 'Hope Center' },
    checklistDefinitions: [{ templateItemKey: 'water', label: 'Bring water' }],
  }
  const patched = applyReusablePatch(original, {
    event: { title: 'Behavior Therapy' },
    checklistDefinitions: [{ templateItemKey: 'water', label: 'Bring water bottle' }],
  }, ['event.title', 'checklistDefinitions'])

  assert.equal(original.event.title, 'Therapy')
  assert.equal(patched.event.title, 'Behavior Therapy')
  assert.equal(patched.event.locationName, 'Hope Center')
  assert.equal(patched.checklistDefinitions[0].label, 'Bring water bottle')

  assert.throws(() => applyReusablePatch(original, {
    checklistProgress: [{ templateItemKey: 'water', checked: true }],
  }, ['checklistProgress']), /not reusable/)
  assert.throws(() => resolveEffectiveDetailBundle({
    template: { revision: 1, reusable: { sync: { status: 'pending' } } },
    occurrence: { reusable: {}, facts: {}, exceptionPaths: [] },
  }), /Occurrence-only data/)
})
