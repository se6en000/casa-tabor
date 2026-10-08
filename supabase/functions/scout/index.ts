// The Scout (Jake, Oct 8): twice a week, research what's worth doing within half an hour of home — new and hidden-gem
// restaurants, free workouts (yoga, pilates, run clubs, pickleball), evenings out for two, weekend family outings — and
// keep only what checks out (scout.mjs). The newsletters the family subscribes to (the Palm Beach Post, the city) are
// mined too. POST { action: 'research', force?, dry_run? } | { action: 'list' } | { action: 'feedback', id, status }
// | { action: 'news', force?, dry_run? } (the paper's Around town, each morning)
// | { action: 'calendars', dry_run? } (live music, comedy and trivia from local calendars, each morning)
// | { action: 'details', id } (what an outing's own page says, for its card — read once, kept a week).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { TALK_PLAN_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { createTrackedMapsFetch, createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import {
  AHEAD_DAYS, NEWS_SENDERS, SCOUT_LANES, dedupeKey, laneSearchPrompt, newsletterPrompt, pageText, pageVerdict,
  CALENDARS, CALENDAR_KINDS, calendarReach, detailsPrompt, foldIn, isBait, keptTwice, notLiveMusic, parseDetails, parseCandidates, parseSflmGigs, parseTownNews, parseTriviaSchedule,
  parseWeekendBroward, restaurantVerdict, townInReach, townNewsPrompt,
} from '../_shared/scout.mjs'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const providerFetch = createTrackedProviderFetch({ functionName: 'scout', capability: 'briefing', trafficClass: 'background' })
const mapsFetch = createTrackedMapsFetch({ functionName: 'scout', service: 'places', sku: 'Places Text Search', callPurpose: 'scout-research' })

// The newsletters worth mining (Jake subscribes the inbox Tabor House reads).
const NEWSLETTERS = ['%palmbeachpost%', '%pbpost%', '%wpb.org%', '%thepalmbeaches%', '%palmbeachculture%', '%palmbeachillustrated%', '%palmbeachdailynews%', '%eventbrite%', '%meetup%',
  // Jake's Oct 8 subscriptions: Weekend Broward, the Palm Beach Weekender, Palm Beach Locals, Macaroni Kid, Florida Weekly, Palms West.
  '%weekendbroward%', '%palmbeachweekender%', '%mypalmbeachlocals%', '%palmbeachlocals%', '%macaronikid%', '%floridaweekly%', '%palmswest%']
// Places' own searches for hidden gems near home.
const GEM_QUERIES = ['hidden gem restaurant', 'chef driven restaurant', 'wine bar small plates', 'omakase', 'romantic restaurant', 'farm to table restaurant', 'cocktail bar', 'waterfront restaurant']
const PLACE_FIELDS = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.location,places.primaryTypeDisplayName,places.editorialSummary,places.websiteUri,places.googleMapsUri,places.priceLevel'

type Candidate = ReturnType<typeof parseCandidates>[number]
type Kept = Candidate & { dedupe_key: string; drive_min?: number | null; rating?: number | null; rating_count?: number | null; gem?: boolean; google_place_id?: string | null; source: 'search' | 'places' | 'email'; source_ref?: string | null; verify_note: string }

const ymdNY = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
const longDay = (ymd: string) => new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' })
const addDays = (ymd: string, n: number) => new Date(Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** A page's text, as a browser would get it (redirects followed); null when it won't load. */
async function fetchPage(url: string): Promise<{ text: string; url: string } | null> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 9000)
    const res = await fetch(url, { redirect: 'follow', signal: ctrl.signal, headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', accept: 'text/html,application/xhtml+xml' } })
    clearTimeout(timer)
    if (!res.ok) return null
    const html = (await res.text()).slice(0, 1_500_000)
    return { text: pageText(html), url: res.url || url }
  } catch {
    return null
  }
}

