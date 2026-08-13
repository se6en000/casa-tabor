import { createClient } from 'npm:@supabase/supabase-js@2'

import { requireEnv } from '../_shared/env.ts'
import {
  createProfileSessionToken,
  verifyProfileSessionToken,
} from '../_shared/profile-session.mjs'
import {
  inferPersonalMemoryCandidates,
  PERSONAL_MEMORY_EXTRACTOR_VERSION,
} from '../_shared/personal-memory-extraction.mjs'
import {
  inferProjectTurn,
  PROJECT_EXTRACTOR_VERSION,
  projectTopicKey,
} from '../_shared/talk-plan-project-extraction.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-casa-history-session',
}

const PIN_ITERATIONS = 310_000
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const encoder = new TextEncoder()

type HistorySession = {
  role: 'household_admin' | 'family_member'
  member_id: string | null
  credential_version: number
  expires_at?: number
}

type StoredMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  evidence: unknown[]
  sources_considered: unknown[]
  partial_sources: unknown[]
  conversation_state: Record<string, unknown> | null
  tool_action: Record<string, unknown> | null
}

function compactText(value: unknown, max = 240) {
  return String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

function summarizeConversation(messages: StoredMessage[]) {
  const userTurns = messages
    .filter((message) => message.role === 'user')
    .map((message) => compactText(message.content, 220))
    .filter(Boolean)
  if (userTurns.length === 0) return null
  const first = userTurns[0]
  const latest = userTurns[userTurns.length - 1]
  if (!latest || first === latest) return first
  return `${first} — Latest focus: ${latest}`.slice(0, 320)
}

function conversationDisplayTitle(title: string, summary: string | null) {
  const normalized = compactText(title, 160)
  if (
    normalized &&
    !/^new conversation$/i.test(normalized) &&
    !/^respond via text\b/i.test(normalized)
  ) {
    return normalized
  }
  if (!summary) return normalized || 'Conversation'
  const fallback = summary.split(/[.!?]/)[0]?.trim() ?? summary
  return compactText(fallback, 120) || 'Conversation'
}

function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json' },
  })
}

