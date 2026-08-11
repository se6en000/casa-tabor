import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  buildConversationRecord,
  buildConversationSummaryRecord,
  buildHistoryRequestOptions,
  sanitizeConversationMessage,
} from '../src/lib/assistantConversationHistory.mjs'
import {
  normalizeProfileSession,
  PROFILE_SESSION_STORAGE_KEY,
} from '../src/lib/profileSession.mjs'

test('private conversations are owned by one family member and expire after the configured retention period', () => {
  const createdAt = new Date('2026-08-11T16:00:00.000Z')
  const conversation = buildConversationRecord({
    id: 'conversation-1',
    ownerMemberId: 'member-1',
    title: 'Bimini anniversary getaway',
    experienceMode: 'talk_plan',
    createdAt,
  })

  assert.deepEqual(conversation, {
    id: 'conversation-1',
    owner_member_id: 'member-1',
    visibility: 'private',
    title: 'Bimini anniversary getaway',
    experience_mode: 'talk_plan',
    created_at: createdAt.toISOString(),
    expires_at: '2026-11-09T16:00:00.000Z',
  })
})

test('stored messages exclude transient rendering state and base64 image payloads', () => {
  assert.deepEqual(
    sanitizeConversationMessage({
      id: 'message-1',
      role: 'assistant',
      content: 'Here is the plan.',
      imageDataUrl: 'data:image/png;base64,secret-image',
      streaming: true,
      evidence: [{ evidenceId: 'evidence-1' }],
      toolAction: {
        tool: 'create_event',
        args: { title: 'Dinner' },
        displayText: 'Create Dinner',
        status: 'pending',
      },
    }),
    {
      id: 'message-1',
      role: 'assistant',
      content: 'Here is the plan.',
      evidence: [{ evidenceId: 'evidence-1' }],
      tool_action: {
        tool: 'create_event',
        args: { title: 'Dinner' },
        display_text: 'Create Dinner',
        status: 'pending',
      },
    },
  )
})

test('rolling summaries preserve bounded context without becoming retrievable family memory', () => {
  assert.deepEqual(
    buildConversationSummaryRecord({
      conversationId: 'conversation-1',
      throughMessageId: 'message-20',
      content: 'They prefer a $1,500 Bimini anniversary trip.',
    }),
    {
      conversation_id: 'conversation-1',
      through_message_id: 'message-20',
      content: 'They prefer a $1,500 Bimini anniversary trip.',
      retrieval_scope: 'conversation_only',
    },
  )
})

test('history requests send only the signed access token, never a PIN', () => {
  assert.deepEqual(buildHistoryRequestOptions('session-token'), {
    headers: { 'x-casa-history-session': 'session-token' },
  })
  assert.throws(() => buildHistoryRequestOptions(''), /history session/i)
})

test('member profile sessions remain valid until explicit logout or PIN revocation', () => {
  const gateway = readFileSync(
    new URL('../supabase/functions/assistant-history/index.ts', import.meta.url),
    'utf8',
  )
  const verifier = readFileSync(
    new URL('../supabase/functions/_shared/profile-session.mjs', import.meta.url),
    'utf8',
  )

  assert.match(verifier, /session\.expires_at !== undefined/)
  assert.match(verifier, /credential_version/)
  assert.match(gateway, /action === 'unlock'[\s\S]*?history_session_token[\s\S]*?credential_version: credential\.credential_version[\s\S]*?\}\)/)
})

test('a selected family profile remains available until explicit logout', () => {
  assert.equal(PROFILE_SESSION_STORAGE_KEY, 'casa_tabor_profile_session')
  assert.deepEqual(
    normalizeProfileSession({
      memberId: 'member-1',
      memberName: 'Jake',
      token: 'history-session-token',
    }),
    {
      memberId: 'member-1',
      memberName: 'Jake',
      token: 'history-session-token',
    },
  )
  assert.equal(normalizeProfileSession({ memberId: 'member-1', token: '' }), null)
})

