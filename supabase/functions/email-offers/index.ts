// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30): the offers he reviews with
// Casa, and his answers. POST { action: 'list' } → the waiting offers (newest first; past-dated ones expire),
// and up to three recent emails it skipped that he hasn't judged; POST { action: 'act', id, what } with what =
// added | not_needed | later (back tomorrow at 6 AM) | mattered | fine. Every answer is kept as a label.
// Phase 3 (learning): Not needed quiets that kind of email from that sender — a quiet one shows among "a few I
// skipped" with its reason, and That one mattered brings it, and that sender, back.
// Keep me posted (canvas row 15): a kept sender's or topic's emails are posted lines (what each says, Add it on
// anything dated) — act seen (Got it), keep_posted (from That one mattered: keep the sender, and re-read it as
// mattering), mattered (re-read it as mattering); Settings › Email — rules, add_rule, remove_rule, bring_back,
// text_on_wall.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { gmailLink, isExpired, kindOf, offerToAction, personToAction, postedLine, quietFor, ruleFromText, senderName, senderOf, withoutRepeats } from '../_shared/email-offers.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

/** Re-read one email as mattering (That one mattered): the reader offers what it asks, if anything. */
async function rereadAsMattering(gmailMessageId: string) {
  const key = Deno.env.get('EMAIL_READER_KEY')
  if (!key) return
  await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/email-reader`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'x-casa-email-reader': key },
    body: JSON.stringify({ message_ids: [gmailMessageId], rerun: true, matters: true }),
    signal: AbortSignal.timeout(90_000),
  }).catch(() => null)
}

const OFFER_COLUMNS = 'id, gmail_message_id, from_email, subject, received_at, decision, reason, quote, offers, person, status, later_until, feedback, gist, gist_tag, posted_by'

type Offer = { id: string; gmail_message_id: string; from_email: string | null; subject: string | null; received_at: string | null; decision: string; reason: string | null; quote: string | null; offers: Array<Record<string, unknown>>; person: { who: string; wants: string } | null; status: string; later_until: string | null; feedback: string | null; answered_at?: string | null; gist?: string | null; gist_tag?: string | null; posted_by?: string | null }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; what?: string; ids?: string[]; text?: string; on?: boolean }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

  // Settings › Email: what's kept posted, what's quiet (and since when), the wall switch.
  if (body.action === 'rules') {
    const [{ data: keep }, { data: quietRows }, { data: wall }] = await Promise.all([
      sb.from('email_keep_posted').select('id, kind, label, source, created_at').order('created_at'),
      sb.from('email_offers').select('quieted_by, received_at').eq('status', 'quiet'),
      sb.from('settings').select('value').eq('key', 'email_text_on_wall').maybeSingle(),
    ])
    const by = new Map<string, number>()
    for (const q of (quietRows ?? []) as Array<{ quieted_by: string | null }>) if (q.quieted_by) by.set(q.quieted_by, (by.get(q.quieted_by) ?? 0) + 1)
    const { data: sources } = by.size ? await sb.from('email_offers').select('id, from_email, decision, offers, answered_at').in('id', [...by.keys()]) : { data: [] }
    // One row per sender and kind, however many Not neededs made it.
    const quiet = new Map<string, { id: string; from: string; kind: string; since: string | null; skipped: number }>()
    for (const r of (sources ?? []) as Array<Offer>) {
      const key = `${senderOf(r.from_email)}|${kindOf(r)}`
      const prev = quiet.get(key)
      quiet.set(key, { id: prev?.id ?? r.id, from: senderName(r.from_email), kind: kindOf(r), since: prev?.since && r.answered_at && prev.since < r.answered_at ? prev.since : r.answered_at ?? null, skipped: (prev?.skipped ?? 0) + (by.get(r.id) ?? 0) })
    }
    return json({ keep: keep ?? [], quiet: [...quiet.values()], text_on_wall: (wall?.value ?? true) !== false })
  }
  if (body.action === 'add_rule') {
    const rule = ruleFromText(body.text)
    if (!rule) return json({ error: 'What should I keep you posted on?' }, 400)
    const { data, error } = await sb.from('email_keep_posted').insert({ ...rule, source: 'settings' }).select('id').maybeSingle()
    if (error) return json({ error: error.code === '23505' ? 'Already kept posted' : error.message }, error.code === '23505' ? 409 : 500)
    return json({ ok: true, id: data?.id })
  }
  if (body.action === 'remove_rule') {
    if (!body.id) return json({ error: 'Which one?' }, 400)
    const { error } = await sb.from('email_keep_posted').delete().eq('id', body.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }
  if (body.action === 'bring_back') {
    // Every Not needed of that kind from that sender stops quieting; the next list offers what was quiet.
    const { data: src } = await sb.from('email_offers').select('from_email, decision, offers').eq('id', body.id ?? '').maybeSingle()
    if (!src) return json({ error: 'Which one?' }, 400)
    const { data: same } = await sb.from('email_offers').select('id, from_email, decision, offers').eq('status', 'not_needed').is('unquieted_at', null)
    const ids = ((same ?? []) as Array<Offer>).filter((r) => senderOf(r.from_email) === senderOf(src.from_email) && kindOf(r) === kindOf(src as Offer)).map((r) => r.id)
    if (ids.length) await sb.from('email_offers').update({ unquieted_at: new Date().toISOString() }).in('id', ids)
    return json({ ok: true, released: ids.length })
  }
  if (body.action === 'text_on_wall') {
    const { error } = await sb.from('settings').upsert({ key: 'email_text_on_wall', value: body.on !== false, updated_at: new Date().toISOString() }, { onConflict: 'key' })
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  if (body.action === 'act') {
    const what = String(body.what ?? '')
    if (!body.id) return json({ error: 'Which email?' }, 400)
    if (what === 'add') {
      // Every offer of that email, as the card Casa already saves (a yes from him, from the review card).
      const { data: row } = await sb.from('email_offers').select('id, decision, offers, person, status').eq('id', body.id).maybeSingle()
      if (!row) return json({ error: 'That email is gone' }, 404)
      // Added once is enough: a second screen with an older list (the wall, then the phone) added the
      // "Reply to" to-dos twice (2026-09-30).
      if (row.status === 'added') return json({ ok: true, saved: [], already: true })
      // A posted line with nothing to add (news, an ad) has no Add it.
      const actions = row.decision === 'person' ? [personToAction(row.person)] : (row.offers ?? []).map((o: Record<string, unknown>) => offerToAction(o, { decision: row.decision }))
      const saved: string[] = []
      const failed: string[] = []
      for (const action of actions.filter(Boolean) as Array<{ tool: string; args: Record<string, unknown> }>) {
        const { data, error } = await sb.functions.invoke('execute-ai-action', {
          body: { tool: action.tool, args: { ...action.args, ...(action.tool === 'create_event' ? { allow_calendar_conflicts: true } : {}) }, lane: 'email', client_trace_source: 'email-review', confirmed_by_user: true, correlation_id: `email:${row.id}:${Date.now().toString(36)}` },
        })
        if (error || (data && (data as { success?: boolean }).success === false)) failed.push(String(action.args.title ?? action.args.label ?? action.tool))
        else saved.push(String(action.args.title ?? action.args.label ?? (action.args.items as Array<{ name: string }> | undefined)?.[0]?.name ?? action.tool))
      }
      if (!saved.length) return json({ error: failed.length ? `That didn’t save: ${failed.join(', ')}` : 'Nothing in it to add' }, 422)
      await sb.from('email_offers').update({ status: 'added', answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id)
      return json({ ok: true, saved, failed })
    }
    // Got it: the posted lines he's read.
    if (what === 'seen') {
      const ids = (Array.isArray(body.ids) ? body.ids : [body.id]).filter(Boolean).slice(0, 50)
      await sb.from('email_offers').update({ status: 'seen', answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).in('id', ids).eq('status', 'posted')
      return json({ ok: true })
    }
    // That one mattered: keep this sender posted (Yes, a line for each) or just this one; either way it's
    // read again as mattering, and comes back as an offer if there's anything in it.
    if (what === 'keep_posted' || what === 'mattered') {
      const { data: row } = await sb.from('email_offers').select('id, gmail_message_id, from_email, decision, status').eq('id', body.id).maybeSingle()
      if (!row) return json({ error: 'That email is gone' }, 404)
      if (what === 'keep_posted' && row.from_email) {
        const { error: ruleError } = await sb.from('email_keep_posted').insert({ kind: 'sender', sender: senderOf(row.from_email), label: senderName(row.from_email), source: 'mattered' })
        if (ruleError && ruleError.code !== '23505') return json({ error: ruleError.message }, 500)
      }
      await sb.from('email_offers').update({ feedback: 'mattered', answered_at: new Date().toISOString(), updated_at: new Date().toISOString(), ...(row.status === 'quiet' ? { status: 'waiting', quieted_by: null } : {}) }).eq('id', row.id)
      if (['none', 'already', 'skipped'].includes(row.decision) || row.status === 'quiet') await rereadAsMattering(row.gmail_message_id)
      const { data: now } = await sb.from('email_offers').select(OFFER_COLUMNS).eq('id', row.id).maybeSingle()
      const r = now as Offer | null
      const offer = r && ['waiting', 'posted'].includes(r.status) && postedLine(r).can_add
        ? { id: r.id, from: senderName(r.from_email), subject: r.subject, received_at: r.received_at, open: gmailLink(r.gmail_message_id), decision: r.decision, reason: r.reason, quote: r.quote, offers: r.offers ?? [], person: r.person }
        : null
      return json({ ok: true, offer })
    }
    const tomorrow6 = new Date(`${new Date(Date.parse(`${today}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10)}T06:00:00-04:00`).toISOString()
    const patch: Record<string, unknown> =
      what === 'added' ? { status: 'added' }
      : what === 'not_needed' ? { status: 'not_needed' }
      : what === 'later' ? { status: 'later', later_until: tomorrow6 }
      : what === 'fine' ? { feedback: what }
      : {}
    if (!Object.keys(patch).length) return json({ error: 'Unknown answer' }, 400)
    const { error } = await sb.from('email_offers').update({ ...patch, answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  // The list: waiting offers, and "later" ones whose time has come.
  const { data: rows, error } = await sb.from('email_offers')
    .select(OFFER_COLUMNS)
    .in('status', ['waiting', 'later', 'quiet'])
    .order('received_at', { ascending: false })
    .limit(60)
  if (error) return json({ error: error.message }, 500)
  // His answers so far (the last half year), which quiet a sender or bring one back.
  const { data: answered } = await sb.from('email_offers')
    .select('id, from_email, decision, offers, status, feedback, answered_at, posted_by, unquieted_at')
    .not('answered_at', 'is', null)
    .or('status.in.(added,not_needed),feedback.eq.mattered')
    .gte('answered_at', new Date(Date.now() - 183 * 86400e3).toISOString())
  const now = Date.now()
  const live: Offer[] = []
  const quiet: Array<Offer & { quietReason: string }> = []
  for (const r of (rows ?? []) as Offer[]) {
    if (isExpired(r, today)) {
      await sb.from('email_offers').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', r.id)
      continue
    }
    const q = quietFor(r, answered ?? [])
    if (q) {
      if (r.status !== 'quiet') await sb.from('email_offers').update({ status: 'quiet', quieted_by: q.by, updated_at: new Date().toISOString() }).eq('id', r.id)
      if (!r.feedback && r.received_at && Date.parse(r.received_at) >= now - 7 * 86400e3) quiet.push({ ...r, quietReason: q.reason })
      continue
    }
    if (r.status === 'quiet') {
      // Its sender was brought back: offered again.
      await sb.from('email_offers').update({ status: 'waiting', quieted_by: null, updated_at: new Date().toISOString() }).eq('id', r.id)
      r.status = 'waiting'
    }
    if (r.status === 'later' && r.later_until && Date.parse(r.later_until) > now) continue
    live.push(r)
  }
  // "A few I skipped": this week's, not yet judged, at most three (never the noise the first pass dropped).
  const { data: skippedRows } = await sb.from('email_offers')
    .select('id, gmail_message_id, from_email, subject, received_at, reason')
    .in('decision', ['none', 'already'])
    .is('feedback', null)
    .is('posted_by', null)
    .gte('received_at', new Date(now - 7 * 86400e3).toISOString())
    .order('received_at', { ascending: false })
    .limit(3)
  // Keep me posted: this week's lines, oldest last, with the rule that keeps them.
  const [{ data: postedRows }, { data: keptRules }, { data: wall }] = await Promise.all([
    sb.from('email_offers').select(OFFER_COLUMNS).eq('status', 'posted').gte('received_at', new Date(now - 7 * 86400e3).toISOString()).order('received_at', { ascending: false }).limit(20),
    sb.from('email_keep_posted').select('id, label'),
    sb.from('settings').select('value').eq('key', 'email_text_on_wall').maybeSingle(),
  ])
  const labelOf = new Map(((keptRules ?? []) as Array<{ id: string; label: string }>).map((k) => [k.id, k.label]))
  const view = (r: { id: string; gmail_message_id: string; from_email: string | null; subject: string | null; received_at: string | null }) => ({ id: r.id, from: senderName(r.from_email), subject: r.subject, received_at: r.received_at, open: gmailLink(r.gmail_message_id) })
  const shown = withoutRepeats(live) as Offer[]
  const posted = ((postedRows ?? []) as Offer[]).map((r) => ({
    ...view(r), ...postedLine(r), kept_by: labelOf.get(r.posted_by ?? '') ?? senderName(r.from_email), sender: senderOf(r.from_email),
    decision: r.decision, reason: r.reason, quote: r.quote, offers: r.offers ?? [], person: r.person,
  }))
  return json({
    count: shown.length + posted.length,
    posted,
    text_on_wall: (wall?.value ?? true) !== false,
    offers: shown.map((r) => ({ ...view(r), decision: r.decision, reason: r.reason, quote: r.quote, offers: r.offers ?? [], person: r.person })),
    // The quiet ones first: those are what his Not needed is deciding, so he can say one mattered.
    skipped: [
      ...quiet.map((r) => ({ ...view(r), reason: r.quietReason })),
      ...((skippedRows ?? []) as Array<Offer>).map((r) => ({ ...view(r), reason: r.reason })),
    ].slice(0, 3),
  })
})