function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required`)
  return value.trim()
}

function validPin(value: unknown) {
  return typeof value === 'string' && /^\d{6,12}$/.test(value)
}

function base64url(bytes: Uint8Array) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function fromBase64url(value: string) {
  const padding = '='.repeat((4 - (value.length % 4)) % 4)
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + padding)
  return Uint8Array.from(binary, (character) => character.charCodeAt(0))
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false
  let result = 0
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index]
  return result === 0
}

async function derivePinHash(pin: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey('raw', encoder.encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2',
    hash: 'SHA-256',
    salt,
    iterations,
  }, material, 256)
  return new Uint8Array(bits)
}

async function pinCredential(pin: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const hash = await derivePinHash(pin, salt, PIN_ITERATIONS)
  return {
    pin_salt: base64url(salt),
    pin_hash: base64url(hash),
    pin_iterations: PIN_ITERATIONS,
  }
}

async function matchesPin(pin: string, credential: {
  pin_salt: string
  pin_hash: string
  pin_iterations: number
}) {
  const actual = await derivePinHash(pin, fromBase64url(credential.pin_salt), credential.pin_iterations)
  return constantTimeEqual(actual, fromBase64url(credential.pin_hash))
}

async function createHistorySession(session: HistorySession) {
  return createProfileSessionToken({
    session,
    secret: requireEnv('AI_HISTORY_SESSION_SECRET'),
  })
}

async function assertHistorySession(request: Request, sb: ReturnType<typeof createClient>) {
  const token = request.headers.get('x-casa-history-session')?.trim()
  return verifyProfileSessionToken({
    token,
    secret: requireEnv('AI_HISTORY_SESSION_SECRET'),
    loadCredentialVersion: async (session: HistorySession) => {
      const credentialQuery = sb
        .from('ai_history_pin_credentials')
        .select('credential_version')
        .eq('credential_kind', session.role)
      const { data: credential, error } = session.role === 'family_member'
        ? await credentialQuery.eq('member_id', session.member_id).maybeSingle()
        : await credentialQuery.is('member_id', null).maybeSingle()
      if (error) throw error
      return credential?.credential_version ?? null
    },
  }) as Promise<HistorySession>
}

function requireMemberSession(session: HistorySession) {
  if (session.role !== 'family_member' || !session.member_id) {
    throw new Error('Unlock a family member’s private history first.')
  }
  return session.member_id
}

function sanitizeMessage(value: unknown): StoredMessage {
  if (!value || typeof value !== 'object') throw new Error('Each message must be an object.')
  const message = value as Record<string, unknown>
  const id = requiredText(message.id, 'message.id')
  const content = typeof message.content === 'string' ? message.content.trim() : ''
  if (content.length > 12000) throw new Error('Messages must be 12,000 characters or fewer.')
  const array = (field: string) => Array.isArray(message[field]) ? message[field] : []
  const object = (field: string) => (
    message[field] && typeof message[field] === 'object' && !Array.isArray(message[field])
      ? message[field] as Record<string, unknown>
      : null
  )
  return {
    id,
    role: message.role === 'assistant' ? 'assistant' : 'user',
    content,
    evidence: array('evidence'),
    sources_considered: array('sources_considered'),
    partial_sources: array('partial_sources'),
    conversation_state: object('conversation_state'),
    tool_action: object('tool_action'),
  }
}

async function ownedConversation(
  sb: ReturnType<typeof createClient>,
  conversationId: string,
  memberId: string,
) {
  const { data, error } = await sb
    .from('ai_conversations')
    .select('id,title,experience_mode')
    .eq('id', conversationId)
    .eq('owner_member_id', memberId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Conversation not found.')
  return data
}

async function memberIsAdmin(
  sb: ReturnType<typeof createClient>,
  memberId: string,
) {
  const { data, error } = await sb
    .from('family_members')
    .select('is_admin')
    .eq('id', memberId)
    .maybeSingle()
  if (error) throw error
  return data?.is_admin === true
}

async function ownedProject(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  memberId: string,
) {
  const { data, error } = await sb
    .from('ai_projects')
    .select('id,title,summary,status,briefing_state,version,source_conversation_id')
    .eq('id', projectId)
    .eq('owner_member_id', memberId)
    .neq('status', 'deleted')
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Project not found.')
  return data
}

async function addProjectRevision(
  sb: ReturnType<typeof createClient>,
  project: {
    id: string
    version: number
    source_conversation_id: string
    title: string
    summary: string
    status: string
    briefing_state: string
  },
  changeKind: string,
  sourceMessageId: string | null = null,
) {
  const { error } = await sb.from('ai_project_revisions').insert({
    project_id: project.id,
    version: project.version,
    source_conversation_id: project.source_conversation_id,
    source_message_client_id: sourceMessageId,
    change_kind: changeKind,
    snapshot: {
      title: project.title,
      summary: project.summary,
      status: project.status,
      briefing_state: project.briefing_state,
    },
  })
  if (error) throw error
}

async function persistProjectTurn(
  sb: ReturnType<typeof createClient>,
  memberId: string,
  conversationId: string,
  message: StoredMessage,
  conversationTitle?: string,
  temporalOptions: { now: Date; utcOffset: string } = { now: new Date(), utcOffset: '-04:00' },
) {
  const inferred = inferProjectTurn(message, { conversationTitle, ...temporalOptions })
  if (!inferred) return null
  const topicKey = inferred.title ? projectTopicKey(inferred.title) : null
  let existingQuery = sb
    .from('ai_projects')
    .select('id,title,summary,status,briefing_state,version,source_conversation_id,topic_key')
    .eq('owner_member_id', memberId)
    .eq('source_conversation_id', conversationId)
    .neq('status', 'deleted')
  existingQuery = topicKey
    ? existingQuery.eq('topic_key', topicKey)
    : existingQuery.order('last_activity_at', { ascending: false }).limit(1)
  const { data: existingRows, error: existingError } = await existingQuery
  if (existingError) throw existingError
  const existing = existingRows?.[0] ?? null
  if (!existing && !inferred.title) return null
  if (existing) {
    const { data: existingRevision, error: revisionError } = await sb
      .from('ai_project_revisions')
      .select('id')
      .eq('project_id', existing.id)
      .eq('source_message_client_id', message.id)
      .maybeSingle()
    if (revisionError) throw revisionError
    if (existingRevision) return existing?.id
  }

  let project = existing
  if (!project) {
    const { data, error } = await sb
      .from('ai_projects')
      .insert({
        owner_member_id: memberId,
        source_conversation_id: conversationId,
        topic_key: topicKey,
        title: inferred.title,
        summary: inferred.summary ?? '',
        target_date: inferred.temporalEvidence?.rangeStart ?? null,
        temporal_evidence: inferred.temporalEvidence,
      })
      .select('id,title,summary,status,briefing_state,version,source_conversation_id,topic_key')
      .single()
    if (error) throw error
    project = data
    await addProjectRevision(sb, project, 'created', message.id)
  } else {
    const version = project.version + 1
    const { data, error } = await sb
      .from('ai_projects')
      .update({
        version,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...(inferred.temporalEvidence
          ? {
              target_date: inferred.temporalEvidence.rangeStart,
              temporal_evidence: inferred.temporalEvidence,
            }
          : {}),
      })
      .eq('id', project.id)
      .eq('owner_member_id', memberId)
      .select('id,title,summary,status,briefing_state,version,source_conversation_id,topic_key')
      .single()
    if (error) throw error
    project = data
    await addProjectRevision(sb, project, 'turn_captured', message.id)
  }

  if (inferred.items.some((item) => item.supersedesPrior)) {
    const { error } = await sb
      .from('ai_project_items')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('project_id', project.id)
      .eq('kind', 'decision')
      .eq('status', 'open')
    if (error) throw error
  }
  if (inferred.items.length > 0) {
    const { error } = await sb.from('ai_project_items').upsert(
      inferred.items.map((item) => ({
        project_id: project.id,
        source_conversation_id: conversationId,
        source_message_client_id: message.id,
        extractor_version: PROJECT_EXTRACTOR_VERSION,
        kind: item.kind,
        content: item.content,
        due_at: null,
        temporal_evidence: inferred.temporalEvidence,
      })),
      {
        onConflict: 'project_id,source_message_client_id,extractor_version,kind',
        ignoreDuplicates: true,
      },
    )
    if (error) throw error
  }
  return project.id
}

async function verifyCredential(
  sb: ReturnType<typeof createClient>,
  credential: {
    id: string
    pin_salt: string
    pin_hash: string
    pin_iterations: number
    credential_version: number
    failed_attempt_count: number
    locked_until: string | null
  },
  pin: string,
) {
  if (credential.locked_until && new Date(credential.locked_until).getTime() > Date.now()) {
    throw new Error('Too many attempts. Try again in 15 minutes.')
  }
  const matches = await matchesPin(pin, credential)
  if (!matches) {
    const failedAttemptCount = credential.failed_attempt_count + 1
    await sb.from('ai_history_pin_credentials').update({
      failed_attempt_count: failedAttemptCount,
      locked_until: failedAttemptCount >= MAX_FAILED_ATTEMPTS
        ? new Date(Date.now() + LOCKOUT_MS).toISOString()
        : null,
    }).eq('id', credential.id)
    throw new Error('That PIN is not correct.')
  }
  await sb.from('ai_history_pin_credentials').update({
    failed_attempt_count: 0,
    locked_until: null,
  }).eq('id', credential.id)
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' })

  const sb = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'))
  try {
    const body = await request.json()
    const action = requiredText(body?.action, 'action')

    if (action === 'setup_admin') {
      const bootstrapToken = requiredText(body?.bootstrap_token, 'bootstrap_token')
      const expectedBootstrapToken = requireEnv('CASA_HISTORY_BOOTSTRAP_TOKEN')
      if (!constantTimeEqual(encoder.encode(bootstrapToken), encoder.encode(expectedBootstrapToken))) {
        return json(401, { error: 'Setup is not authorized.' })
      }
      if (!validPin(body?.pin)) return json(400, { error: 'Choose a 6 to 12 digit PIN.' })
      const { data: existing, error } = await sb
        .from('ai_history_pin_credentials')
        .select('id')
        .eq('credential_kind', 'household_admin')
        .maybeSingle()
      if (error) throw error
      if (existing) return json(409, { error: 'The household admin PIN has already been set.' })
      const credential = await pinCredential(body.pin)
      const { error: insertError } = await sb.from('ai_history_pin_credentials').insert({
        credential_kind: 'household_admin',
        ...credential,
      })
      if (insertError) throw insertError
      return json(201, { status: 'admin_pin_configured' })
    }

    if (action === 'unlock') {
      const memberId = requiredText(body?.member_id, 'member_id')
      if (!validPin(body?.pin)) return json(400, { error: 'Enter your 6 to 12 digit PIN.' })
      const { data: credential, error } = await sb
        .from('ai_history_pin_credentials')
        .select('id,pin_salt,pin_hash,pin_iterations,credential_version,failed_attempt_count,locked_until')
        .eq('credential_kind', 'family_member')
        .eq('member_id', memberId)
        .maybeSingle()
      if (error) throw error
      if (!credential) return json(404, { error: 'Private history has not been set up for this family member.' })
      await verifyCredential(sb, credential, body.pin)
      return json(200, {
        history_session_token: await createHistorySession({
          role: 'family_member',
          member_id: memberId,
          credential_version: credential.credential_version,
        }),
      })
    }

    if (action === 'unlock_admin') {
      if (!validPin(body?.pin)) return json(400, { error: 'Enter your 6 to 12 digit PIN.' })
      const { data: credential, error } = await sb
        .from('ai_history_pin_credentials')
        .select('id,pin_salt,pin_hash,pin_iterations,credential_version,failed_attempt_count,locked_until')
        .eq('credential_kind', 'household_admin')
        .is('member_id', null)
        .maybeSingle()
      if (error) throw error
      if (!credential) return json(404, { error: 'The household admin PIN has not been configured.' })
      await verifyCredential(sb, credential, body.pin)
      return json(200, {
        history_session_token: await createHistorySession({
          role: 'household_admin',
          member_id: null,
          credential_version: credential.credential_version,
        }),
      })
    }

    if (action === 'set_member_pin') {
      const session = await assertHistorySession(request, sb)
      if (session.role !== 'household_admin') return json(403, { error: 'Household admin access is required.' })
      const memberId = requiredText(body?.member_id, 'member_id')
      if (!validPin(body?.pin)) return json(400, { error: 'Choose a 6 to 12 digit PIN.' })
      const { data: member, error: memberError } = await sb
        .from('family_members')
        .select('id')
        .eq('id', memberId)
        .maybeSingle()
      if (memberError) throw memberError
      if (!member) return json(404, { error: 'Family member not found.' })
      const credential = await pinCredential(body.pin)
      const { data: existing, error: existingError } = await sb
        .from('ai_history_pin_credentials')
        .select('credential_version')
        .eq('credential_kind', 'family_member')
        .eq('member_id', memberId)
        .maybeSingle()
      if (existingError) throw existingError
      const nextCredential = {
        credential_kind: 'family_member',
        member_id: memberId,
        credential_version: (existing?.credential_version ?? 0) + 1,
        failed_attempt_count: 0,
        locked_until: null,
        ...credential,
      }
      const { error: saveError } = existing
        ? await sb.from('ai_history_pin_credentials').update(nextCredential).eq('id', existing.id)
        : await sb.from('ai_history_pin_credentials').insert(nextCredential)
      if (saveError) throw saveError
      return json(200, { status: 'member_pin_configured' })
    }

    if (action === 'list_conversations') {
      const session = await assertHistorySession(request, sb)
      requireMemberSession(session)
      const { data, error } = await sb
        .from('ai_conversations')
        .select('id,title,experience_mode,created_at,updated_at,archived_at,expires_at,ai_conversation_summaries(content,created_at)')
        .eq('owner_member_id', session.member_id)
        .is('deleted_at', null)
        .order('created_at', { foreignTable: 'ai_conversation_summaries', ascending: false })
        .limit(1, { foreignTable: 'ai_conversation_summaries' })
        .order('updated_at', { ascending: false })
        .limit(100)
      if (error) throw error
      const conversations = (data ?? []).map((c) => ({
        ...c,
        summary: c.ai_conversation_summaries?.[0]?.content ?? null,
        display_title: conversationDisplayTitle(c.title, c.ai_conversation_summaries?.[0]?.content ?? null),
      }))
      return json(200, { conversations })
    }

    if (action === 'list_memories') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const isAdmin = await memberIsAdmin(sb, memberId)
      const { data, error } = await sb
        .from('ai_memories')
        .select('id,scope,title,content,category,confidence,updated_at')
        .eq('status', 'active')
        .or(`scope.eq.household,and(scope.eq.personal,owner_member_id.eq.${memberId})`)
        .order('updated_at', { ascending: false })
        .limit(60)
      if (error) throw error
      return json(200, {
        memories: (data ?? []).map((memory) => ({
          ...memory,
          can_manage: memory.scope === 'personal' || isAdmin,
        })),
      })
    }

    if (action === 'create_memory') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const scope = body?.scope === 'household' ? 'household' : 'personal'
      if (scope === 'household' && !(await memberIsAdmin(sb, memberId))) {
        throw new Error('Household memory can only be added by a household admin.')
      }
      const title = requiredText(body?.title, 'title').slice(0, 160)
      const content = requiredText(body?.content, 'content').slice(0, 2000)
      const { data, error } = await sb
        .from('ai_memories')
        .insert({
          scope,
          owner_member_id: scope === 'personal' ? memberId : null,
          title,
          content,
          category: 'preference',
          confidence: 1,
          extractor_version: 'manual-v1',
        })
        .select('id')
        .single()
      if (error) throw error
      return json(200, { memory_id: data.id, status: 'created' })
    }

    if (action === 'list_projects') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const { data, error } = await sb
        .from('ai_projects')
        .select('id,title,summary,status,briefing_state,briefing_snoozed_until,target_date,version,last_activity_at,source_conversation_id,ai_project_items(id,kind,content,status,due_at,created_at)')
        .eq('owner_member_id', memberId)
        .neq('status', 'deleted')
        .order('last_activity_at', { ascending: false })
        .limit(40)
      if (error) throw error
      return json(200, { projects: data ?? [] })
    }

    if (action === 'create_project') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const title = requiredText(body?.title, 'title').slice(0, 160)
      const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 2000) : ''
      const targetDate = typeof body?.target_date === 'string' && body.target_date ? body.target_date : null
      const topicKey = projectTopicKey(title)

      let conversationId = typeof body?.source_conversation_id === 'string' && body.source_conversation_id ? body.source_conversation_id : null
      if (!conversationId) {
        const expiresAt = new Date(Date.now())
        expiresAt.setUTCDate(expiresAt.getUTCDate() + 90)
        const { data: newConvo, error: convoError } = await sb
          .from('ai_conversations')
          .insert({
            owner_member_id: memberId,
            title,
            experience_mode: 'talk_plan',
            expires_at: expiresAt.toISOString(),
          })
          .select('id')
          .single()
        if (convoError) throw convoError
        conversationId = newConvo.id
      }

      const { data: project, error } = await sb
        .from('ai_projects')
        .insert({
          owner_member_id: memberId,
          source_conversation_id: conversationId,
          topic_key: topicKey,
          title,
          summary,
          target_date: targetDate,
        })
        .select('id,title,summary,status,briefing_state,version,source_conversation_id,topic_key')
        .single()
      if (error) throw error
      await addProjectRevision(sb, project, 'created', null)

      const items = Array.isArray(body?.items) ? body.items : []
      if (items.length > 0) {
        const { error: itemsError } = await sb.from('ai_project_items').insert(
          items.map((item: Record<string, unknown>) => ({
            project_id: project.id,
            source_conversation_id: conversationId,
            source_message_client_id: 'manual-entry',
            extractor_version: 'manual-v1',
            kind: ['goal', 'decision', 'commitment', 'open_question', 'next_action'].includes(String(item.kind))
              ? String(item.kind)
              : 'next_action',
            content: requiredText(item.content, 'item.content').slice(0, 1000),
          }))
        )
        if (itemsError) throw itemsError
      }

      return json(201, { project })
    }

    if (action === 'update_project') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const projectId = requiredText(body?.project_id, 'project_id')
      const project = await ownedProject(sb, projectId, memberId)
      const nextStatus = typeof body?.status === 'string' ? body.status : project.status
      if (!['active', 'paused', 'completed', 'archived'].includes(nextStatus)) {
        throw new Error('Project status is invalid.')
      }
      const title = typeof body?.title === 'string' ? requiredText(body.title, 'title').slice(0, 160) : project.title
      const summary = typeof body?.summary === 'string' ? body.summary.trim().slice(0, 2000) : project.summary
      const version = project.version + 1
      const { data, error } = await sb
        .from('ai_projects')
        .update({
          title,
          summary,
          status: nextStatus,
          target_date: typeof body?.target_date === 'string' && body.target_date ? body.target_date : null,
          version,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('owner_member_id', memberId)
        .select('id,title,summary,status,briefing_state,version,source_conversation_id')
        .single()
      if (error) throw error
      await addProjectRevision(sb, data, 'updated')
      return json(200, { project: data })
    }

    if (action === 'update_project_briefing') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const projectId = requiredText(body?.project_id, 'project_id')
      const project = await ownedProject(sb, projectId, memberId)
      const command = requiredText(body?.command, 'command')
      if (!['snooze', 'not_relevant', 'mark_decided', 'reactivate'].includes(command)) {
        throw new Error('Project briefing action is invalid.')
      }
      const briefingState = command === 'not_relevant'
        ? 'not_relevant'
        : command === 'mark_decided'
          ? 'decided'
          : command === 'snooze'
            ? 'snoozed'
            : 'active'
      const snoozedUntil = command === 'snooze'
        ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        : null
      if (command === 'mark_decided') {
        const { error: itemError } = await sb
          .from('ai_project_items')
          .update({ status: 'decided', updated_at: new Date().toISOString() })
          .eq('project_id', projectId)
          .eq('status', 'open')
          .in('kind', ['decision', 'open_question'])
        if (itemError) throw itemError
      }
      const version = project.version + 1
      const { data, error } = await sb
        .from('ai_projects')
        .update({
          briefing_state: briefingState,
          briefing_snoozed_until: snoozedUntil,
          version,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('owner_member_id', memberId)
        .select('id,title,summary,status,briefing_state,version,source_conversation_id')
        .single()
      if (error) throw error
      await addProjectRevision(sb, data, `briefing_${command}`)
      return json(200, { project: data })
    }

    if (action === 'update_project_item') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const projectId = requiredText(body?.project_id, 'project_id')
      const project = await ownedProject(sb, projectId, memberId)
      const itemId = requiredText(body?.item_id, 'item_id')
      const status = requiredText(body?.status, 'status')
      if (!['open', 'done', 'decided', 'dismissed'].includes(status)) {
        throw new Error('Project item status is invalid.')
      }
      const { error } = await sb
        .from('ai_project_items')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', itemId)
        .eq('project_id', projectId)
      if (error) throw error
      const { data: updatedProject, error: projectError } = await sb
        .from('ai_projects')
        .update({
          version: project.version + 1,
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('owner_member_id', memberId)
        .select('id,title,summary,status,briefing_state,version,source_conversation_id')
        .single()
      if (projectError) throw projectError
      await addProjectRevision(sb, updatedProject, `item_${status}`)
      return json(200, { status: 'updated' })
    }

    if (action === 'delete_memory' || action === 'correct_memory') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const memoryId = requiredText(body?.memory_id, 'memory_id')
      const { data: memory, error: memoryError } = await sb
        .from('ai_memories')
        .select('id,scope,owner_member_id')
        .eq('id', memoryId)
        .eq('status', 'active')
        .maybeSingle()
      if (memoryError) throw memoryError
      if (!memory) throw new Error('Memory not found.')
      const canManage = memory.scope === 'personal'
        ? memory.owner_member_id === memberId
        : await memberIsAdmin(sb, memberId)
      if (!canManage) throw new Error('Memory access denied.')
      const update = action === 'delete_memory'
        ? { status: 'deleted', updated_at: new Date().toISOString() }
        : {
            title: requiredText(body?.title, 'title').slice(0, 160),
            content: requiredText(body?.content, 'content').slice(0, 2000),
            extractor_version: 'manual-v1',
            updated_at: new Date().toISOString(),
          }
      const { error } = await sb.from('ai_memories').update(update).eq('id', memoryId)
      if (error) throw error
      return json(200, { status: action === 'delete_memory' ? 'deleted' : 'corrected' })
    }

    if (action === 'create_conversation') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const title = requiredText(body?.title, 'title').slice(0, 160)
      const experienceMode = body?.experience_mode === 'talk_plan' ? 'talk_plan' : 'do'
      const expiresAt = new Date(Date.now())
      expiresAt.setUTCDate(expiresAt.getUTCDate() + 90)
      const { data, error } = await sb
        .from('ai_conversations')
        .insert({
          owner_member_id: memberId,
          title,
          experience_mode: experienceMode,
          model_metadata: body?.model_metadata && typeof body.model_metadata === 'object' ? body.model_metadata : {},
          expires_at: expiresAt.toISOString(),
        })
        .select('id,title,experience_mode,created_at,updated_at,expires_at')
        .single()
      if (error) throw error
      return json(201, { conversation: data })
    }

    if (action === 'get_conversation' || action === 'export_conversation') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const conversationId = requiredText(body?.conversation_id, 'conversation_id')
      await ownedConversation(sb, conversationId, memberId)
      const [{ data: conversation, error: conversationError }, { data: messages, error: messagesError }, { data: summaries, error: summariesError }] = await Promise.all([
        sb.from('ai_conversations').select('id,title,experience_mode,created_at,updated_at,archived_at,expires_at').eq('id', conversationId).single(),
        sb.from('ai_conversation_messages').select('client_message_id,role,content,evidence,sources_considered,partial_sources,conversation_state,tool_action,created_at').eq('conversation_id', conversationId).order('sequence_number'),
        sb.from('ai_conversation_summaries').select('through_message_id,content,created_at').eq('conversation_id', conversationId).order('created_at', { ascending: false }).limit(1),
      ])
      if (conversationError) throw conversationError
      if (messagesError) throw messagesError
      if (summariesError) throw summariesError
      return json(200, {
        conversation,
        messages: messages ?? [],
        summary: summaries?.[0] ?? null,
        exported_at: action === 'export_conversation' ? new Date().toISOString() : undefined,
      })
    }

    if (action === 'append_messages') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const conversationId = requiredText(body?.conversation_id, 'conversation_id')
      const messages = Array.isArray(body?.messages) ? body.messages.map(sanitizeMessage) : []
      if (messages.length === 0 || messages.length > 30) return json(400, { error: 'Send between 1 and 30 messages.' })
      const conversation = await ownedConversation(sb, conversationId, memberId)
      const { data: existing, error: existingError } = await sb
        .from('ai_conversation_messages')
        .select('client_message_id,sequence_number')
        .eq('conversation_id', conversationId)
      if (existingError) throw existingError
      const existingById = new Map((existing ?? []).map((message) => [message.client_message_id, message.sequence_number]))
      const nextSequence = Math.max(0, ...(existing ?? []).map((message) => message.sequence_number)) + 1
      const newMessages = messages.filter((message) => !existingById.has(message.id))
      const inserts = newMessages
        .map((message, index) => ({
          conversation_id: conversationId,
          client_message_id: message.id,
          sequence_number: nextSequence + index,
          role: message.role,
          content: message.content,
          evidence: message.evidence,
          sources_considered: message.sources_considered,
          partial_sources: message.partial_sources,
          conversation_state: message.conversation_state,
          tool_action: message.tool_action,
        }))
      const summary = summarizeConversation(messages)
      const throughMessageId = messages[messages.length - 1]?.id ?? null
      const temporalOptions = {
        now: new Date(),
        utcOffset: typeof body?.utc_offset === 'string' ? body.utc_offset : '-04:00',
      }
      const memories = inferPersonalMemoryCandidates(newMessages, temporalOptions)
      if (memories.length > 0) {
        const { error: memoryError } = await sb.from('ai_memories').upsert(memories.map((memory) => ({
          scope: 'personal',
          owner_member_id: memberId,
          source_conversation_id: conversationId,
          source_message_client_id: memory.sourceMessageId,
          extractor_version: PERSONAL_MEMORY_EXTRACTOR_VERSION,
          title: memory.title,
          content: memory.content,
          category: memory.category ?? 'preference',
          confidence: memory.confidence,
          temporal_evidence: memory.temporalEvidence,
        })), {
          onConflict: 'source_conversation_id,source_message_client_id,extractor_version',
          ignoreDuplicates: true,
        })
        if (memoryError) throw memoryError
      }
      for (const message of newMessages) {
        if (conversation.experience_mode === 'talk_plan') {
          await persistProjectTurn(sb, memberId, conversationId, message, conversation.title, temporalOptions)
        }
      }
      if (inserts.length > 0) {
        const { error } = await sb.from('ai_conversation_messages').insert(inserts)
        if (error) throw error
      }
      if (summary && throughMessageId) {
        const { data: latestSummary, error: latestSummaryError } = await sb
          .from('ai_conversation_summaries')
          .select('through_message_id,content')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (latestSummaryError) throw latestSummaryError
        const summaryChanged = !latestSummary ||
          latestSummary.through_message_id !== throughMessageId ||
          latestSummary.content !== summary
        if (summaryChanged) {
          const { error: summaryInsertError } = await sb
            .from('ai_conversation_summaries')
            .insert({
              conversation_id: conversationId,
              through_message_id: throughMessageId,
              content: summary,
              retrieval_scope: 'conversation_only',
            })
          if (summaryInsertError) throw summaryInsertError
        }
      }
      const { error: touchError } = await sb
        .from('ai_conversations')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', conversationId)
        .eq('owner_member_id', session.member_id)
      if (touchError) throw touchError
      return json(200, { inserted_count: inserts.length })
    }

    if (action === 'rename_conversation' || action === 'archive_conversation' || action === 'forget_conversation') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const conversationId = requiredText(body?.conversation_id, 'conversation_id')
      await ownedConversation(sb, conversationId, memberId)
      if (action === 'forget_conversation') {
        const { error } = await sb.from('ai_conversations').delete().eq('id', conversationId).eq('owner_member_id', session.member_id)
        if (error) throw error
        return json(200, { status: 'forgotten' })
      }
      const update = action === 'rename_conversation'
        ? { title: requiredText(body?.title, 'title').slice(0, 160) }
        : { archived_at: new Date().toISOString() }
      const { error } = await sb.from('ai_conversations').update(update).eq('id', conversationId).eq('owner_member_id', session.member_id)
      if (error) throw error
      return json(200, { status: action === 'rename_conversation' ? 'renamed' : 'archived' })
    }

    return json(400, { error: 'Unsupported history action.' })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Private history request failed.'
    const status = /access denied|not allowed/i.test(message)
      ? 403
      : /PIN|Private history|Profile session|attempts/i.test(message)
        ? 401
        : 400
    return json(status, { error: message })
  }
})

export { assertHistorySession }
