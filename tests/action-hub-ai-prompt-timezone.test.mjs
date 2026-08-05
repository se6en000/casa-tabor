import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { formatDueByForAiPrompt, buildAiDraftPrompt } from '../src/utils/eventTime.ts'

// Regression coverage for a real bug: clicking "Create event"/"Create reminder"
// on a Prep/Action Hub item handed the AI chat drawer a raw UTC ISO timestamp
// (e.g. "2026-08-06T16:00:00.000Z") as free text. The AI read "16:00" as a
// literal local time instead of converting it from UTC, so the drafted event
// landed ~4-5 hours off from what the user actually saw on-screen (which
// already displayed correctly in Eastern Time via a separate formatter).
// Fix: format the due date into a compact, unambiguous "Due:" stamp
// ("2026-08-06 12:00 PM ET") that the server can deterministically parse,
// rather than relying on the AI's own date arithmetic.

test('formatDueByForAiPrompt produces an unambiguous compact Eastern-time stamp, not a raw UTC ISO string', () => {
  // 16:00 UTC on Aug 6 2026 is noon Eastern (EDT, UTC-4) in summer.
  const result = formatDueByForAiPrompt('2026-08-06T16:00:00.000Z')
  assert.match(result, /\bET$/)
  assert.match(result, /12:00 PM/)
  assert.match(result, /2026-08-06/)
  assert.doesNotMatch(result, /T16:00|Z$/)
})

test('formatDueByForAiPrompt handles missing due dates without throwing', () => {
  assert.equal(formatDueByForAiPrompt(null), 'unknown')
  assert.equal(formatDueByForAiPrompt(undefined), 'unknown')
})

test('buildAiDraftPrompt embeds a "Title:" and "Due:" field the server can parse deterministically', () => {
  const prompt = buildAiDraftPrompt({
    kind: 'reminder',
    title: 'Arrive by 11:32am',
    dueBy: '2026-08-05T15:32:00.000Z',
  })
  assert.match(prompt, /^Title: Arrive by 11:32am$/m)
  assert.match(prompt, /^Due: 2026-08-05 11:32 AM ET$/m)
})

const prepPanel = readFileSync(
  new URL('../src/components/home/PrepItemDetailPanel.tsx', import.meta.url),
  'utf8',
)
const actionHub = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

test('Prep item detail panel and Action Hub no longer hand the AI a raw ISO due_by timestamp', () => {
  for (const source of [prepPanel, actionHub]) {
    assert.match(source, /buildAiDraftPrompt/)
    assert.doesNotMatch(source, /Due by: \$\{item\.due_by/)
  }
}) 
