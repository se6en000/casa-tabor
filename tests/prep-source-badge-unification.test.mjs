import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { sourceBadge } from '../src/utils/prepSourceBadge.ts'

const homeRightPanel = readFileSync(new URL('../src/components/home/HomeRightPanel.tsx', import.meta.url), 'utf8')
const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

test('sourceBadge labels reminder_manual as Reminder', () => {
  assert.equal(sourceBadge({ source_type: 'reminder_manual' }).label, 'Reminder')
})

test('sourceBadge labels reminder_missed as Missed reminder', () => {
  assert.equal(sourceBadge({ source_type: 'reminder_missed' }).label, 'Missed reminder')
})

test('sourceBadge labels gmail as Email', () => {
  assert.equal(sourceBadge({ source_type: 'gmail' }).label, 'Email')
})

test('sourceBadge labels calendar_ai as Calendar', () => {
  assert.equal(sourceBadge({ source_type: 'calendar_ai' }).label, 'Calendar')
})

test('sourceBadge defaults null/undefined/unknown source_type to Calendar (matches ActionHubPage prior fallback)', () => {
  assert.equal(sourceBadge({ source_type: null }).label, 'Calendar')
  assert.equal(sourceBadge({ source_type: undefined }).label, 'Calendar')
})

test('sourceBadge falls back to System for a genuinely unrecognized source_type', () => {
  assert.equal(sourceBadge({ source_type: 'something_new' }).label, 'System')
})

test('sourceBadge labels merged conflict items as Scheduling conflict', () => {
  assert.equal(sourceBadge({ source_type: 'conflict' }).label, 'Scheduling conflict')
})

test('sourceBadge labels merged directory suggestion items as Directory suggestion', () => {
  assert.equal(sourceBadge({ source_type: 'directory_suggestion' }).label, 'Directory suggestion')
})

test('HomeRightPanel imports the shared sourceBadge instead of defining its own copy', () => {
  assert.match(homeRightPanel, /import \{ sourceBadge \} from '..\/..\/utils\/prepSourceBadge'/)
  assert.doesNotMatch(homeRightPanel, /^function sourceBadge\(/m)
})

test('ActionHubPage imports the shared sourceBadge instead of defining its own copy', () => {
  assert.match(actionHubPage, /import \{ sourceBadge \} from '..\/utils\/prepSourceBadge'/)
  assert.doesNotMatch(actionHubPage, /^function sourceBadge\(/m)
})
