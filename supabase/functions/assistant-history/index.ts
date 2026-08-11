import { createClient } from 'npm:@supabase/supabase-js@2'

import { requireEnv } from '../_shared/env.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-casa-history-session',
}

const PIN_ITERATIONS = 310_000
const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_MS = 15 * 60 * 1000
const encoder = new TextEncoder()
const decoder = new TextDecoder()

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

async function hmac(secret: string, content: string) {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(content)))
}

async function createHistorySession(session: HistorySession) {
  const secret = requireEnv('AI_HISTORY_SESSION_SECRET')
  const payload = base64url(encoder.encode(JSON.stringify(session)))
  const signature = base64url(await hmac(secret, payload))
  return `${payload}.${signature}`
}

async function assertHistorySession(request: Request, sb: ReturnType<typeof createClient>) {
  const token = request.headers.get('x-casa-history-session')?.trim()
  if (!token) throw new Error('Private history is locked.')
  const [payload, signature, extra] = token.split('.')
  if (!payload || !signature || extra) throw new Error('Private history session is invalid.')

  const expected = await hmac(requireEnv('AI_HISTORY_SESSION_SECRET'), payload)
  if (!constantTimeEqual(expected, fromBase64url(signature))) {
    throw new Error('Private history session is invalid.')
  }

  let session: HistorySession
  try {
    session = JSON.parse(decoder.decode(fromBase64url(payload))) as HistorySession
  } catch {
    throw new Error('Private history session is invalid.')
  }
  if (
    (session.role !== 'household_admin' && session.role !== 'family_member') ||
    !Number.isFinite(session.credential_version) ||
    (session.expires_at !== undefined && (
      !Number.isFinite(session.expires_at) ||
      session.expires_at <= Date.now()
    ))
  ) {
    throw new Error('Private history session has expired.')
  }

  const credentialQuery = sb
    .from('ai_history_pin_credentials')
    .select('credential_version')
    .eq('credential_kind', session.role)
  const { data: credential, error } = session.role === 'family_member'
    ? await credentialQuery.eq('member_id', session.member_id).maybeSingle()
    : await credentialQuery.is('member_id', null).maybeSingle()
  if (error) throw error
  if (!credential || credential.credential_version !== session.credential_version) {
    throw new Error('Private history session is no longer valid.')
  }
  return session
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
    .select('id')
    .eq('id', conversationId)
    .eq('owner_member_id', memberId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Conversation not found.')
  return data
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
      const { error: saveError } = await sb.from('ai_history_pin_credentials').upsert({
        credential_kind: 'family_member',
        member_id: memberId,
        credential_version: (existing?.credential_version ?? 0) + 1,
        failed_attempt_count: 0,
        locked_until: null,
        ...credential,
      }, { onConflict: 'member_id' })
      if (saveError) throw saveError
      return json(200, { status: 'member_pin_configured' })
    }

    if (action === 'list_conversations') {
      const session = await assertHistorySession(request, sb)
      const memberId = requireMemberSession(session)
      const { data, error } = await sb
        .from('ai_conversations')
        .select('id,title,experience_mode,created_at,updated_at,archived_at,expires_at')
        .eq('owner_member_id', session.member_id)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(100)
      if (error) throw error
      return json(200, { conversations: data ?? [] })
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
      await ownedConversation(sb, conversationId, memberId)
      const { data: existing, error: existingError } = await sb
        .from('ai_conversation_messages')
        .select('client_message_id,sequence_number')
        .eq('conversation_id', conversationId)
      if (existingError) throw existingError
      const existingById = new Map((existing ?? []).map((message) => [message.client_message_id, message.sequence_number]))
      const nextSequence = Math.max(0, ...(existing ?? []).map((message) => message.sequence_number)) + 1
      const inserts = messages
        .filter((message) => !existingById.has(message.id))
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
      if (inserts.length > 0) {
        const { error } = await sb.from('ai_conversation_messages').insert(inserts)
        if (error) throw error
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
    return json(/PIN|Private history|attempts/i.test(message) ? 401 : 400, { error: message })
  }
})

export { assertHistorySession }
