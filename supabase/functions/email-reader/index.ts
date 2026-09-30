// Casa reads the email, phase 1 — the shadow reader (design doc, decided with Jake 2026-09-30).
// For each email: the first pass drops plain noise; the rest — body and every attachment (PDFs and images
// as their pages, Word documents as their text, up to 20 MB) — is read by the planning model, which decides
// what Casa would offer. Decisions go to email_offers as shadows: nothing is shown, nothing is saved on the
// calendar. POST { message_ids?: string[], since_hours?: number, limit?: number, rerun?: boolean, matters?: boolean }.
// Phase 3 (canvas row 15): a kept sender or topic ("Keep me posted") makes the email a posted line — never
// dropped by the first pass; every email gets a line of what it says (gist); `matters` re-reads one he said
// mattered, so it comes back as an offer.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { unzipSync, strFromU8 } from 'https://esm.sh/fflate@0.8.2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { PLANNING_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { buildReaderPrompt, firstPass, readReaderDecision, readerParts } from '../_shared/email-reader.mjs'
import { keptPostedBy, postedStatus, statusFor } from '../_shared/email-offers.mjs'
import { personLine } from '../_shared/casa-memory.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

const providerFetch = createTrackedProviderFetch({ functionName: 'email-reader', capability: 'email', trafficClass: 'background' })

type Row = { gmail_message_id: string; family_member_id: string | null; from_email: string | null; subject: string | null; email_subject: string | null; received_at: string | null; email_body: string | null; attachments: unknown }
type Attachment = { filename: string; mimeType: string; size: number; data?: string; text?: string }

async function refreshToken(rt: string) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')! }),
  })
  return res.ok ? await res.json() as { access_token: string; expires_in: number } : null
}

