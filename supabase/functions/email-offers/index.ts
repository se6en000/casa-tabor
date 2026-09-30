// Casa reads the email, phase 2 (canvas row 14, approved by Jake 2026-09-30): the offers he reviews with
// Casa, and his answers. POST { action: 'list' } → the waiting offers (newest first; past-dated ones expire),
// and up to three recent emails it skipped that he hasn't judged; POST { action: 'act', id, what } with what =
// added | not_needed | later (back tomorrow at 6 AM) | mattered | fine. Every answer is kept as a label.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { gmailLink, isExpired, offerToAction, personToAction, withoutRepeats } from '../_shared/email-offers.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })

type Offer = { id: string; gmail_message_id: string; from_email: string | null; subject: string | null; received_at: string | null; decision: string; reason: string | null; quote: string | null; offers: Array<Record<string, unknown>>; person: { who: string; wants: string } | null; status: string; later_until: string | null; feedback: string | null }

const sender = (from: string | null) => {
  const m = /^\s*"?([^"<]+?)"?\s*</.exec(from ?? '')
  return (m ? m[1] : from ?? '').trim()
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const body = await req.json().catch(() => ({})) as { action?: string; id?: string; what?: string }
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())

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
    const tomorrow6 = new Date(`${new Date(Date.parse(`${today}T12:00:00Z`) + 86400e3).toISOString().slice(0, 10)}T06:00:00-04:00`).toISOString()
    const patch: Record<string, unknown> =
      what === 'added' ? { status: 'added' }
      : what === 'not_needed' ? { status: 'not_needed' }
      : what === 'later' ? { status: 'later', later_until: tomorrow6 }
      : what === 'mattered' || what === 'fine' ? { feedback: what }
      : {}
    if (!Object.keys(patch).length) return json({ error: 'Unknown answer' }, 400)
    const { error } = await sb.from('email_offers').update({ ...patch, answered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', body.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  // The list: waiting offers, and "later" ones whose time has come.
  const { data: rows, error } = await sb.from('email_offers')
    .select('id, gmail_message_id, from_email, subject, received_at, decision, reason, quote, offers, person, status, later_until, feedback')
    .in('status', ['waiting', 'later'])
    .order('received_at', { ascending: false })
    .limit(40)
  if (error) return json({ error: error.message }, 500)
  const now = Date.now()
  const live: Offer[] = []
  for (const r of (rows ?? []) as Offer[]) {
    if (r.status === 'later' && r.later_until && Date.parse(r.later_until) > now) continue
    if (isExpired(r, today)) {
      await sb.from('email_offers').update({ status: 'expired', updated_at: new Date().toISOString() }).eq('id', r.id)
      continue
    }
    live.push(r)
  }
  // "A few I skipped": this week's, not yet judged, at most three (never the noise the first pass dropped).
  const { data: skippedRows } = await sb.from('email_offers')
    .select('id, gmail_message_id, from_email, subject, received_at, reason')
    .in('decision', ['none', 'already'])
    .is('feedback', null)
    .gte('received_at', new Date(now - 7 * 86400e3).toISOString())
    .order('received_at', { ascending: false })
    .limit(3)
  const view = (r: { id: string; gmail_message_id: string; from_email: string | null; subject: string | null; received_at: string | null }) => ({ id: r.id, from: sender(r.from_email), subject: r.subject, received_at: r.received_at, open: gmailLink(r.gmail_message_id) })
  const shown = withoutRepeats(live) as Offer[]
  return json({
    count: shown.length,
    offers: shown.map((r) => ({ ...view(r), decision: r.decision, reason: r.reason, quote: r.quote, offers: r.offers ?? [], person: r.person })),
    skipped: ((skippedRows ?? []) as Array<Offer>).map((r) => ({ ...view(r), reason: r.reason })),
  })
})
