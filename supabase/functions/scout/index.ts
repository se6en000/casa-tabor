// The Scout (Jake, Oct 8): twice a week, research what's worth doing within half an hour of home — new and hidden-gem
// restaurants, free workouts (yoga, pilates, run clubs, pickleball), evenings out for two, weekend family outings — and
// keep only what checks out (scout.mjs). The newsletters the family subscribes to (the Palm Beach Post, the city) are
// mined too. POST { action: 'research', force?, dry_run? } | { action: 'list' } | { action: 'feedback', id, status }
// | { action: 'news', force?, dry_run? } (the paper's Around town, each morning)
// | { action: 'calendars', dry_run? } (live music, comedy and trivia from local calendars, each morning)
// | { action: 'details', id } (what an outing's own page says, for its card — read once, kept a week)
// | { action: 'rate_ask', dry_run? } (the local guide: yesterday's outings, asked about in Something for you, each morning)
// | { action: 'guide', dry_run? } (the local guide's week of research: places worth trying) | { action: 'guide_feedback', id, status }.
// | { action: 'list_add', name|google_place_id, town?, status?, whose?, origin?, note?, said?, like_of? } (a place on their list)
// | { action: 'watch_add', name, kind, whose?, query?, note? } | { action: 'watch', id?, force?, dry_run? } (new dates for what they watch)
// | { action: 'like', id } (More like this: the same scene near home, not saved).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { TALK_PLAN_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { createTrackedMapsFetch, createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import {
  AHEAD_DAYS, NEWS_SENDERS, SCOUT_LANES, dedupeKey, laneSearchPrompt, newsletterPrompt, pageText, pageVerdict,
  CALENDARS, CALENDAR_KINDS, calendarReach, detailsPrompt, foldIn, isBait, keptTwice, notLiveMusic, parseDetails, parseCandidates, parseSflmGigs, parseTownNews, parseTriviaSchedule,
  MAJOR_AHEAD_DAYS, collapseRuns, parseImprov, parseTicketmaster, parseWeekendBroward, ticketmasterUrls, restaurantVerdict, weekendBrowardNext, townInReach, townNewsPrompt,
  searchDetailsPrompt, venueKey, venuePrompt, parseVenues, venueKindOf, actKey, actPrompt, parseActs, actStanding,
} from '../_shared/scout.mjs'
import {
  GUIDE_AREAS, TASTE_KEY, townOf, guideDriveMin, buzzPrompt, curatePrompt, guideLabels, guideScore, guideShelves, heardLine, parseBuzz, parseCurate, parseRateAsk, placeVerdict,
  rateAskPrompt, rateCandidates, rateRows, reviewTrend, sameName, tasteOf,
} from '../_shared/guide.mjs'
import { GUIDE_SHELVES } from '../_shared/guide.mjs'
import { sharedShelf } from '../_shared/share-in.mjs'
import { DOSSIER_FIELDS, dossierPrompt, googleFacts, parseDossier } from '../_shared/place-dossier.mjs'
import { UNCHECKED, WATCH_DAYS, collapseWatchDates, watchTooFar, calendarHits, tallyLeanings, likePrompt, parseLike, parseWatchEvents, watchOuting, watchPrompt } from '../_shared/your-list.mjs'

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

const LIST_FIELDS = 'id,displayName,formattedAddress,rating,userRatingCount,businessStatus,location,primaryTypeDisplayName,types,websiteUri,googleMapsUri'
const WHOSE = ['us', 'family', 'jake', 'kelly']

/** What the list's own jobs need (adding, watching, More like this): home, the AI's key, Maps, their taste. */
// deno-lint-ignore no-explicit-any
async function listCtx(sb: any) {
  const [{ data: homeRow }, { data: llmRow }, { data: tasteRow }] = await Promise.all([
    sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
    sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
    sb.from('settings').select('value').eq('key', TASTE_KEY).maybeSingle(),
  ])
  const llm = resolveBackgroundLlmConfig((llmRow as any)?.value) as { api_key?: string }
  const geo = (homeRow as any)?.value?.geocode_cache
  return {
    llmKey: llm?.api_key ?? null,
    mapsKey: Deno.env.get('GOOGLE_MAPS_API_KEY') ?? null,
    home: typeof geo?.lat === 'number' ? { lat: geo.lat as number, lng: geo.lng as number } : null,
    taste: tasteOf((tasteRow as any)?.value),
  }
}