/** A few at a time. */
async function inBatches<T, R>(items: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = []
  for (let i = 0; i < items.length; i += size) out.push(...await Promise.all(items.slice(i, i + size).map(fn)))
  return out
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const body = await req.json().catch(() => ({})) as { action?: string; force?: boolean; dry_run?: boolean; id?: string; status?: string; lanes?: number[] }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = ymdNY()

  if (body.action === 'list') {
    const { data } = await sb.from('outings').select('*').in('status', ['new', 'offered', 'saved']).order('kind').limit(200)
    const live = (data ?? []).filter((o: { when: string | null }) => !o.when || o.when.slice(0, 10) >= today)
    // The paper's third page: the latest morning's news (a day or two old at most).
    const { data: news } = await sb.from('town_news').select('section, headline, line, source, source_date, rank, news_date, on_date')
      .gte('news_date', addDays(today, -2)).order('news_date', { ascending: false }).limit(40)
    const latest = news?.[0]?.news_date
    return json({ outings: live, news: (news ?? []).filter((n: { news_date: string }) => n.news_date === latest), today })
  }

  if (body.action === 'feedback') {
    if (!body.id || !['saved', 'not_for_us', 'been', 'new'].includes(String(body.status))) return json({ error: 'Which, and what?' }, 400)
    const { error } = await sb.from('outings').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  if (body.action === 'news') {
    if (!body.force && !body.dry_run) {
      const { count } = await sb.from('town_news').select('id', { count: 'exact', head: true }).eq('news_date', today)
      if (count) return json({ ok: true, skipped: 'written today' })
    }
    const write = async () => {
      const [{ data: llmRow }, { data: members }, { data: mail }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
        sb.from('family_members').select('name, role').neq('name', 'Tabor Family').order('sort_order'),
        sb.from('gmail_processed_messages').select('gmail_message_id, from_email, subject, email_subject, email_body, received_at')
          .gte('received_at', new Date(Date.now() - 7 * 86_400_000).toISOString()).not('email_body', 'is', null)
          .or(NEWS_SENDERS.map((p) => `from_email.ilike.${p}`).join(',')).order('received_at', { ascending: false }).limit(40),
      ])
      const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
      if (!llm?.api_key) throw new Error('AI not configured')
      // One of each (a resend, a reminder of the same thing).
      const seen = new Set<string>()
      const emails = ((mail ?? []) as Array<Record<string, string>>).filter((m) => {
        const k = String(m.email_subject ?? m.subject ?? '').toLowerCase().replace(/^((re|fwd?|reminder|tomorrow)\s*[:\-]\s*)+/, '').trim()
        if (seen.has(k)) return false
        seen.add(k)
        return true
      }).slice(0, 30).map((m) => ({ id: m.gmail_message_id, from: m.from_email, subject: m.email_subject ?? m.subject, received: ymdNY(new Date(m.received_at)), body: m.email_body }))
      if (!emails.length) return { items: [], emails: 0 }
      const family = ((members ?? []) as Array<{ name: string; role: string | null }>).map((m) => `${m.name}${m.role ? ` (${m.role})` : ''}`).join(', ')
      const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: townNewsPrompt(emails, { today: longDay(today), family }) }] }],
          generationConfig: { maxOutputTokens: 3000, temperature: 0.2, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      const refs = new Map(emails.map((e) => [e.id, { received: e.received, from: String(e.from ?? '') }]))
      const items = parseTownNews(text, { refs, today })
      if (body.dry_run || !items.length) return { items, emails: emails.length }
      await sb.from('town_news').delete().eq('news_date', today)
      const { error } = await sb.from('town_news').insert(items)
      if (error) throw new Error(error.message)
      // A week back is plenty.
      await sb.from('town_news').delete().lt('news_date', addDays(today, -7))
      return { items: items.length, emails: emails.length }
    }
    if (body.dry_run) {
      try { return json(await write()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
    }
    // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
    EdgeRuntime.waitUntil(write().catch((e) => console.error('[scout news]', e)))
    return json({ ok: true, started: true }, 202)
  }

  if (body.action === 'details') {
    const { data: o } = await sb.from('outings').select('id, kind, title, "when", url, details, details_at').eq('id', String(body.id ?? '')).maybeSingle()
    if (!o) return json({ error: 'not found' }, 404)
    if (o.details && o.details_at && Date.now() - Date.parse(o.details_at) < 7 * 86_400_000) return json({ details: { ...o.details, read_at: o.details_at } })
    if (!o.url) return json({ details: null })
    const { data: llmRow } = await sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle()
    const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
    if (!llm?.api_key) return json({ details: null })
    // Its page as a browser gets it; a site that turns servers away is read by Google's page reader instead.
    const page = await fetchPage(o.url)
    const text = page && page.text.length > 500 ? page.text : null
    const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: detailsPrompt(o, text) }] }],
        ...(text ? { generationConfig: { maxOutputTokens: 1200, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } } } : { tools: [{ url_context: {} }], generationConfig: { maxOutputTokens: 1200, temperature: 0.1 } }),
      }),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const answer = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
    const details = parseDetails(answer, o.kind)
    if (!details) return json({ details: null })
    const at = new Date().toISOString()
    await sb.from('outings').update({ details, details_at: at }).eq('id', o.id)
    return json({ details: { ...details, read_at: at } })
  }

  if (body.action === 'calendars') {
    const read = async () => {
      const [{ data: homeRow }, { data: known }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
        sb.from('outings').select('*').in('status', ['new', 'offered', 'saved', 'not_for_us']).limit(1000),
      ])
      const geo = homeRow?.value?.geocode_cache
      const home = typeof geo?.lat === 'number' ? { lat: geo.lat as number, lng: geo.lng as number } : null
      const found: Array<Record<string, unknown>> = []
      const log: Array<Record<string, unknown>> = []
      await Promise.all(CALENDARS.map(async (cal) => {
        try {
          const res = await fetch(cal.url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' } })
          if (!res.ok) { log.push({ cal: cal.id, status: res.status }); return }
          const html = await res.text()
          const items = cal.id === 'weekendbroward' ? parseWeekendBroward(html) : cal.id === 'sflm' ? parseSflmGigs(html, today) : parseTriviaSchedule(html, cal.url)
          let kept = 0
          for (const it of items as Array<Record<string, any>>) {
            if (it.when && String(it.when).slice(0, 10) < today) continue
            if (it.when && String(it.when).slice(0, 10) > addDays(today, AHEAD_DAYS * 3)) continue
            if (isBait(it) || notLiveMusic(it)) continue
            const reach = calendarReach(it, home)
            if (!reach.ok) continue
            const { at: _at, ticketed: _t, ...row } = it
            found.push({ ...row, drive_min: reach.minutes ?? null, source: 'calendar', source_ref: cal.id, verify_note: `on ${cal.name}` })
            kept++
          }
          log.push({ cal: cal.id, read: items.length, kept })
        } catch (e) {
          log.push({ cal: cal.id, error: e instanceof Error ? e.message : String(e) })
        }
      }))
      // One row per thing, however many calendars (or newsletters, or searches) list it.
      const rows = foldIn(found, (known ?? []) as Array<Record<string, unknown>>).map((r: Record<string, any>) => ({
        dedupe_key: r.dedupe_key, kind: r.kind, title: r.title, when: r.when ?? null, recurring: r.recurring ?? null, place: r.place ?? null, address: r.address ?? null,
        url: r.url ?? null, why: r.why ?? null, free: r.free ?? null, drive_min: r.drive_min ?? null, rating: r.rating ?? null, rating_count: r.rating_count ?? null,
        gem: r.gem ?? false, google_place_id: r.google_place_id ?? null, source: r.source ?? 'calendar', source_ref: r.source_ref ?? null, verify_note: r.verify_note ?? null,
        status: r.status ?? 'new', verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }))
      if (body.dry_run) return { found: found.length, rows, log }
      if (rows.length) {
        const { error } = await sb.from('outings').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: false })
        if (error) throw new Error(error.message)
      }
      // Kept twice from before the fold (Clematis by Night as the couple's and the family's): the extra put away.
      const { data: liveNow } = await sb.from('outings').select('id, kind, title, "when", recurring, place, status, created_at').in('status', ['new', 'offered', 'saved']).limit(1000)
      const twice = keptTwice(liveNow ?? [])
      if (twice.length) await sb.from('outings').update({ status: 'expired', updated_at: new Date().toISOString() }).in('id', twice)
      // Past gigs put away; a weekly one no calendar has listed for two weeks has stopped.
      await sb.from('outings').update({ status: 'expired', updated_at: new Date().toISOString() }).lt('when', today).in('status', ['new', 'offered', 'saved'])
      await sb.from('outings').update({ status: 'expired', updated_at: new Date().toISOString() }).in('kind', CALENDAR_KINDS).is('when', null)
        .lt('verified_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).in('status', ['new', 'offered'])
      return { found: found.length, written: rows.length, twice: twice.length, log }
    }
    try { return json(await read()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
  }

  if (body.action !== 'research') return json({ error: 'Unknown action' }, 400)

  // At most once in two days, whoever calls (the cron is public).
  if (!body.force && !body.dry_run) {
    const { data: last } = await sb.from('settings').select('value').eq('key', 'scout_state').maybeSingle()
    const at = Date.parse(String(last?.value?.researched_at ?? ''))
    if (Number.isFinite(at) && Date.now() - at < 44 * 3600e3) return json({ ok: true, skipped: 'researched recently' })
  }

  const run = async () => {
    const [{ data: llmRow }, { data: homeRow }, { data: known }, { data: mined }] = await Promise.all([
      sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
      sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
      sb.from('outings').select('*').limit(2000),
      sb.from('settings').select('value').eq('key', 'scout_state').maybeSingle(),
    ])
    const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
    if (!llm?.api_key) throw new Error('AI not configured')
    const geo = homeRow?.value?.geocode_cache
    const home = typeof geo?.lat === 'number' ? { lat: geo.lat as number, lng: geo.lng as number } : null
    const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    const gemini = (model: string, payload: unknown) => providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${llm.api_key}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
    }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const textOf = (res: any) => ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')

    const kept: Kept[] = []
    const readerLog: Array<Record<string, unknown>> = []
    const rejected: Array<{ title: string; note: string; url?: string | null }> = []

    // 1. The web, lane by lane (grounded search), then each candidate's own page.
    const lanes = SCOUT_LANES.filter((_, i) => !body.lanes || body.lanes.includes(i))
    const laneResults = await Promise.all(lanes.map(async (lane) => {
      const res = await gemini(TALK_PLAN_GEMINI_MODEL, {
        contents: [{ parts: [{ text: laneSearchPrompt(lane, { today: longDay(today), until: longDay(addDays(today, AHEAD_DAYS)) }) }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 2500, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
      })
      const grounding = ((res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{ web?: { uri?: string } }>).map((c) => c.web?.uri).filter(Boolean) as string[]
      return { lane, candidates: parseCandidates(textOf(res), lane.kind, today), grounding }
    }))
    const freshRestaurants: Candidate[] = []
    const events: Array<{ c: Candidate; grounding: string[] }> = []
    for (const r of laneResults) for (const c of r.candidates) (c.kind === 'restaurant' ? freshRestaurants.push(c) : events.push({ c, grounding: r.grounding }))

    // Google's page reader (url_context): the passage about this candidate, quoted; null when it couldn't open the page.
    const viaGoogle = async (url: string, c: Candidate) => {
      const res = await gemini(TALK_PLAN_GEMINI_MODEL, {
        contents: [{ parts: [{ text: `Open ${url}. Copy, word for word, the part of that page about "${c.title}"${c.when ? ` with its date and time` : c.recurring ? ' with its days and times' : ''}, up to 1200 characters, exactly as written there (no summary, nothing added). If the page doesn't mention it, answer only NONE.` }] }],
        tools: [{ url_context: {} }],
        generationConfig: { maxOutputTokens: 900, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      })
      const meta = (res?.candidates?.[0]?.urlContextMetadata?.urlMetadata ?? []) as Array<{ urlRetrievalStatus?: string }>
      const quoted = textOf(res).trim()
      if (body.dry_run) readerLog.push({ url, status: meta.map((m) => m.urlRetrievalStatus).join(','), got: quoted.slice(0, 120), error: res ? null : 'no answer' })
      if (!meta.some((m) => String(m.urlRetrievalStatus ?? '').includes('SUCCESS')) || !quoted || /^NONE\b/i.test(quoted)) return null
      return { text: pageText(quoted), url }
    }
    // Last resort for a page nobody can open (wpb.org turns every server away): a search asking just whether it's
    // still on, that day, quoting a source — kept only when the quote names it and its date, and only with a source.
    const confirmBySearch = async (c: Candidate) => {
      const res = await gemini(TALK_PLAN_GEMINI_MODEL, {
        contents: [{ parts: [{ text: `Search Google now to check: is "${c.title}"${c.place ? ` at ${c.place}` : ''} happening ${c.when ? `on ${c.when}` : c.recurring ? `${c.recurring}, these weeks` : 'soon'} (today is ${today})? Check that it has not been cancelled, ended or moved. Answer with only JSON: {"on": true | false | "unsure", "quote": "a sentence copied word for word from a current source that names it and its date or day", "source": "that source's address"}` }] }],
        tools: [{ google_search: {} }],
        generationConfig: { maxOutputTokens: 600, temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
      })
      const chunks = (res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{ web?: { uri?: string } }>
      const t = textOf(res)
      const m = t.match(/\{[\s\S]*\}/)
      let a: { on?: unknown; quote?: unknown; source?: unknown } = {}
      try { a = m ? JSON.parse(m[0]) : {} } catch { a = {} }
      if (body.dry_run) readerLog.push({ confirm: c.title, on: a.on, quote: String(a.quote ?? '').slice(0, 160), sources: chunks.length })
      // It searched (Google lists its queries; a JSON answer often comes back without the source links themselves).
      const searched = chunks.length > 0 || ((res?.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? []) as string[]).length > 0
      if (a.on !== true || !searched || typeof a.quote !== 'string') return null
      const v = pageVerdict(c, pageText(a.quote), today, { minLength: 20, current: true })
      return v.ok ? { url: typeof a.source === 'string' && /^https?:\/\//.test(a.source) ? a.source : c.url, note: 'confirmed by a search' } : null
    }
    // Google's grounding links are redirects that expire: the page they point at, kept instead.
    const realUrl = async (url: string) => {
      if (!/vertexaisearch\.cloud\.google\.com\/grounding-api-redirect/.test(url)) return url
      const res = await fetch(url, { redirect: 'manual' }).catch(() => null)
      return res?.headers.get('location') ?? url
    }
    const verifyEvent = async ({ c, grounding }: { c: Candidate; grounding: string[] }, source: Kept['source'] = 'search', sourceRef: string | null = null) => {
      // Half an hour from home: a town well beyond it named in its address is out before any page is fetched.
      if (townInReach(`${c.address ?? ''} ${c.place ?? ''}`) === false) { rejected.push({ title: c.title!, note: 'too far', url: c.url }); return }
      const tries = await Promise.all(([c.url, ...grounding.slice(0, 3)].filter(Boolean) as string[]).map(realUrl))
      let last = 'no page to check'
      for (const url of tries) {
        let page = await fetchPage(url)
        let v = page ? pageVerdict(c, page.text, today) : { ok: false, note: 'the page won’t load' }
        // Sites that turn a server away (wpb.org, the Norton) or draw their calendars in the browser: Google opens the
        // page and copies, word for word, what it says about this one — the same checks run on that.
        if (!v.ok && (v.note === 'the page won’t load' || v.note === 'its name isn’t on the page' || v.note === 'the page is empty or blocked')) {
          const quoted = await viaGoogle(url, c)
          if (quoted) { page = quoted; v = pageVerdict(c, quoted.text, today, { minLength: 40 }); if (v.ok) v = { ...v, note: `${v.note} (read by Google)` } }
        }
        if (!page) { last = v.note; continue }
        if (v.ok) {
          kept.push({ ...c, url: page.url, dedupe_key: dedupeKey(c), source, source_ref: sourceRef, verify_note: v.note })
          return
        }
        last = v.note
      }
      if (last === 'the page won’t load' || last === 'its name isn’t on the page') {
        const ok = await confirmBySearch(c)
        if (ok) { kept.push({ ...c, url: ok.url ? await realUrl(ok.url) : null, dedupe_key: dedupeKey(c), source, source_ref: sourceRef, verify_note: ok.note }); return }
      }
      // From a newsletter, the email itself is the source: a dated thing on a coming day is kept on its word.
      if (source === 'email' && c.when && c.when.slice(0, 10) >= today && c.when.slice(0, 10) <= addDays(today, AHEAD_DAYS)) {
        kept.push({ ...c, dedupe_key: dedupeKey(c), source, source_ref: sourceRef, verify_note: 'from the newsletter' })
        return
      }
      rejected.push({ title: c.title!, note: last, url: c.url })
    }

    // 2. Restaurants on Google Places: newly opened ones by name, hidden gems by kind.
    const placesSearch = async (textQuery: string, max = 8) => {
      if (!mapsKey || !home) return []
      const res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': mapsKey, 'X-Goog-FieldMask': PLACE_FIELDS },
        body: JSON.stringify({ textQuery, maxResultCount: max, locationBias: { circle: { center: { latitude: home.lat, longitude: home.lng }, radius: 35000 } } }),
      }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
      return (res?.places ?? []) as Array<Record<string, any>>
    }
    const seenPlaces = new Set<string>()
    const keepPlace = (p: Record<string, any>, fresh: boolean, why: string | null) => {
      if (!p?.id || seenPlaces.has(p.id)) return
      seenPlaces.add(p.id)
      const v = restaurantVerdict(p, home, { fresh })
      const title = String(p.displayName?.text ?? '')
      if (!v.ok) { rejected.push({ title, note: v.note }); return }
      const c = { kind: 'restaurant', title, when: null, recurring: null, place: title, address: p.formattedAddress ?? null, url: p.websiteUri ?? p.googleMapsUri ?? null, why: why ?? p.editorialSummary?.text ?? p.primaryTypeDisplayName?.text ?? null, free: null }
      kept.push({ ...c, dedupe_key: dedupeKey(c), drive_min: v.minutes, rating: p.rating, rating_count: p.userRatingCount, gem: Boolean(v.gem), google_place_id: p.id, source: fresh ? 'search' : 'places', verify_note: v.note })
    }
    await inBatches(freshRestaurants, 4, async (c) => {
      const [p] = await placesSearch(`${c.title} ${c.address ?? c.place ?? 'West Palm Beach FL'}`, 1)
      if (p) keepPlace(p, true, c.why)
      else rejected.push({ title: c.title!, note: 'not on Google' })
    })
    await inBatches(GEM_QUERIES, 4, async (q) => { for (const p of await placesSearch(q)) keepPlace(p, false, null) })

    // 3. Events: each one's own page.
    await inBatches(events, 6, (e) => verifyEvent(e))

    // 4. The newsletters (the last eight days, each once).
    const minedIds = new Set<string>([...(mined?.value?.mined ?? []), ...((known ?? []).map((k: { source_ref: string | null }) => k.source_ref).filter(Boolean))])
    const { data: letters } = await sb.from('gmail_processed_messages').select('gmail_message_id, from_email, subject, email_subject, email_body, received_at')
      .gte('received_at', new Date(Date.now() - 8 * 86_400_000).toISOString()).or(NEWSLETTERS.map((p) => `from_email.ilike.${p}`).join(',')).limit(12)
    const fresh = (letters ?? []).filter((l: { gmail_message_id: string }) => !minedIds.has(l.gmail_message_id))
    for (const l of fresh as Array<Record<string, string>>) {
      const res = await gemini(TALK_PLAN_GEMINI_MODEL, {
        contents: [{ parts: [{ text: newsletterPrompt({ from_email: l.from_email, subject: l.email_subject ?? l.subject, body: l.email_body }, today) }] }],
        generationConfig: { maxOutputTokens: 3000, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
      })
      const items = parseCandidates(textOf(res), 'couple', today)
      for (const c of items) {
        if (c.kind === 'restaurant') {
          const [p] = await placesSearch(`${c.title} ${c.address ?? c.place ?? 'West Palm Beach FL'}`, 1)
          if (p) keepPlace(p, true, c.why)
        } else await verifyEvent({ c, grounding: [] }, 'email', l.gmail_message_id)
      }
      minedIds.add(l.gmail_message_id)
    }

    // 5. Keep: new ones in; ones already there refreshed (their status and when they were offered stay).
    const byKey = new Map<string, Kept>()
    for (const k of kept) if (!byKey.has(k.dedupe_key)) byKey.set(k.dedupe_key, k)
    const known_ = new Map((known ?? []).map((k: { dedupe_key: string; status: string }) => [k.dedupe_key, k.status]))
    const rows = [...byKey.values()].filter((k) => known_.get(k.dedupe_key) !== 'not_for_us' && !isBait(k)).map((k) => ({
      dedupe_key: k.dedupe_key, kind: k.kind, title: k.title, when: k.when, recurring: k.recurring, place: k.place, address: k.address, url: k.url, why: k.why, free: k.free,
      drive_min: k.drive_min ?? null, rating: k.rating ?? null, rating_count: k.rating_count ?? null, gem: k.gem ?? false, google_place_id: k.google_place_id ?? null,
      source: k.source, source_ref: k.source_ref ?? null, verify_note: k.verify_note, verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      // Checked again: back on the list, keeping what the family said of it (saved, been) and when it was offered.
      status: ['saved', 'been', 'offered'].includes(String(known_.get(k.dedupe_key))) ? known_.get(k.dedupe_key) : 'new',
    }))
    // The same thing found another way (a calendar, a newsletter, another search) is one row: fold into what's kept.
    const folded = foldIn(rows, (known ?? []) as Array<Record<string, unknown>>).map((r: Record<string, any>) => ({
      dedupe_key: r.dedupe_key, kind: r.kind, title: r.title, when: r.when ?? null, recurring: r.recurring ?? null, place: r.place ?? null, address: r.address ?? null,
      url: r.url ?? null, why: r.why ?? null, free: r.free ?? null, drive_min: r.drive_min ?? null, rating: r.rating ?? null, rating_count: r.rating_count ?? null,
      gem: r.gem ?? false, google_place_id: r.google_place_id ?? null, source: r.source, source_ref: r.source_ref ?? null, verify_note: r.verify_note ?? null,
      verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      status: r.status === 'expired' ? 'new' : r.status ?? 'new',
    }))
    if (body.dry_run) return { kept: folded, rejected, newsletters: fresh.length, readerLog }
    if (folded.length) {
      const { error } = await sb.from('outings').upsert(folded, { onConflict: 'dedupe_key', ignoreDuplicates: false })
      if (error) throw new Error(error.message)
    }
    // Past ones put away.
    await sb.from('outings').update({ status: 'expired', updated_at: new Date().toISOString() }).lt('when', today).in('status', ['new', 'offered', 'saved'])
    await sb.from('settings').upsert({ key: 'scout_state', value: { researched_at: new Date().toISOString(), kept: rows.length, rejected: rejected.length, mined: [...minedIds].slice(-200) } }, { onConflict: 'key' })
    return { kept: folded.length, rejected: rejected.length, newsletters: fresh.length }
  }

  if (body.dry_run) {
    try { return json(await run()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
  }
  // The cron waits ten seconds at most: the research runs on after the answer.
  // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
  EdgeRuntime.waitUntil(run().catch((e) => console.error('[scout]', e)))
  return json({ ok: true, started: true }, 202)
})
