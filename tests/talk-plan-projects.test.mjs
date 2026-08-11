import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  inferProjectTurn,
  PROJECT_EXTRACTOR_VERSION,
} from '../supabase/functions/_shared/talk-plan-project-extraction.mjs'

test('project extraction creates a bounded project with typed planning items', () => {
  const result = inferProjectTurn({
    id: 'message-1',
    role: 'user',
    content: 'Help me plan the Casa Tabor frame. My goal is to finish it this month. I decided to use oak. Next step is to measure the display.',
  })

  assert.equal(PROJECT_EXTRACTOR_VERSION, 'rules-v2')
  assert.equal(result?.title, 'Casa Tabor frame')
  assert.deepEqual(result?.items.map((item) => item.kind), ['goal', 'decision', 'next_action'])
  assert.equal(result?.items[2].content, 'measure the display')
})

test('project extraction ignores ordinary preferences and assistant messages', () => {
  assert.equal(inferProjectTurn({
    id: 'message-2',
    role: 'user',
    content: 'I prefer morning appointments after school drop-off.',
  }), null)
  assert.equal(inferProjectTurn({
    id: 'message-3',
    role: 'assistant',
    content: 'Help me plan the garden project.',
  }), null)
})

test('project extraction records changed decisions as superseding decisions', () => {
  const result = inferProjectTurn({
    id: 'message-4',
    role: 'user',
    content: 'I changed my mind: use walnut instead.',
  })
  assert.equal(result?.items[0].kind, 'decision')
  assert.equal(result?.items[0].supersedesPrior, true)
  assert.equal(result?.items[0].content, 'use walnut instead')
})

test('project extraction starts a distinct project when the user names a new goal', () => {
  const result = inferProjectTurn({
    id: 'message-5',
    role: 'user',
    content: 'No, create a new goal to book my anniversary trip this week.',
  })

  assert.equal(result?.title, 'Book anniversary trip')
  assert.equal(result?.items[0].kind, 'goal')
  assert.equal(result?.items[0].content, 'Book anniversary trip this week')
})

test('project schema is private, versioned, provenance-first, and lifecycle aware', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811220000_talk_plan_projects.sql', import.meta.url), 'utf8')
  assert.match(migration, /create table if not exists public\.ai_projects/i)
  assert.match(migration, /owner_member_id uuid not null/i)
  assert.match(migration, /version integer not null/i)
  assert.match(migration, /source_conversation_id uuid not null/i)
  assert.match(migration, /check \(status in \('active', 'paused', 'completed', 'archived', 'deleted'\)\)/i)
  assert.match(migration, /create table if not exists public\.ai_project_items/i)
  assert.match(migration, /source_message_client_id text not null/i)
  assert.match(migration, /create table if not exists public\.ai_project_revisions/i)
  assert.match(migration, /to service_role/i)
})

test('project schema permits multiple topic projects in one conversation', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811230000_multi_project_conversations.sql', import.meta.url), 'utf8')
  assert.match(migration, /drop constraint if exists ai_projects_owner_member_id_source_conversation_id_key/i)
  assert.match(migration, /alter column topic_key set not null/i)
  assert.match(migration, /owner_member_id, source_conversation_id, topic_key/i)
})

test('history gateway derives project ownership from the signed profile', () => {
  const source = readFileSync(new URL('../supabase/functions/assistant-history/index.ts', import.meta.url), 'utf8')
  assert.match(source, /action === 'list_projects'/)
  assert.match(source, /action === 'update_project'/)
  assert.match(source, /action === 'update_project_briefing'/)
  assert.match(source, /\.eq\('owner_member_id', memberId\)/)
  assert.match(source, /inferProjectTurn/)
  assert.match(source, /conversation\.experience_mode === 'talk_plan'/)
  assert.doesNotMatch(source, /body\?\.owner_member_id/)
})

test('project item resolution advances the project revision', () => {
  const source = readFileSync(new URL('../supabase/functions/assistant-history/index.ts', import.meta.url), 'utf8')
  const itemAction = source.split("if (action === 'update_project_item')")[1]?.split("if (action === 'delete_memory'")[0] ?? ''
  assert.match(itemAction, /version: project\.version \+ 1/)
  assert.match(itemAction, /addProjectRevision/)
})

test('project turn capture is idempotent when history persistence retries', () => {
  const migration = readFileSync(new URL('../supabase/migrations/20260811220000_talk_plan_projects.sql', import.meta.url), 'utf8')
  const source = readFileSync(new URL('../supabase/functions/assistant-history/index.ts', import.meta.url), 'utf8')
  assert.match(migration, /project_id, source_message_client_id, change_kind/i)
  assert.match(source, /\.eq\('source_message_client_id', message\.id\)/)
  assert.match(source, /if \(existingRevision\) return existing\?\.id/)
})

test('project capture selects a named topic or the most recently active topic', () => {
  const source = readFileSync(new URL('../supabase/functions/assistant-history/index.ts', import.meta.url), 'utf8')
  assert.match(source, /projectTopicKey\(inferred\.title\)/)
  assert.match(source, /\.eq\('topic_key', topicKey\)/)
  assert.match(source, /\.order\('last_activity_at', \{ ascending: false \}\)/)
  assert.doesNotMatch(source, /\.eq\('source_conversation_id', conversationId\)[\s\S]{0,100}\.maybeSingle\(\)/)
})

test('Mark decided resolves open decision questions before hiding the brief card', () => {
  const source = readFileSync(new URL('../supabase/functions/assistant-history/index.ts', import.meta.url), 'utf8')
  const briefingAction = source.split("if (action === 'update_project_briefing')")[1]?.split("if (action === 'update_project_item')")[0] ?? ''
  assert.match(briefingAction, /command === 'mark_decided'/)
  assert.match(briefingAction, /from\('ai_project_items'\)/)
  assert.match(briefingAction, /\.in\('kind', \['decision', 'open_question'\]\)/)
  assert.match(briefingAction, /status: 'decided'/)
})

test('Talk and Plan retrieves active projects only for the signed profile', () => {
  const source = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(source, /from\('ai_projects'\)/)
  assert.match(source, /\.eq\('owner_member_id', activeMemberId\)/)
  assert.match(source, /source_type: 'project'/)
  assert.match(source, /server_ai_assistant_project_retrieval_failed/)
})

test('briefing returns only actionable signed-profile projects', () => {
  const source = readFileSync(new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url), 'utf8')
  assert.match(source, /from\('ai_projects'\)/)
  assert.match(source, /\.eq\('owner_member_id', memberId\)/)
  assert.match(source, /briefing_state/)
  assert.match(source, /looking_ahead_projects/)
})

test('projects are managed under Memory and rendered in Looking ahead', () => {
  const routes = readFileSync(new URL('../src/components/shared/AnimatedRoutes.tsx', import.meta.url), 'utf8')
  const memory = readFileSync(new URL('../src/pages/MemorySettingsPage.tsx', import.meta.url), 'utf8')
  const projects = readFileSync(new URL('../src/pages/ProjectSettingsPage.tsx', import.meta.url), 'utf8')
  const briefing = readFileSync(new URL('../src/pages/BriefingPage.tsx', import.meta.url), 'utf8')
  assert.match(routes, /memory\/projects/)
  assert.match(memory, /Planning projects/)
  assert.match(projects, /Pause/)
  assert.match(projects, /Complete/)
  assert.match(projects, /Archive/)
  assert.match(projects, /Show in daily brief/)
  assert.match(projects, /reactivate/)
  assert.match(briefing, /Looking ahead/)
  assert.match(briefing, /Not relevant/)
  assert.match(briefing, /Mark decided/)
})