/** Google Places: the best match for words near home, or a place by its id. */
async function findPlace(mapsKey: string, home: { lat: number; lng: number }, q: { text?: string; id?: string }, purpose: string) {
  if (q.id) {
    return mapsFetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(q.id)}`, { headers: { 'X-Goog-Api-Key': mapsKey, 'X-Goog-FieldMask': LIST_FIELDS } }, { callPurpose: purpose })
      .then((r: Response) => (r.ok ? r.json() : null)).catch(() => null) as Promise<Record<string, any> | null>
  }
  const res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': mapsKey, 'X-Goog-FieldMask': LIST_FIELDS.split(',').map((f) => `places.${f}`).join(',') },
    body: JSON.stringify({ textQuery: q.text, maxResultCount: 1, locationBias: { circle: { center: { latitude: home.lat, longitude: home.lng }, radius: 30000 } } }),
  }, { callPurpose: purpose }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
  return (res?.places?.[0] ?? null) as Record<string, any> | null
}

/** Google's facts about a place, as guide_places keeps them. */
function placeFacts(p: Record<string, any>, home: { lat: number; lng: number }, reachMin: number) {
  // Their own place: the drive whatever Google's stars say (Mary Lou's, 3.5, came back with none).
  const minutes = p.location ? guideDriveMin(home, { lat: p.location.latitude, lng: p.location.longitude }) : null
  return {
    google_place_id: p.id, name: String(p.displayName?.text ?? ''), address: p.formattedAddress ?? null, types: p.primaryTypeDisplayName?.text ?? null,
    lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null, drive_min: minutes, beyond: minutes != null && minutes > reachMin,
    rating: p.rating ?? null, rating_count: p.userRatingCount ?? null, maps_url: p.googleMapsUri ?? null, website: p.websiteUri ?? null,
    seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }
}

/** One grounded Gemini search: its words, and the pages it read. */
async function grounded(llmKey: string, prompt: string, purpose: string, maxOutputTokens = 3000) {
  const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llmKey}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } } }),
  }, { callPurpose: purpose }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
  const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((x) => !x.thought).map((x) => x.text ?? '').join('')
  const urls = ((res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{ web?: { uri?: string } }>).map((c) => c.web?.uri).filter(Boolean) as string[]
  return { text, urls }
}

/** A watch's new dates (the Candlelight concerts, Ballet Palm Beach): searched, each checked on its page, kept as outings. */
// deno-lint-ignore no-explicit-any
async function lookWatch(sb: any, llmKey: string, w: Record<string, any>, today: string, dryRun = false) {
  const until = addDays(today, WATCH_DAYS)
  const { text } = await grounded(llmKey, watchPrompt(w, { today, until }), 'guide-watch', 4000)
  const found = parseWatchEvents(text, { today, until }) as Array<{ title: string; date: string; time: string | null; url: string; venue: string | null; town: string | null; price_from: number | null; line: string | null }>
  const kept: Array<Record<string, unknown>> = []
  const dropped: Record<string, number> = {}
  const misses: string[] = []
  const pages = new Map<string, { text: string; url: string } | null>()
  const ok: Array<typeof found[number] & { url: string; note: string }> = []
  await inBatches(found, 4, async (e) => {
    if (watchTooFar(e)) { dropped['too far'] = (dropped['too far'] ?? 0) + 1; return }
    if (!pages.has(e.url)) pages.set(e.url, await fetchPage(e.url))
    const page = pages.get(e.url)
    // A page that opens must show it; one that won't (Fever, the Kravis block readers) keeps it, said so on the page.
    const opened = (page?.text?.length ?? 0) >= 200
    const v = opened ? pageVerdict({ title: e.title, kind: 'couple', when: e.date }, page!.text, today, { aheadDays: WATCH_DAYS }) : { ok: true, note: UNCHECKED }
    if (!v.ok) { dropped[v.note] = (dropped[v.note] ?? 0) + 1; if (dryRun) misses.push(`${v.note}: ${e.date} ${e.title} ${e.url} (${page?.url ?? '-'}, ${page?.text?.length ?? 0} chars)`); return }
    ok.push({ ...e, url: page?.url ?? e.url, note: v.note })
  })
  // One line a show, its other days as also.
  for (const e of collapseWatchDates(ok)) {
    const row = watchOuting(e, w) as Record<string, any>
    kept.push({ ...row, url: e.url, dedupe_key: dedupeKey(row), verify_note: e.note, status: 'new', verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
  }
  if (!dryRun) {
    if (kept.length) {
      const { error } = await sb.from('outings').upsert(kept, { onConflict: 'dedupe_key', ignoreDuplicates: false })
      if (error) throw new Error(error.message)
    }
    await sb.from('guide_watch').update({ looked_at: new Date().toISOString() }).eq('id', w.id)
  }
  return { watch: w.name, found: found.length, kept: kept.length, dropped, ...(dryRun ? { dates: kept.map((k) => `${k.when} ${k.title} — ${k.place}`), misses: misses.slice(0, 8) } : {}) }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  const body = await req.json().catch(() => ({})) as { action?: string; force?: boolean; dry_run?: boolean; days?: number; id?: string; status?: string; lanes?: number[] }
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
  const today = ymdNY()

  if (body.action === 'list') {
    // Today on (and the weekly ones), soonest first — the big rooms add hundreds (Ticketmaster, four months out).
    const { data } = await sb.from('outings').select('*').in('status', ['new', 'offered', 'saved']).or(`when.is.null,when.gte.${today}`).order('when', { ascending: true, nullsFirst: false }).limit(1500)
    const found = (data ?? []).filter((o: { when: string | null }) => !o.when || o.when.slice(0, 10) >= today)
    // Each gig its act (Oct 9): would they know it, what it plays, and where it stands for them (their genres).
    const [{ data: acts }, { data: tasteRow }] = await Promise.all([
      sb.from('music_acts').select('act_key, known, plays, tribute_of, genre').limit(5000),
      sb.from('settings').select('value').eq('key', TASTE_KEY).maybeSingle(),
    ])
    const genres = tasteOf(tasteRow?.value).genres
    const byKey = new Map(((acts ?? []) as Array<{ act_key: string; known: string; plays: string; tribute_of: string | null; genre: string | null }>).map((a) => [a.act_key, a]))
    const live = found.map((o: Record<string, any>) => {
      if (o.kind !== 'music') return o
      const a = byKey.get(actKey(o.title))
      return { ...o, act: a ? { known: a.known, plays: a.plays, of: a.tribute_of, genre: a.genre, standing: actStanding(a, genres) } : { standing: actStanding(null, genres) } }
    })
    // The paper's third page: the latest morning's news (a day or two old at most).
    const { data: news } = await sb.from('town_news').select('section, headline, line, source, source_date, rank, news_date, on_date')
      .gte('news_date', addDays(today, -2)).order('news_date', { ascending: false }).limit(40)
    const latest = news?.[0]?.news_date
    // The local guide's places worth trying (canvas 85B), best first; Not for us stays out.
    const { data: guide } = await sb.from('guide_places').select('id, name, address, shelf, shelf_label, drive_min, beyond, rating, rating_count, maps_url, website, buzz, labels, heard, why, touristy, status, whose, origin, note, saved_at, score, types')
      .in('status', ['live', 'saved', 'spot']).order('score', { ascending: false }).limit(300)
    // Out & about from your list (canvas 86C): what they watch for, and which of their places are on the calendar.
    const mine = (guide ?? []).filter((g: { status: string }) => g.status === 'saved' || g.status === 'spot')
    const half = new Date(Date.now() - 180 * 86_400_000).toISOString()
    const [{ data: watches }, { data: events }, { data: saidOutings }, { data: saidPlaces }] = await Promise.all([
      sb.from('guide_watch').select('id, name, kind, whose, note').eq('status', 'on').limit(50),
      sb.from('events').select('title, location_name, start_time').gte('start_time', addDays(today, -365)).lt('start_time', addDays(today, 61)).limit(5000),
      // What they lean toward (Oct 10: "based on feedback and adaptive predictions"): the last half year's answers.
      sb.from('outings').select('kind, venue_kind, watch_id, status').in('status', ['saved', 'been', 'not_for_us']).gte('updated_at', half).limit(2000),
      sb.from('guide_places').select('name, shelf, status').in('status', ['saved', 'spot', 'been', 'not_for_us']).gte('updated_at', half).limit(2000),
    ])
    const leanings = tallyLeanings({ outings: saidOutings ?? [], places: saidPlaces ?? [] })
    return json({ outings: live, news: (news ?? []).filter((n: { news_date: string }) => n.news_date === latest), guide: guide ?? [], watches: watches ?? [], calendar: calendarHits(mine, events ?? [], today), leanings, today })
  }

  if (body.action === 'feedback') {
    if (!body.id || !['saved', 'not_for_us', 'been', 'new'].includes(String(body.status))) return json({ error: 'Which, and what?' }, 400)
    const { error } = await sb.from('outings').update({ status: body.status, updated_at: new Date().toISOString() }).eq('id', body.id)
    return error ? json({ error: error.message }, 500) : json({ ok: true })
  }

  if (body.action === 'rate_ask') {
    // The morning after (canvas 85C): the last two days' outings on the calendar, asked about in Something for you.
    // The morning's run is the last two days; a dry run or a forced one may look further back (a week at most to keep).
    const back = body.dry_run || body.force ? Math.min(7, Math.max(2, Number(body.days) || 2)) : 2
    const find = async () => {
      const [{ data: homeRow }, { data: llmRow }, { data: events }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
        sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
        sb.from('events').select('id, title, start_time, all_day, event_type, status, location_name, address, leg_type, recurrence_master_id, record_kind, event_members(family_member:family_members(id, name, role))')
          .gte('start_time', new Date(Date.now() - (back + 1) * 86_400_000).toISOString()).lt('start_time', new Date().toISOString()).limit(600),
      ])
      const past = ((events ?? []) as Array<Record<string, unknown>>)
        .filter((e) => ymdNY(new Date(String(e.start_time))) < today && ymdNY(new Date(String(e.start_time))) >= addDays(today, -back))
        .map((e) => ({
          ...e,
          recurring: Boolean(e.recurrence_master_id) || e.record_kind === 'occurrence',
          members: ((e.event_members ?? []) as Array<{ family_member: { id: string; name: string; role: string } | null }>).map((m) => m.family_member).filter(Boolean),
        }))
      const candidates = rateCandidates(past, { home: homeRow?.value?.address ?? null })
      if (!candidates.length) return { candidates: 0, asked: 0 }
      const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
      if (!llm?.api_key) throw new Error('AI not configured')
      const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: rateAskPrompt(candidates) }] }],
          generationConfig: { maxOutputTokens: 200, temperature: 0, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        }),
      }, { callPurpose: 'guide-rate-ask' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
      const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      const kept = parseRateAsk(text, candidates.length)
      const rows = rateRows(candidates, kept)
      if (body.dry_run) return { candidates: candidates.map((c) => `${c.title} @ ${c.place}`), kept: kept.map((i) => candidates[i].title), rows: rows.length }
      if (rows.length) {
        const { error } = await sb.from('outing_ratings').upsert(rows, { onConflict: 'event_id,member_id', ignoreDuplicates: true })
        if (error) throw new Error(error.message)
      }
      return { candidates: candidates.length, asked: rows.length }
    }
    if (body.dry_run) {
      try { return json(await find()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
    }
    // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
    EdgeRuntime.waitUntil(find().then((r) => console.log('[scout rate_ask]', JSON.stringify(r))).catch((e) => console.error('[scout rate_ask]', e)))
    return json({ ok: true, started: true }, 202)
  }

  if (body.action === 'guide') {
    // The local guide's week of research (canvas 85B; guide.mjs): places worth trying, by what they love.
    const research = async () => {
      const [{ data: homeRow }, { data: llmRow }, { data: tasteRow }, { data: known }, { data: snaps }] = await Promise.all([
        sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
        sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
        sb.from('settings').select('value').eq('key', TASTE_KEY).maybeSingle(),
        sb.from('guide_places').select('google_place_id, status, created_at').limit(3000),
        sb.from('guide_place_counts').select('google_place_id, seen_on, rating, rating_count').gte('seen_on', addDays(today, -31)).limit(20000),
      ])
      const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
      if (!llm?.api_key) throw new Error('AI not configured')
      const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
      const geo = homeRow?.value?.geocode_cache
      const home = typeof geo?.lat === 'number' ? { lat: geo.lat as number, lng: geo.lng as number } : null
      if (!mapsKey || !home) throw new Error('No Maps key or home')
      const taste = tasteOf(tasteRow?.value)
      const shelves = guideShelves(taste)
      const gemini = (payload: unknown) => providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload),
      }, { callPurpose: 'guide-research' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
      const textOf = (res: any) => ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.businessStatus,places.location,places.primaryTypeDisplayName,places.types,places.websiteUri,places.googleMapsUri'
      const search = async (textQuery: string, center: { lat: number; lng: number }, max = 20) => {
        const res = await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': mapsKey, 'X-Goog-FieldMask': FIELDS },
          body: JSON.stringify({ textQuery, maxResultCount: max, locationBias: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: 12000 } } }),
        }, { callPurpose: 'guide-places' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
        return (res?.places ?? []) as Array<Record<string, any>>
      }
      type Found = { p: Record<string, any>; shelf: { id: string; label: string }; minutes: number; beyond: boolean }
      const found = new Map<string, Found>()
      const notes: Record<string, number> = {}
      const take = (p: Record<string, any>, shelf: { id: string; label: string }) => {
        if (!p?.id || found.has(p.id)) return
        const v = placeVerdict(p, home, taste.reachMin)
        if (!v.ok) { notes[v.note.replace(/\d+(\.\d+)?/g, 'N')] = (notes[v.note.replace(/\d+(\.\d+)?/g, 'N')] ?? 0) + 1; return }
        found.set(p.id, { p, shelf, minutes: v.minutes, beyond: v.beyond })
      }
      // 1. Google, shelf by shelf, area by area.
      const areas = GUIDE_AREAS.map((a) => (a.id === 'home' ? { ...a, lat: home.lat, lng: home.lng } : a)) as Array<{ lat: number; lng: number }>
      const jobs = shelves.flatMap((shelf) => shelf.queries.flatMap((q) => areas.map((area) => ({ shelf, q, area }))))
      await inBatches(jobs, 6, async ({ shelf, q, area }) => { for (const p of await search(q, area)) take(p, shelf) })
      // 2. What locals and the local press say, shelf by shelf (one grounded search each).
      const buzzBy = new Map<string, Array<{ kind: string; said: string | null; new: boolean; url: string | null }>>()
      const lookups: Array<{ b: ReturnType<typeof parseBuzz>[number]; shelf: { id: string; label: string }; url: string | null }> = []
      await Promise.all(shelves.map(async (shelf) => {
        const res = await gemini({
          contents: [{ parts: [{ text: buzzPrompt(shelf, longDay(today)) }] }],
          tools: [{ google_search: {} }],
          generationConfig: { maxOutputTokens: 2500, temperature: 0.2, thinkingConfig: { thinkingBudget: 0 } },
        })
        const urls = ((res?.candidates?.[0]?.groundingMetadata?.groundingChunks ?? []) as Array<{ web?: { uri?: string; title?: string } }>).map((c) => c.web?.uri).filter(Boolean) as string[]
        for (const b of parseBuzz(textOf(res))) {
          const hit = [...found.values()].find((f) => sameName(f.p.displayName?.text, b.name))
          const entry = { kind: b.kind, said: b.said, new: b.new, url: urls[0] ?? null }
          if (hit) buzzBy.set(hit.p.id, [...(buzzBy.get(hit.p.id) ?? []), entry])
          else lookups.push({ b, shelf, url: urls[0] ?? null })
        }
      }))
      // Talked about but not found by the shelves' searches: looked up by name (a few).
      await inBatches(lookups.slice(0, 25), 5, async ({ b, shelf, url }) => {
        const [p] = await search(`${b.name} ${b.town ?? ''} FL`, home, 1)
        if (!p || !sameName(p.displayName?.text, b.name)) return
        take(p, shelf)
        if (found.has(p.id)) buzzBy.set(p.id, [...(buzzBy.get(p.id) ?? []), { kind: b.kind, said: b.said, new: b.new, url }])
      })
      // 3. This week's review counts (a month of them kept), and each place's trend.
      const counts = [...found.values()].map((f) => ({ google_place_id: f.p.id, seen_on: today, rating: f.p.rating ?? null, rating_count: f.p.userRatingCount ?? null }))
      const history = new Map<string, Array<{ seen_on: string; rating_count: number }>>()
      for (const s of [...(snaps ?? []), ...counts] as Array<{ google_place_id: string; seen_on: string; rating_count: number }>) history.set(s.google_place_id, [...(history.get(s.google_place_id) ?? []).filter((x) => x.seen_on !== s.seen_on), s])
      // 4. The AI's look: still the kind of place, touristy or not, and why these two.
      const list = [...found.values()].map((f) => ({
        id: f.p.id, name: String(f.p.displayName?.text ?? ''), shelf_label: f.shelf.label, address: f.p.formattedAddress ?? null,
        types: f.p.primaryTypeDisplayName?.text ?? (f.p.types ?? []).slice(0, 3).join(', '), rating: f.p.rating, rating_count: f.p.userRatingCount,
        said: (buzzBy.get(f.p.id) ?? []).find((b) => b.said)?.said ?? null,
      }))
      const looks = new Map<string, { keep: boolean; touristy: boolean; why: string | null }>()
      const batches = Array.from({ length: Math.ceil(list.length / 50) }, (_, i) => list.slice(i * 50, i * 50 + 50))
      await inBatches(batches, 4, async (batch) => {
        const res = await gemini({
          contents: [{ parts: [{ text: curatePrompt(batch, taste) }] }],
          generationConfig: { maxOutputTokens: 6000, temperature: 0.3, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
        })
        for (const [i, look] of parseCurate(textOf(res), batch.length)) looks.set(batch[i].id, look)
      })
      // 5. Labels on evidence; past the usual drive only with one.
      const status = new Map(((known ?? []) as Array<{ google_place_id: string; status: string }>).map((k) => [k.google_place_id, k.status]))
      const rows = []
      for (const f of found.values()) {
        const look = looks.get(f.p.id) ?? { keep: true, touristy: false, why: null }
        if (!look.keep) continue
        const buzz = buzzBy.get(f.p.id) ?? []
        const trend = reviewTrend(history.get(f.p.id) ?? [], new Date())
        const base = { rating: f.p.rating, rating_count: f.p.userRatingCount, touristy: look.touristy }
        const labels = guideLabels(base, { buzz, trend })
        if (f.beyond && !labels.length) continue
        const row = {
          google_place_id: f.p.id, name: String(f.p.displayName?.text ?? ''), address: f.p.formattedAddress ?? null, shelf: f.shelf.id, shelf_label: f.shelf.label,
          types: f.p.primaryTypeDisplayName?.text ?? null, lat: f.p.location?.latitude ?? null, lng: f.p.location?.longitude ?? null, drive_min: f.minutes, beyond: f.beyond,
          rating: f.p.rating ?? null, rating_count: f.p.userRatingCount ?? null, maps_url: f.p.googleMapsUri ?? null, website: f.p.websiteUri ?? null,
          buzz, mentions: buzz.length, labels, heard: heardLine(base, { buzz, trend }), why: look.why, touristy: look.touristy,
          status: status.get(f.p.id) ?? 'live', seen_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }
        rows.push({ ...row, score: Math.round(guideScore(row) * 100) / 100 })
      }
      rows.sort((a, b) => b.score - a.score)
      const summary = {
        shelves: shelves.map((s) => s.id), searches: jobs.length, lookups: Math.min(25, lookups.length), found: found.size, kept: rows.length,
        labeled: { local: rows.filter((r) => r.labels.includes('local')).length, hot: rows.filter((r) => r.labels.includes('hot')).length, gem: rows.filter((r) => r.labels.includes('gem')).length },
        touristy: rows.filter((r) => r.touristy).length, dropped: notes,
      }
      if (body.dry_run) return { ...summary, top: rows.slice(0, 30).map((r) => `${r.name} (${r.shelf}, ${r.drive_min} min) ${r.labels.join('+') || '-'} · ${r.heard} · ${r.why ?? ''}`) }
      if (counts.length) await sb.from('guide_place_counts').upsert(counts, { onConflict: 'google_place_id,seen_on' })
      await sb.from('guide_place_counts').delete().lt('seen_on', addDays(today, -31))
      for (let i = 0; i < rows.length; i += 200) {
        const { error } = await sb.from('guide_places').upsert(rows.slice(i, i + 200), { onConflict: 'google_place_id' })
        if (error) throw new Error(error.message)
      }
      // Their list (saved, spots, been, Not for us) is theirs: Google's facts about those refreshed by id, never dropped
      // (Oct 10: the month-old delete took every place not found again — Loco would have gone in November).
      const { data: theirs } = await sb.from('guide_places').select('id, google_place_id').neq('status', 'live').lt('seen_at', new Date(Date.now() - 6 * 86_400_000).toISOString()).limit(200)
      await inBatches((theirs ?? []) as Array<{ id: string; google_place_id: string }>, 5, async (t) => {
        const p = await findPlace(mapsKey, home, { id: t.google_place_id }, 'guide-refresh')
        if (p?.id) { const { name: _n, ...facts } = placeFacts(p, home, taste.reachMin); await sb.from('guide_places').update(facts).eq('id', t.id) }
      })
      // Google's terms: what it said about a place is kept a month at most — the guide's own picks go.
      await sb.from('guide_places').delete().eq('status', 'live').lt('seen_at', new Date(Date.now() - 30 * 86_400_000).toISOString())
      return summary
    }
    if (body.dry_run) {
      try { return json(await research()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
    }
    // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
    EdgeRuntime.waitUntil(research().then((r) => console.log('[scout guide]', JSON.stringify(r))).catch((e) => console.error('[scout guide]', e)))
    return json({ ok: true, started: true }, 202)
  }

  // Out & about from your list (canvas 86C–F). Add a place: by name (Alexa, the phone, the taste list) or by Google id
  // (More like this) — to try, or a spot; a spot stays a spot.
  if (body.action === 'list_add') {
    const b = body as Record<string, any>
    const name = String(b.name ?? '').trim()
    if (!name && !b.google_place_id) return json({ error: 'Which place?' }, 400)
    const ctx = await listCtx(sb)
    if (!ctx.mapsKey || !ctx.home) return json({ error: 'No Maps key or home' }, 500)
    const p = await findPlace(ctx.mapsKey, ctx.home, b.google_place_id ? { id: String(b.google_place_id) } : { text: `${name} ${b.town ?? ''} FL`.replace(/\s+/g, ' ') }, 'list-add')
    if (!p?.id) return json({ found: false, said: `I couldn’t find ${name || 'it'} on Google Maps.` })
    const facts = placeFacts(p, ctx.home, ctx.taste.reachMin)
    const status = b.status === 'spot' ? 'spot' : 'saved'
    const whose = WHOSE.includes(b.whose) ? b.whose : null
    const origin = ['taste', 'asked', 'like', 'added', 'alexa', 'shared'].includes(b.origin) ? b.origin : 'added'
    const note = typeof b.note === 'string' && b.note.trim() ? b.note.trim().slice(0, 200) : null
    const { data: existing } = await sb.from('guide_places').select('id, status, origin, saved_at').eq('google_place_id', p.id).maybeSingle()
    if (existing) {
      const { name: _name, ...google } = facts
      const patch: Record<string, unknown> = { ...google, status: existing.status === 'spot' ? 'spot' : status, saved_at: existing.saved_at ?? new Date().toISOString() }
      if (whose) patch.whose = whose
      if (note) patch.note = note
      if (existing.origin === 'guide' || existing.status === 'live' || existing.status === 'not_for_us') patch.origin = origin
      if (b.like_of) patch.like_of = b.like_of
      const { error } = await sb.from('guide_places').update(patch).eq('id', existing.id)
      if (error) return json({ error: error.message }, 500)
      return json({ found: true, already: existing.status === 'saved' || existing.status === 'spot', was: existing.status, id: existing.id, name: facts.name, town: townOf(facts.address), minutes: facts.drive_min })
    }
    const shelf = sharedShelf(GUIDE_SHELVES, `${b.what ?? ''} ${facts.types ?? ''} ${(p.types ?? []).join(' ')}`)
    const row = {
      ...facts, shelf: shelf.id, shelf_label: shelf.label, buzz: b.said ? [{ kind: 'shared', said: String(b.said).slice(0, 200), new: false, url: null }] : [],
      mentions: 0, labels: [], heard: null, why: null, touristy: false, status, whose: whose ?? 'us', origin, note, saved_at: new Date().toISOString(), like_of: b.like_of ?? null,
    }
    const { data: inserted, error } = await sb.from('guide_places').insert({ ...row, score: Math.round(guideScore(row) * 100) / 100 }).select('id').single()
    if (error) return json({ error: error.message }, 500)
    return json({ found: true, already: false, id: inserted.id, name: facts.name, town: townOf(facts.address), minutes: facts.drive_min })
  }

  // Watch for a kind of night (Alexa: "we loved the Candlelight concert, find more of those"): kept, and looked up now.
  if (body.action === 'watch_add') {
    const b = body as Record<string, any>
    const name = String(b.name ?? '').trim().slice(0, 120)
    if (!name) return json({ error: 'Watch for what?' }, 400)
    const row = { name, kind: b.kind === 'asked' ? 'asked' : 'again', whose: WHOSE.includes(b.whose) ? b.whose : 'us', query: String(b.query ?? name).trim().slice(0, 300), note: typeof b.note === 'string' ? b.note.trim().slice(0, 200) || null : null }
    const { data: same } = await sb.from('guide_watch').select('id, name, kind, whose, query, note').ilike('name', name).maybeSingle()
    const { data: w, error } = same ? await sb.from('guide_watch').update({ ...row, status: 'on' }).eq('id', same.id).select('*').single() : await sb.from('guide_watch').insert(row).select('*').single()
    if (error || !w) return json({ error: error?.message ?? 'not saved' }, 500)
    const ctx = await listCtx(sb)
    if (ctx.llmKey) {
      // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
      EdgeRuntime.waitUntil(lookWatch(sb, ctx.llmKey, w, today).then((r) => console.log('[scout watch]', JSON.stringify(r))).catch((e) => console.error('[scout watch]', e)))
    }
    return json({ ok: true, watch: { id: w.id, name: w.name, kind: w.kind, whose: w.whose }, again: Boolean(same) })
  }

  // Each watch's new dates, once a week each (the morning calendars run asks; force or one id to look now).
  if (body.action === 'watch') {
    const b = body as Record<string, any>
    const ctx = await listCtx(sb)
    if (!ctx.llmKey) return json({ error: 'AI not configured' }, 500)
    let q = sb.from('guide_watch').select('*').eq('status', 'on')
    if (b.id) q = q.eq('id', b.id)
    else if (!b.force) q = q.or(`looked_at.is.null,looked_at.lt.${new Date(Date.now() - 6 * 86_400_000).toISOString()}`)
    const { data: due } = await q.limit(20)
    const run = () => inBatches((due ?? []) as Array<Record<string, any>>, 3, (w) => lookWatch(sb, ctx.llmKey!, w, today, Boolean(body.dry_run)))
    if (body.dry_run) return json({ looked: await run() })
    // @ts-ignore EdgeRuntime is provided by Supabase's edge runtime
    EdgeRuntime.waitUntil(run().then((r) => console.log('[scout watch]', JSON.stringify(r))).catch((e) => console.error('[scout watch]', e)))
    return json({ ok: true, started: (due ?? []).length }, 202)
  }

  // More like this (canvas 86F): the same scene, near home, none they already know — found, checked on Maps, not saved.
  if (body.action === 'dossier') {
    // A place, the whole story (Oct 10; canvas first): Google's details, its photos, its map, and a grounded search for
    // the dress code, the deals, when it's busy — a dry run only until the sheet is approved (nothing kept).
    if (!body.id) return json({ error: 'Which place?' }, 400)
    const { data: p } = await sb.from('guide_places').select('*').eq('id', body.id).maybeSingle()
    if (!p) return json({ error: 'No such place' }, 404)
    const ctx = await listCtx(sb)
    if (!ctx.llmKey || !ctx.mapsKey) return json({ error: 'Not set up' }, 500)
    const [g, web] = await Promise.all([
      mapsFetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(p.google_place_id)}`, { headers: { 'X-Goog-Api-Key': ctx.mapsKey, 'X-Goog-FieldMask': DOSSIER_FIELDS } }, { callPurpose: 'guide-dossier' })
        .then(async (r: Response) => (r.ok ? r.json() : { error: await r.text() })).catch((e: unknown) => ({ error: String(e) })),
      grounded(ctx.llmKey, dossierPrompt(p, { today: longDay(today) }), 'guide-dossier', 4000),
    ])
    if (g?.error) return json({ error: 'Google', detail: String(g.error).slice(0, 600) }, 502)
    const google = googleFacts(g) as ReturnType<typeof googleFacts> & { photos: Array<{ name: string; uri?: string | null }> }
    // Photos: a short-lived link each (Google's terms: shown, not kept).
    await inBatches(google.photos.slice(0, Math.min(6, Number(body.photos) || 6)), 6, async (ph) => {
      ph.uri = await mapsFetch(`https://places.googleapis.com/v1/${ph.name}/media?maxWidthPx=1400&skipHttpRedirect=true`, { headers: { 'X-Goog-Api-Key': ctx.mapsKey! } }, { callPurpose: 'guide-dossier' })
        .then((r: Response) => (r.ok ? r.json() : null)).then((x: { photoUri?: string } | null) => x?.photoUri ?? null).catch(() => null)
    })
    let map: string | null = null
    if (google.location && body.map !== false) {
      const { lat, lng } = google.location
      const res = await mapsFetch(`https://maps.googleapis.com/maps/api/staticmap?center=${lat},${lng}&zoom=15&size=640x400&scale=2&markers=color:0x8a5a2b%7C${lat},${lng}&key=${ctx.mapsKey}`, {}, { callPurpose: 'guide-dossier' }).catch(() => null)
      if (res?.ok) map = `data:image/png;base64,${btoa(String.fromCharCode(...new Uint8Array(await res.arrayBuffer())))}`
    }
    return json({ google, web: parseDossier(web.text, web.urls), pages: web.urls.slice(0, 12), raw: body.raw ? web.text : undefined, map, dry_run: true })
  }

  if (body.action === 'like') {
    if (!body.id) return json({ error: 'Like which?' }, 400)
    const { data: p } = await sb.from('guide_places').select('*').eq('id', body.id).maybeSingle()
    if (!p) return json({ error: 'No such place' }, 404)
    const ctx = await listCtx(sb)
    if (!ctx.llmKey || !ctx.mapsKey || !ctx.home) return json({ error: 'Not set up' }, 500)
    const { data: known } = await sb.from('guide_places').select('google_place_id, name, status').neq('status', 'live').limit(500)
    const theirs = new Set(((known ?? []) as Array<{ google_place_id: string }>).map((k) => k.google_place_id))
    const { text } = await grounded(ctx.llmKey, likePrompt(p, { today: longDay(today), have: ((known ?? []) as Array<{ name: string }>).map((k) => k.name) }), 'guide-like')
    const like = parseLike(text, p.name) as { knownFor: string | null; places: Array<{ name: string; town: string | null; what: string | null; alike: string | null; source: string | null }> }
    const seen = new Set<string>([p.google_place_id])
    const places: Array<Record<string, unknown>> = []
    await inBatches(like.places, 5, async (x) => {
      const g = await findPlace(ctx.mapsKey!, ctx.home!, { text: `${x.name} ${x.town ?? ''} FL` }, 'guide-like')
      if (!g?.id || seen.has(g.id) || theirs.has(g.id) || !sameName(g.displayName?.text, x.name)) return
      const v = placeVerdict(g, ctx.home!, Math.max(ctx.taste.reachMin, 45) * 1.5) as { ok: boolean }
      if (!v.ok) return
      seen.add(g.id)
      const f = placeFacts(g, ctx.home!, ctx.taste.reachMin)
      places.push({ google_place_id: g.id, name: f.name, town: townOf(f.address), address: f.address, drive_min: f.drive_min, rating: f.rating, rating_count: f.rating_count, maps_url: f.maps_url, what: x.what, alike: x.alike, source: x.source })
    })
    return json({ known_for: like.knownFor, places: places.slice(0, 4) })
  }

  if (body.action === 'guide_feedback') {
    if (!body.id || !['saved', 'spot', 'not_for_us', 'been', 'live'].includes(String(body.status))) return json({ error: 'Which, and what?' }, 400)
    const { error } = await sb.from('guide_places').update({ status: body.status, ...(body.status === 'saved' || body.status === 'spot' ? { saved_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }).eq('id', body.id)
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
    const { data: o } = await sb.from('outings').select('id, kind, title, "when", place, url, details, details_at').eq('id', String(body.id ?? '')).maybeSingle()
    if (!o) return json({ error: 'not found' }, 404)
    // A read that found nothing isn't kept as the answer (Oct 10: Frankenstein's empty one stood for a week).
    if (o.details?.facts?.length && o.details_at && Date.now() - Date.parse(o.details_at) < 7 * 86_400_000) return json({ details: { ...o.details, read_at: o.details_at } })
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
    let details = parseDetails(answer, o.kind) as { facts: unknown[] } | null
    // Its page wouldn't open, or said nothing (the Kravis turns readers away): the web instead.
    if (!details?.facts?.length) {
      const found = parseDetails((await grounded(llm.api_key, searchDetailsPrompt(o), 'outing-details', 1500)).text, o.kind) as { facts: unknown[] } | null
      if (found?.facts?.length) details = { ...found, searched: true } as typeof found
    }
    if (!details) return json({ details: null })
    const at = new Date().toISOString()
    await sb.from('outings').update({ details, details_at: at }).eq('id', o.id)
    return json({ details: { ...details, read_at: at } })
  }

  // The venue sorter (Jake, Oct 9): each live-music venue looked up once (Google Search), then every gig carries its
  // venue's kind — or the family's word on it (more / less / skip).
  const sortVenues = async (max = 60) => {
    const [{ data: gigs }, { data: venues }, { data: llmRow }] = await Promise.all([
      sb.from('outings').select('place').eq('kind', 'music').in('status', ['new', 'offered', 'saved']).not('place', 'is', null).limit(2000),
      sb.from('music_venues').select('name_key, name, kind, family'),
      sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
    ])
    const known = new Map(((venues ?? []) as Array<{ name_key: string; name: string; kind: string; family: string | null }>).map((v) => [v.name_key, v]))
    const names = new Map<string, string>()
    for (const g of (gigs ?? []) as Array<{ place: string }>) if (!names.has(venueKey(g.place))) names.set(venueKey(g.place), g.place)
    const fresh = [...names.entries()].filter(([k]) => k && !known.has(k)).slice(0, max)
    const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
    let looked = 0
    if (fresh.length && llm?.api_key) {
      const batches = Array.from({ length: Math.ceil(fresh.length / 15) }, (_, i) => fresh.slice(i * 15, i * 15 + 15))
      await inBatches(batches, 3, async (batch) => {
        const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: venuePrompt(batch.map(([, n]) => n)) }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 2500, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } }),
        }, { callPurpose: 'music-venues' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
        const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
        const got = parseVenues(text, batch.length)
        const rows = batch.map(([key, name], i) => ({ name_key: key, name, kind: got.get(i)?.kind ?? 'mixed', note: got.get(i)?.note ?? null, checked_at: new Date().toISOString() })).filter((_, i) => got.has(i))
        looked += rows.length
        if (rows.length) await sb.from('music_venues').upsert(rows, { onConflict: 'name_key' })
        for (const r of rows) known.set(r.name_key, { ...r, family: null })
      })
    }
    // Every gig its venue's kind.
    const byKind = new Map<string, string[]>()
    for (const [key, place] of names) {
      const kind = venueKindOf(known.get(key))
      if (kind) byKind.set(kind, [...(byKind.get(kind) ?? []), place])
    }
    for (const [kind, places] of byKind) {
      for (let i = 0; i < places.length; i += 100) await sb.from('outings').update({ venue_kind: kind }).eq('kind', 'music').in('place', places.slice(i, i + 100))
    }
    return { venues: names.size, looked, kinds: Object.fromEntries([...byKind].map(([k, v]) => [k, v.length])) }
  }
  // The acts (Jake, Oct 9): each upcoming act looked up once — would they know it, covers or originals or a tribute,
  // its genre — four at a time, fifteen to a search.
  const sortActs = async (max = 45, dryRun = false) => {
    const [{ data: gigs }, { data: acts }, { data: llmRow }] = await Promise.all([
      sb.from('outings').select('title, place, "when"').eq('kind', 'music').in('status', ['new', 'offered', 'saved']).gte('when', today).lte('when', addDays(today, 42)).order('when').limit(2000),
      sb.from('music_acts').select('act_key'),
      sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
    ])
    const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
    if (!llm?.api_key) return { looked: 0 }
    const have = new Set(((acts ?? []) as Array<{ act_key: string }>).map((a) => a.act_key))
    const todo: Array<{ key: string; title: string; place: string | null }> = []
    for (const g of (gigs ?? []) as Array<{ title: string; place: string | null }>) {
      const key = actKey(g.title)
      if (key && !have.has(key) && !todo.some((t) => t.key === key)) todo.push({ key, title: g.title, place: g.place })
    }
    const batch = todo.slice(0, max)
    const batches = Array.from({ length: Math.ceil(batch.length / 15) }, (_, i) => batch.slice(i * 15, i * 15 + 15))
    const out: Array<Record<string, unknown>> = []
    await inBatches(batches, 4, async (b) => {
      const res = await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: actPrompt(b) }] }], tools: [{ google_search: {} }], generationConfig: { maxOutputTokens: 3000, temperature: 0.1, thinkingConfig: { thinkingBudget: 0 } } }),
      }, { callPurpose: 'music-acts' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
      const text = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
      const got = parseActs(text, b.length)
      const rows = b.flatMap((a, i) => { const g = got.get(i); return g ? [{ act_key: a.key, title: a.title, known: g.known, plays: g.plays, tribute_of: g.of, genre: g.genre, checked_at: new Date().toISOString() }] : [] })
      out.push(...rows)
      if (rows.length && !dryRun) await sb.from('music_acts').upsert(rows, { onConflict: 'act_key' })
    })
    return { waiting: todo.length, looked: out.length, ...(dryRun ? { out } : {}) }
  }
  if (body.action === 'acts') {
    try { return json(await sortActs(Number(body.max ?? 45), Boolean(body.dry_run))) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
  }
  if (body.action === 'venues') {
    try { return json(await sortVenues()) } catch (e) { return json({ error: e instanceof Error ? e.message : String(e) }, 500) }
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
          if (cal.id === 'ticketmaster') {
            const clean = (v?: string) => v?.trim().replace(/^["']|["']$/g, '') || null
            // The Consumer Key is the API key; the secret isn't needed — but if they're in each other's places, use the one that works.
            const keys = [clean(Deno.env.get('TICKETMASTER_API_KEY')), clean(Deno.env.get('TICKETMASTER_API_CONSUMER_SECRET_KEY'))].filter(Boolean) as string[]
            let key: string | null = null
            for (const k of keys) {
              const probe = await fetch(`https://app.ticketmaster.com/discovery/v2/events.json?apikey=${encodeURIComponent(k)}&size=1`)
              if (probe.ok) { key = k; break }
            }
            log.push({ cal: cal.id, keys: keys.length, works: key ? (key === keys[0] ? 'TICKETMASTER_API_KEY' : 'the secret') : 'neither' })
            if (!key || !home) return
            const items: Array<Record<string, any>> = []
            for (let page = 0; page < 4; page++) {
              let more = false
              for (const url of ticketmasterUrls(key, home, today, page)) {
                const r = await fetch(url)
                if (!r.ok) { log.push({ cal: cal.id, page, status: r.status, why: (await r.text()).slice(0, 160).replace(key, '…') }); continue }
                const data = await r.json()
                items.push(...parseTicketmaster(data))
                if ((data?.page?.totalPages ?? 0) > page + 1) more = true
              }
              if (!more) break
            }
            let kept = 0
            for (const it of collapseRuns(items) as Array<Record<string, any>>) {
              if (String(it.when).slice(0, 10) < today || String(it.when).slice(0, 10) > addDays(today, MAJOR_AHEAD_DAYS)) continue
              if (isBait(it) || notLiveMusic(it)) continue
              const reach = calendarReach(it, home)
              if (!reach.ok) continue
              const { at: _at, ticketed: _t, major: _m, ...row } = it
              found.push({ ...row, drive_min: reach.minutes ?? null, source: 'calendar', source_ref: cal.id, verify_note: `on ${cal.name}` })
              kept++
            }
            log.push({ cal: cal.id, read: items.length, kept })
            return
          }
          const res = await fetch(cal.url, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' } })
          if (!res.ok) { log.push({ cal: cal.id, status: res.status }); return }
          const html = await res.text()
          const items = cal.id === 'weekendbroward' ? parseWeekendBroward(html) : cal.id === 'sflm' ? parseSflmGigs(html, today) : cal.id === 'improv-pb' ? parseImprov(html) : parseTriviaSchedule(html, cal.url)
          // Weekend Broward: a page a day — the next six days too, by its own "next day" call.
          if (cal.id === 'weekendbroward') {
            let nav = weekendBrowardNext(html)
            for (let day = 0; nav && day < 6; day++) {
              const r = await fetch('https://weekendbroward.com/wp-admin/admin-ajax.php', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded', 'user-agent': 'Mozilla/5.0 (X11; Linux aarch64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36' }, body: `action=simcal_default_calendar_draw_list&ts=${nav.next}&id=${nav.id}` })
              const page = r.ok ? String((await r.json().catch(() => null))?.data ?? '') : ''
              if (!page) break
              items.push(...parseWeekendBroward(page))
              const next = page.match(/data-next="(\d+)"/)?.[1]
              nav = next ? { id: nav.id, next } : null
            }
          }
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
      const venues = await sortVenues(30).catch((e) => ({ error: String(e) }))
      const acts = await sortActs(45).catch((e) => ({ error: String(e) }))
      // The nights they'd do again or asked about (canvas 86C): each watch looked up once a week, a few a morning.
      const watched = await (async () => {
        if (body.dry_run) return null
        const ctx = await listCtx(sb)
        if (!ctx.llmKey) return null
        const { data: due } = await sb.from('guide_watch').select('*').eq('status', 'on').or(`looked_at.is.null,looked_at.lt.${new Date(Date.now() - 6 * 86_400_000).toISOString()}`).limit(3)
        return inBatches((due ?? []) as Array<Record<string, any>>, 3, (w) => lookWatch(sb, ctx.llmKey!, w, today))
      })().catch((e) => ({ error: String(e) }))
      return { found: found.length, written: rows.length, twice: twice.length, venues, acts, watched, log }
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