/** One attachment's bytes (Gmail's base64url → base64), or null. */
async function fetchAttachment(messageId: string, attachmentId: string, token: string): Promise<string | null> {
  const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`, { headers: { Authorization: `Bearer ${token}` } }).catch(() => null)
  if (!res?.ok) return null
  const data = await res.json().catch(() => null) as { data?: string } | null
  return data?.data ? data.data.replace(/-/g, '+').replace(/_/g, '/') : null
}

/** A Word document's words (word/document.xml, paragraph by paragraph). */
function docxText(base64: string): string | null {
  try {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
    const xml = strFromU8(unzipSync(bytes, { filter: (f) => f.name === 'word/document.xml' })['word/document.xml'])
    return xml.replace(/<\/w:p>/g, '\n').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\n{3,}/g, '\n\n').trim() || null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  // It reads the family's mail: only a caller holding the reader's own key (the cron, Casa's scripts).
  const expected = Deno.env.get('EMAIL_READER_KEY')
  if (!expected || req.headers.get('x-casa-email-reader') !== expected) return json({ error: 'Not allowed' }, 401)
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { message_ids?: string[]; since_hours?: number; limit?: number; rerun?: boolean; matters?: boolean }
  const limit = Math.max(1, Math.min(Number(body.limit) || 10, 40))

  let q = sb.from('gmail_processed_messages').select('gmail_message_id, family_member_id, from_email, subject, email_subject, received_at, email_body, attachments')
  if (Array.isArray(body.message_ids) && body.message_ids.length) q = q.in('gmail_message_id', body.message_ids.slice(0, 40))
  else q = q.gte('processed_at', new Date(Date.now() - (Number(body.since_hours) || 1) * 3600e3).toISOString()).order('processed_at', { ascending: false })
  const { data: rows, error } = await q.limit(limit)
  if (error) return json({ error: error.message }, 500)
  let todo = (rows ?? []) as Row[]
  if (!body.rerun && todo.length) {
    const { data: done } = await sb.from('email_offers').select('gmail_message_id').in('gmail_message_id', todo.map((r) => r.gmail_message_id))
    const seen = new Set((done ?? []).map((d: { gmail_message_id: string }) => d.gmail_message_id))
    todo = todo.filter((r) => !seen.has(r.gmail_message_id))
  }
  if (!todo.length) return json({ read: 0, decisions: {} })

  const [{ data: llmRow }, { data: familyRows }, { data: upcoming }, { data: tokens }, { data: kept }, { data: facts }] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'llm_config').single(),
    sb.from('family_members').select('id, name, role').order('sort_order'),
    sb.from('events').select('id, title, start_time').is('deleted_at', null).neq('status', 'cancelled').gte('start_time', new Date(Date.now() - 86400e3).toISOString()).lt('start_time', new Date(Date.now() + 45 * 86400e3).toISOString()).order('start_time').limit(250),
    sb.from('google_tokens').select('family_member_id, refresh_token, access_token, expires_at'),
    sb.from('email_keep_posted').select('id, kind, sender, topic, label'),
    sb.from('casa_memory').select('kind, about_member_id, text, words, confidence').eq('status', 'active').eq('kind', 'fact').eq('confidence', 'sure'),
  ])
  // Casa's memory (phase 3): each person with what's known about them, so the reader can tell whose an email is.
  const family = (familyRows ?? []).filter((m: { name: string }) => m.name !== 'Tabor Family').map((m: { id: string; name: string; role: string | null }) => ({ ...m, line: personLine(m, facts ?? []) }))
  const rules = (kept ?? []) as Array<{ id: string; kind: string; sender: string | null; topic: string | null; label: string }>
  const topics = rules.filter((r) => r.kind === 'topic' && r.topic).map((r) => r.topic as string)
  const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
  if (!llm?.api_key) return json({ error: 'AI not configured' }, 400)
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const when = (iso: string) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
  const calendar = (upcoming ?? []).map((e: { id: string; title: string; start_time: string }) => ({ id: e.id, title: e.title, when: when(e.start_time) }))

  const accessFor = new Map<string, string | null>()
  const tokenFor = async (memberId: string | null) => {
    if (!memberId) return null
    if (accessFor.has(memberId)) return accessFor.get(memberId)!
    const t = (tokens ?? []).find((x: { family_member_id: string }) => x.family_member_id === memberId) as { refresh_token: string; access_token: string | null; expires_at: string | null } | undefined
    let access = t?.access_token ?? null
    if (t && (!access || !t.expires_at || new Date(t.expires_at) < new Date(Date.now() + 60_000))) access = (await refreshToken(t.refresh_token))?.access_token ?? null
    accessFor.set(memberId, access)
    return access
  }

  const results: Array<Record<string, unknown>> = []
  for (const row of todo) {
    const email = { from_email: row.from_email, subject: row.email_subject ?? row.subject, received_at: row.received_at, body: row.email_body ?? '' }
    const base = { gmail_message_id: row.gmail_message_id, mailbox_member_id: row.family_member_id, from_email: row.from_email, subject: email.subject, received_at: row.received_at, status: 'shadow', updated_at: new Date().toISOString() }
    // A kept sender's mail always reaches the reader.
    const skipped = keptPostedBy(email, rules, null) ? null : firstPass(email)
    if (skipped) {
      await sb.from('email_offers').upsert({ ...base, decision: 'skipped', reason: skipped, offers: [], person: null, model: null, error: null }, { onConflict: 'gmail_message_id' })
      results.push({ id: row.gmail_message_id, subject: email.subject, decision: 'skipped' })
      continue
    }
    // Every attachment, as the model reads it best (PDFs and images as pages; Word as text).
    const listed = (Array.isArray(row.attachments) ? row.attachments : []) as Array<{ filename?: string; mimeType?: string; size?: number; attachmentId?: string }>
    const files: Attachment[] = []
    const token = listed.length ? await tokenFor(row.family_member_id) : null
    for (const a of listed) {
      if (!a.attachmentId || !token || (a.size ?? 0) > 20 * 1024 * 1024) continue
      const data = await fetchAttachment(row.gmail_message_id, a.attachmentId, token)
      if (!data) continue
      const mime = String(a.mimeType ?? '').toLowerCase()
      const isDocx = mime.includes('wordprocessingml') || /\.docx$/i.test(a.filename ?? '')
      files.push({ filename: a.filename ?? 'attachment', mimeType: mime, size: a.size ?? 0, ...(isDocx ? { text: docxText(data) ?? undefined } : { data }) })
    }
    const prompt = buildReaderPrompt({ email, family, upcoming: calendar, today, attachments: files, topics, matters: !!body.matters })
    let decision = readReaderDecision(null)
    let failure: string | null = null
    try {
      const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${PLANNING_GEMINI_MODEL}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': llm.api_key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: readerParts(prompt, files) }], generationConfig: { responseMimeType: 'application/json', temperature: 0.2 } }),
      }, { callPurpose: 'email-reader', model: PLANNING_GEMINI_MODEL })
      const out = await res.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>; error?: { message?: string } }
      if (!res.ok) throw new Error(out?.error?.message ?? `HTTP ${res.status}`)
      const text = out.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
      decision = readReaderDecision(JSON.parse(text))
    } catch (err) {
      failure = err instanceof Error ? err.message.slice(0, 300) : String(err)
    }
    // Phase 2: a fresh offer waits for him to review; the rest stay shadows. Phase 3: a kept sender or topic
    // is a posted line for a week; one he said mattered waits as an offer if there's anything in it.
    const keptBy = failure ? null : keptPostedBy(email, rules, decision.posted)
    const status = keptBy ? postedStatus(row.received_at)
      : body.matters ? (['offer', 'details', 'person'].includes(decision.decision) ? 'waiting' : 'shadow')
      : statusFor(decision.decision, row.received_at)
    await sb.from('email_offers').upsert({ ...base, status, decision: decision.decision, reason: decision.reason, quote: decision.quote, offers: decision.offers, person: decision.person, gist: decision.gist, gist_tag: decision.gist_tag, posted_by: keptBy?.id ?? null, attachments_read: files.length, model: PLANNING_GEMINI_MODEL, error: failure }, { onConflict: 'gmail_message_id' })
    results.push({ id: row.gmail_message_id, subject: email.subject, decision: decision.decision, reason: decision.reason, offers: decision.offers, person: decision.person, attachments: files.length, error: failure })
  }
  // Counts only: what was decided stays in email_offers, which only the server reads.
  const tally = results.reduce((t: Record<string, number>, r) => ({ ...t, [String(r.decision)]: (t[String(r.decision)] ?? 0) + 1 }), {})
  return json({ read: results.length, decisions: tally, errors: results.filter((r) => r.error).length })
})
