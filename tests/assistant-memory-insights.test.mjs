import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatBugTrackerSummary,
  formatMemoryInsightsSummary,
  isBugTrackerReadRequest,
  isMemoryInsightsReadRequest,
  parseBugReportRequest,
} from '../supabase/functions/_shared/assistant-memory-insights.mjs'

test('memory and bug read intent detectors recognize natural phrasing', () => {
  assert.equal(isMemoryInsightsReadRequest('What did you learn about my family lately?'), true)
  assert.equal(isMemoryInsightsReadRequest('show memory insights'), true)
  assert.equal(isMemoryInsightsReadRequest('set an event for tomorrow'), false)
  assert.equal(isBugTrackerReadRequest('What bugs are open right now?'), true)
  assert.equal(isBugTrackerReadRequest('open bugs'), true)
  assert.equal(isBugTrackerReadRequest('show me bug tracker status'), true)
  assert.equal(isBugTrackerReadRequest('add milk to groceries'), false)
})

test('bug-report semantic boundary recognizes explicit creation language without stealing reads', () => {
  for (const phrase of [
    'Report a bug: the calendar wheel does not select the centered date',
    'Please file this issue: reminder completion does not update Prep and Action',
    'Log this defect: the app crashes when I save an event',
    'This is a bug: the driver on the card does not match event details',
    'Bug report: grocery sync is broken',
    'Put this in the bug tracker: the end date dial does not follow the start date',
  ]) {
    const parsed = parseBugReportRequest(phrase)
    assert.equal(parsed.kind, 'create', phrase)
    assert.ok(parsed.title.length > 0, phrase)
  }
  assert.equal(parseBugReportRequest('What bugs are open right now?').kind, 'none')
  assert.equal(parseBugReportRequest('Show me the bug tracker status').kind, 'none')
  assert.equal(parseBugReportRequest('The word bug is in this sentence.').kind, 'none')
  assert.equal(parseBugReportRequest('Report a bug').kind, 'clarify')
  assert.equal(parseBugReportRequest('Log this bug: the app crashes when I save an event').severity, 'high')
  assert.equal(
    parseBugReportRequest('Report a bug: BUG-FIXTURE-123 calendar wheel does not select').title,
    'BUG-FIXTURE-123 calendar wheel does not select',
  )
})

test('memory and bug summaries are deterministic and truthful', () => {
  const memoryText = formatMemoryInsightsSummary([
    { title: 'Owen focuses better after snack', status: 'active' },
    { title: 'Friday traffic spikes after 4pm', status: 'review' },
  ])
  const bugText = formatBugTrackerSummary([
    { title: 'Calendar card mismatch', status: 'open', severity: 'high' },
    { title: 'Swipe lag on wheel', status: 'in_progress', severity: 'medium' },
  ])
  assert.match(memoryText, /learned/i)
  assert.match(memoryText, /Owen focuses better/)
  assert.match(bugText, /open\/in-progress/i)
  assert.match(bugText, /Calendar card mismatch/)
})

test('ai assistant wires memory and bug summaries to authoritative tables', () => {
  const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(source, /isMemoryInsightsReadRequest/)
  assert.match(source, /from\('ai_memory_observations'\)/)
  assert.match(source, /from\('ai_bug_reports'\)/)
  assert.match(source, /server_ai_assistant_memory_bug_summary/)
  assert.match(source, /server_ai_assistant_bug_report_created/)
  assert.match(source, /write_verified: true/)
})
