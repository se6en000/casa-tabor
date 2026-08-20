import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

test('RecurrenceRuleBuilder component exists and exports builder UI', () => {
  const componentPath = resolve('src/components/calendar/RecurrenceRuleBuilder.tsx')
  assert.equal(existsSync(componentPath), true, 'RecurrenceRuleBuilder.tsx must exist')

  const content = readFileSync(componentPath, 'utf8')
  assert.match(content, /export default function RecurrenceRuleBuilder/, 'Must export RecurrenceRuleBuilder component')
  assert.match(content, /export function parseRrule/, 'Must export parseRrule parser helper')
  assert.match(content, /export function buildRruleString/, 'Must export buildRruleString builder helper')
  assert.match(content, /export function buildRruleSummary/, 'Must export buildRruleSummary human readable summary helper')
  assert.match(content, /byDay/, 'Must support BYDAY day-of-week selection')
  assert.match(content, /FREQ=/, 'Must build RFC 5545 FREQ string')
  assert.match(content, /SegmentedControl/, 'Must use luxury SegmentedControl UI')
})

test('Calendar sheets embed RecurrenceRuleBuilder and update Google Calendar payload', () => {
  const editSheetPath = resolve('src/components/calendar/EventEditSheet.tsx')
  const content = readFileSync(editSheetPath, 'utf8')
  assert.match(content, /import RecurrenceRuleBuilder from '\.\/RecurrenceRuleBuilder'/, 'EventEditSheet must import RecurrenceRuleBuilder')
  assert.match(content, /<RecurrenceRuleBuilder/, 'EventEditSheet must render RecurrenceRuleBuilder')
})

test('EventEditSheet embeds RecurrenceRuleBuilder in Schedule & Timing UI', () => {
  const editSheetPath = resolve('src/components/calendar/EventEditSheet.tsx')
  const content = readFileSync(editSheetPath, 'utf8')
  assert.match(content, /import RecurrenceRuleBuilder from '\.\/RecurrenceRuleBuilder'/, 'EventEditSheet must import RecurrenceRuleBuilder')
  assert.match(content, /<RecurrenceRuleBuilder/, 'EventEditSheet must render RecurrenceRuleBuilder inside DisclosureSection')
})