test('conversation-history migration denies direct client access and excludes transcripts from family retrieval', () => {
  const source = readFileSync(
    new URL('../supabase/migrations/20260811170000_durable_private_conversations.sql', import.meta.url),
    'utf8',
  )

  assert.match(source, /create table if not exists public\.ai_conversations/i)
  assert.match(source, /owner_member_id uuid not null references public\.family_members\(id\)/i)
  assert.match(source, /visibility text not null default 'private' check \(visibility in \('private'\)\)/i)
  assert.match(source, /expires_at timestamptz not null/i)
  assert.match(source, /create table if not exists public\.ai_conversation_messages/i)
  assert.match(source, /create table if not exists public\.ai_conversation_summaries/i)
  assert.match(source, /retrieval_scope text not null default 'conversation_only'/i)
  assert.match(source, /alter table public\.ai_conversations enable row level security/i)
  assert.match(source, /to service_role/i)
  assert.doesNotMatch(source, /family_data_evidence/i)
  assert.match(source, /prune_expired_ai_conversations/i)
  assert.match(source, /delete from public\.ai_conversations/i)
  assert.match(source, /expires_at <= now\(\)/i)
  assert.match(source, /prune-expired-ai-conversations/i)
})

test('PIN credentials and the history gateway use server-only verification with a bootstrap guard', () => {
  const migration = readFileSync(
    new URL('../supabase/migrations/20260811171000_ai_history_pin_credentials.sql', import.meta.url),
    'utf8',
  )
  const gateway = readFileSync(
    new URL('../supabase/functions/assistant-history/index.ts', import.meta.url),
    'utf8',
  )

  assert.match(migration, /pin_salt text not null/i)
  assert.match(migration, /pin_hash text not null/i)
  assert.match(migration, /pin_iterations integer not null/i)
  assert.match(migration, /credential_version integer not null default 1/i)
  assert.match(migration, /to service_role/i)
  assert.match(gateway, /CASA_HISTORY_BOOTSTRAP_TOKEN/)
  assert.match(gateway, /AI_HISTORY_SESSION_SECRET/)
  assert.match(gateway, /PBKDF2/)
  assert.match(gateway, /credential_version/)
  assert.match(gateway, /assertHistorySession/)
  assert.match(gateway, /action === 'unlock_admin'/)
  assert.match(gateway, /action === 'set_member_pin'/)
  assert.doesNotMatch(gateway, /upsert\(\{[\s\S]*credential_kind: 'family_member'/)
  assert.match(gateway, /action === 'list_conversations'/)
  assert.match(gateway, /action === 'append_messages'/)
  assert.match(gateway, /inferPersonalMemoryCandidates/)
  assert.match(gateway, /PERSONAL_MEMORY_EXTRACTOR_VERSION/)
  assert.match(gateway, /source_conversation_id: conversationId/)
  assert.match(gateway, /action === 'forget_conversation'/)
  assert.match(gateway, /session\.role !== 'family_member'/)
  assert.match(gateway, /\.eq\('owner_member_id', session\.member_id\)/)
  assert.doesNotMatch(gateway, /pin_hash.*body/i)
})

test('the app profile, rather than the drawer, owns persistent private-history access', () => {
  const source = readFileSync(
    new URL('../src/hooks/useAIConversationHistory.ts', import.meta.url),
    'utf8',
  )
  const drawer = readFileSync(
    new URL('../src/components/shared/AIChatDrawer.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /useProfileSession/)
  assert.match(source, /if \(!access\) return/)
  assert.match(source, /create_conversation/)
  assert.match(source, /append_messages/)
  assert.match(source, /list_conversations/)
  assert.match(source, /get_conversation/)
  assert.match(source, /export_conversation/)
  assert.match(source, /archive_conversation/)
  assert.match(source, /forget_conversation/)
  assert.doesNotMatch(drawer, /Unlock private history/)
  assert.doesNotMatch(drawer, /historyPin/)
  assert.match(drawer, /Sign out/)
})

test('the launch gate keeps household-admin PIN enrollment reachable before a member profile exists', () => {
  const source = readFileSync(
    new URL('../src/components/shared/PinGate.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /Manage family PINs/)
  assert.match(source, /unlockAdmin/)
  assert.match(source, /set_member_pin/)
  assert.match(source, /function PinKeypad/)
  assert.match(source, /aria-label="Delete PIN digit"/)
})

test('family settings keeps PIN enrollment inside each existing member’s collapsible card', () => {
  const source = readFileSync(
    new URL('../src/pages/FamilySettingsPage.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /DisclosureSection/)
  assert.match(source, /Private conversation history/)
  assert.match(source, /set_member_pin/)
  assert.match(source, /unlock_admin/)
  assert.match(source, /setup_admin/)
})

test('automatic memory separates personal and household scope with private-conversation deletion cascades', () => {
  const source = readFileSync(
    new URL('../supabase/migrations/20260811190000_automatic_profile_memory.sql', import.meta.url),
    'utf8',
  )

  assert.match(source, /create table if not exists public\.ai_memories/i)
  assert.match(source, /scope text not null check \(scope in \('personal', 'household'\)\)/i)
  assert.match(source, /owner_member_id uuid references public\.family_members\(id\)/i)
  assert.match(source, /source_conversation_id uuid references public\.ai_conversations\(id\) on delete cascade/i)
  assert.match(source, /source_message_client_id text/i)
  assert.match(source, /unique \(source_conversation_id, source_message_client_id, extractor_version\)/i)
  assert.match(source, /scope = 'personal' and owner_member_id is not null/i)
  assert.match(source, /to service_role/i)
  const gateway = readFileSync(
    new URL('../supabase/functions/assistant-history/index.ts', import.meta.url),
    'utf8',
  )
  assert.match(gateway, /inferPersonalMemoryCandidates\(newMessages\)/)
  assert.match(gateway, /ignoreDuplicates: true/)
})

test('assistant retrieval blends signed-in personal memory with household memory', () => {
  const source = readFileSync(
    new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
    'utf8',
  )
  const client = readFileSync(
    new URL('../src/hooks/useAIAssistant.ts', import.meta.url),
    'utf8',
  )

  assert.match(source, /verifyProfileSessionToken/)
  assert.match(source, /x-casa-history-session/)
  assert.doesNotMatch(source, /context\?\.active_member_id/)
  assert.match(client, /'x-casa-history-session': profile\.token/)
  assert.match(source, /from\('ai_memories'\)/)
  assert.match(source, /scope\.eq\.household/)
  assert.match(source, /scope\.eq\.personal/)
})

test('Talk and Plan requests carry the private conversation id and retrieve only signed-profile history', () => {
  const assistant = readFileSync(
    new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
    'utf8',
  )
  const hook = readFileSync(
    new URL('../src/hooks/useAIAssistant.ts', import.meta.url),
    'utf8',
  )
  const historyHook = readFileSync(
    new URL('../src/hooks/useAIConversationHistory.ts', import.meta.url),
    'utf8',
  )

  assert.match(historyHook, /ensureConversation/)
  assert.match(hook, /private_conversation_id: privateConversationId/)
  assert.match(assistant, /requestsPriorConversationContext\(latestUserText\)/)
  assert.match(assistant, /\.eq\('owner_member_id', activeMemberId\)/)
  assert.match(assistant, /buildPriorConversationEvidence/)
})

test('Talk and Plan no longer claims durable private history is temporary', () => {
  const assistant = readFileSync(
    new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url),
    'utf8',
  )
  assert.doesNotMatch(assistant, /local and temporary in Phase 1/i)
  assert.match(assistant, /private conversation history/i)
})

test('briefing generation uses signed-in personal memory and scopes daily briefing requests by member', () => {
  const source = readFileSync(
    new URL('../supabase/functions/generate-briefing/index.ts', import.meta.url),
    'utf8',
  )
  const briefingPage = readFileSync(
    new URL('../src/pages/BriefingPage.tsx', import.meta.url),
    'utf8',
  )

  assert.match(source, /from\('ai_memories'\)/)
  assert.match(source, /verifyProfileSessionToken/)
  assert.match(source, /x-casa-history-session/)
  assert.doesNotMatch(source, /body\.member_id/)
  assert.match(source, /personal memory/i)
  assert.match(briefingPage, /useProfileSession/)
  assert.match(briefingPage, /'x-casa-history-session': profile\.token/)
})

test('settings includes a memory manager with personal plus household scoped rows', () => {
  const source = readFileSync(
    new URL('../src/pages/MemorySettingsPage.tsx', import.meta.url),
    'utf8',
  )
  const gateway = readFileSync(
    new URL('../supabase/functions/assistant-history/index.ts', import.meta.url),
    'utf8',
  )
  assert.match(source, /invokeAssistantHistory/)
  assert.match(source, /action: 'list_memories'/)
  assert.match(source, /action: 'delete_memory'/)
  assert.match(source, /action: 'correct_memory'/)
  assert.doesNotMatch(source, /\.from\('ai_memories'\)/)
  assert.match(gateway, /memory\.scope === 'personal'/)
  assert.match(gateway, /memberIsAdmin/)
})
