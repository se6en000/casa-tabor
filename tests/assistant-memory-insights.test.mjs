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

test('ai assistant wires memory and bug summaries to the canonical memory table', () => {
  const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(source, /isMemoryInsightsReadRequest/)
  assert.match(source, /from\('ai_memories'\)/)
  assert.doesNotMatch(source, /from\('ai_memory_observations'\)/)
  assert.match(source, /from\('ai_bug_reports'\)/)
  assert.match(source, /server_ai_assistant_memory_bug_summary/)
  assert.match(source, /server_ai_assistant_bug_report_created/)
  assert.match(source, /write_verified: true/)
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
