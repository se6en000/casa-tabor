import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatBugTrackerSummary,
  formatMemoryInsightsSummary,
  isBugTrackerReadRequest,
  isMemoryInsightsReadRequest,
  parseBugReportRequest,
  resolveBugReportRequest,
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
  const followUp = resolveBugReportRequest(
    'I need a way to jump multiple weeks or months on mobile without repeated taps.',
    'Create a bug report.',
  )
  assert.equal(followUp.kind, 'create')
  assert.equal(followUp.follow_up, true)
  assert.match(followUp.title, /jump multiple weeks/i)
  assert.equal(resolveBugReportRequest('Add milk to groceries.', 'Create a bug report.').kind, 'create')
  assert.equal(resolveBugReportRequest('Add milk to groceries.', 'Report a bug: the wheel is slow.').kind, 'none')
})

test('memory and bug summaries are deterministic and truthful', () => {
  const memoryText = formatMemoryInsightsSummary([
    { title: 'Owen focuses better after snack', scope: 'household' },
    { title: 'I prefer morning appointments', scope: 'personal' },
  ])
  const bugText = formatBugTrackerSummary([
    { title: 'Calendar card mismatch', status: 'open', severity: 'high' },
    { title: 'Swipe lag on wheel', status: 'in_progress', severity: 'medium' },
  ])
  assert.match(memoryText, /learned/i)
  assert.match(memoryText, /Owen focuses better/)
  assert.match(memoryText, /I prefer morning appointments/)
  assert.match(memoryText, /personal/i)
  assert.match(memoryText, /household/i)
  assert.match(bugText, /open\/in-progress/i)
  assert.match(bugText, /Calendar card mismatch/)
})

test('memory settings is the only user-facing preferences and memory destination', () => {
  const aiSettings = readFileSync(new URL('../src/pages/AISettingsPage.tsx', import.meta.url), 'utf8')
  const memorySettings = readFileSync(new URL('../src/pages/MemorySettingsPage.tsx', import.meta.url), 'utf8')
  const settingsShell = readFileSync(new URL('../src/components/settings/SettingsShell.tsx', import.meta.url), 'utf8')
  assert.doesNotMatch(aiSettings, /ai_memory_observations/)
  assert.doesNotMatch(aiSettings, />AI Memory</)
  assert.match(memorySettings, /Food & meal preferences/)
  assert.match(memorySettings, /create_memory/)
  assert.match(settingsShell, /label: 'Memory'/)
  assert.doesNotMatch(settingsShell, /label: 'Food Profile'/)
})

test('legacy observations are migrated and family indexing reads canonical memories', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811210000_consolidate_ai_memory.sql', import.meta.url), 'utf8')
  const indexer = readFileSync(new URL('../supabase/functions/index-family-data/index.ts', import.meta.url), 'utf8')
  const projection = readFileSync(new URL('../supabase/functions/_shared/family-data-projection.mjs', import.meta.url), 'utf8')
  assert.match(migration, /insert into public\.ai_memories/i)
  assert.match(migration, /from public\.ai_memory_observations/i)
  assert.match(migration, /family_data_project_ai_memories/i)
  assert.match(indexer, /from\('ai_memories'\)/)
  assert.doesNotMatch(indexer, /from\('ai_memory_observations'\)/)
  assert.match(projection, /row\.scope !== 'household'/)
})

// Oct 7: "Can you create a bug report for the UTC time zone reminder thing …" — D said "I've updated the bug report"
// and nothing was saved (the filing only ran in Talk & Plan). Now every lane files an explicit request, with the talk.
import { parseBugReportRequest as parseBug, resolveBugReportRequest as resolveBug, voiceBugReportRow } from '../supabase/functions/_shared/assistant-memory-insights.mjs'

test('bug reports by voice: Jake’s words file one, titled plainly; loose words never do', () => {
  const r = parseBug('Can you create a bug report for the UTC time zone reminder thing where you almost had me wish my sister a happy birthday a day before she was actually born?')
  assert.equal(r.kind, 'create')
  assert.equal(r.explicit, true)
  assert.equal(r.title, 'The UTC time zone reminder thing where you almost had me wish my sister a happy birthday a day before she was actually born')
  assert.deepEqual(parseBug('Can you create a bug report'), { kind: 'clarify', explicit: true })
  assert.equal(parseBug('That is a problem, can we move dinner to 7').explicit, false)
  assert.equal(parseBug('I found a bug in the kitchen').explicit, false)
  // The answer to "What happened?" is the report — only when the question came from an explicit ask.
  const followed = resolveBug('Heather’s birthday showed a day early', 'Can you create a bug report')
  assert.equal(followed.kind, 'create')
  assert.equal(followed.explicit, true)
  assert.equal(resolveBug('Heather’s birthday showed a day early', 'that is a bug').explicit, false)
})

test('a voice bug report carries the conversation before it, the page and who', () => {
  const row = voiceBugReportRow({ title: 'T', details: 'D', severity: 'medium' }, {
    messages: [{ role: 'system', content: 'x' }, ...Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `line ${i}` }))],
    page: 'wall', sessionId: 's', deviceId: 'd', memberName: 'Jake',
  })
  assert.equal(row.source, 'assistant')
  assert.equal(row.page, 'wall')
  assert.equal(row.member_name, 'Jake')
  assert.equal(row.transcript.length, 12)
  assert.deepEqual(row.transcript.at(-1), { role: 'assistant', text: 'line 13' })
})
