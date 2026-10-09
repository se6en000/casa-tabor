import { createClient } from 'npm:@supabase/supabase-js@2'
import { requireEnv } from '../_shared/env.ts'
import { resolveBackgroundLlmConfig } from '../_shared/background-llm-model.mjs'
import { TALK_PLAN_GEMINI_MODEL } from '../_shared/llm-model-policy.mjs'
import { createTrackedMapsFetch, createTrackedProviderFetch } from '../_shared/provider-call-ledger.mjs'
import { verifyProfileSessionToken } from '../_shared/profile-session.mjs'
import { GUIDE_SHELVES, TASTE_KEY, guideDriveMin, guideScore, sameName, tasteOf, townOf } from '../_shared/guide.mjs'
import { datesToAsk, factsSayAnything, mapsPlaceOf, isWalled, linkFacts, parseShare, sharePrompt, shareReply, sharedHeard, sharedShelf, sourceOf, tiktokFacts, urlsIn, wordsOf, type LinkFacts } from '../_shared/share-in.mjs'

// Send to Tabor House (Jake, Oct 9: "right now I screen shot and paste into chat, if theres an easier way"). The iPhone
// Shortcut posts whatever was shared — a link (Instagram, TikTok, a page), words (a text, an email), a picture (a
// screenshot from a double tap on the back of the phone) — with that person's key. It's read once and filed:
//   a place  → saved to Places worth trying (Google Maps checks it's real);
//   a recipe → Recipes (the recipe importer);
//   dates    → waiting for a yes under "I have something for you", editable first (the flyer scanner reads them);
// and the phone is told what happened in one line (the Shortcut shows it as a notification). Every share is kept.
// From the phone app (with its profile session): action "key" makes that person's key (shown once), "key_status".

const providerFetch = createTrackedProviderFetch({ functionName: 'share-in', capability: 'share-in', trafficClass: 'user' })
const mapsFetch = createTrackedMapsFetch({ functionName: 'share-in', service: 'places', sku: 'Places Text Search', callPurpose: 'share-place' })

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-share-key, x-casa-history-session',
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } })
const said = (text: string, status = 200) => new Response(text, { status, headers: { ...CORS, 'content-type': 'text/plain; charset=utf-8' } })

const MAX_IMAGE = 12 * 1024 * 1024
const BROWSER_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function base64Of(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

/** What the bytes are, when the Shortcut sends a picture as "Image" with no type (Oct 9, Jake's first try). */
function sniffMime(b: Uint8Array): string | null {
  const at = (i: number, ...xs: number[]) => xs.every((x, j) => b[i + j] === x)
  if (at(0, 0x89, 0x50, 0x4e, 0x47)) return 'image/png'
  if (at(0, 0xff, 0xd8, 0xff)) return 'image/jpeg'
  if (at(0, 0x25, 0x50, 0x44, 0x46)) return 'application/pdf'
  if (at(0, 0x47, 0x49, 0x46, 0x38)) return 'image/gif'
  if (at(0, 0x52, 0x49, 0x46, 0x46) && at(8, 0x57, 0x45, 0x42, 0x50)) return 'image/webp'
  if (at(4, 0x66, 0x74, 0x79, 0x70)) {
    const brand = String.fromCharCode(...b.subarray(8, 12))
    if (/heic|heix|hevc|mif1|msf1|heif/.test(brand)) return 'image/heic'
  }
  return null
}

const imageMime = (type: string, name = '') => {
  if (/^image\/|application\/pdf/.test(type)) return type
  if (/\.(png)$/i.test(name)) return 'image/png'
  if (/\.(jpe?g)$/i.test(name)) return 'image/jpeg'
  if (/\.(heic|heif)$/i.test(name)) return 'image/heic'
  if (/\.pdf$/i.test(name)) return 'application/pdf'
  return null
}

type Picture = { data: string; mime: string }

/** Whatever the Shortcut sent: a form (words and files), JSON, or plain words. */
async function readShare(req: Request): Promise<{ texts: string[]; pictures: Picture[]; received: Array<Record<string, unknown>> }> {
  const type = req.headers.get('content-type') ?? ''
  // What came, for the record (each share keeps it): field names, file names, types, sizes.
  const received: Array<Record<string, unknown>> = [{ content_type: type.split(';')[0] }]
  const texts: string[] = []
  const pictures: Picture[] = []
  if (/multipart\/form-data|application\/x-www-form-urlencoded/i.test(type)) {
    const form = await req.formData()
    for (const [k, v] of form.entries()) {
      if (typeof v === 'string') { received.push({ field: k, text: v.slice(0, 80) }); if (v.trim()) texts.push(v); continue }
      received.push({ field: k, file: v.name, type: v.type, size: v.size })
      const bytes = v.size > 0 && v.size <= MAX_IMAGE ? new Uint8Array(await v.arrayBuffer()) : null
      const mime = bytes ? sniffMime(bytes) ?? imageMime(v.type, v.name) : null
      if (bytes && mime) pictures.push({ data: base64Of(bytes), mime })
      // Words as a file (a shared note); a page the phone downloaded for a link (HTML) is left — the link itself came as text.
      else if (/^text\/plain/.test(v.type) || /\.txt$/i.test(v.name)) texts.push((await v.text()).slice(0, 20000))
    }
  } else if (/application\/json/i.test(type)) {
    const b = await req.json().catch(() => ({}))
    for (const k of ['text', 'url']) if (typeof b?.[k] === 'string' && b[k].trim()) texts.push(b[k])
    if (typeof b?.image_base64 === 'string' && b.image_base64) pictures.push({ data: b.image_base64, mime: String(b.mime_type ?? 'image/jpeg') })
  } else {
    // The thing itself as the body (a Shortcut sending a picture or a file as its request body).
    const bytes = new Uint8Array(await req.arrayBuffer())
    received.push({ body: type.split(';')[0], size: bytes.length })
    const mime = bytes.length && bytes.length <= MAX_IMAGE ? sniffMime(bytes) : null
    if (mime) pictures.push({ data: base64Of(bytes), mime })
    else { const t = new TextDecoder().decode(bytes); if (t.trim()) texts.push(t) }
  }
  // The Shortcut sends the thing twice (as words and as a file): once is enough.
  return { texts: [...new Set(texts.map((t) => t.trim()))], pictures, received }
}

/** What a server can read from the link: TikTok's public card, else the page's own card and what it declares. */
async function readLink(url: string): Promise<{ facts: LinkFacts | null; finalUrl: string }> {
  const timeout = AbortSignal.timeout(7000)
  try {
    if (/tiktok\.com/i.test(url)) {
      const r = await fetch(`https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`, { signal: timeout })
      return { facts: r.ok ? tiktokFacts(await r.json()) : null, finalUrl: url }
    }
    const r = await fetch(url, { redirect: 'follow', headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en' }, signal: timeout })
    if (!r.ok) return { facts: null, finalUrl: r.url || url }
    const html = (await r.text()).slice(0, 1_500_000)
    return { facts: linkFacts(html), finalUrl: r.url || url }
  } catch {
    return { facts: null, finalUrl: url }
  }
}

async function fetchPicture(url: string): Promise<Picture | null> {
  try {
    const r = await fetch(url, { headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(6000) })
    if (!r.ok) return null
    const mime = (r.headers.get('content-type') ?? '').split(';')[0]
    if (!/^image\//.test(mime)) return null
    const bytes = new Uint8Array(await r.arrayBuffer())
    return bytes.length && bytes.length <= MAX_IMAGE ? { data: base64Of(bytes), mime } : null
  } catch {
    return null
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })
  if (req.method !== 'POST') return said('Send it with POST.', 405)

  const supabaseUrl = requireEnv('SUPABASE_URL')
  const serviceKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY')
  const sb = createClient(supabaseUrl, serviceKey)

  // From the phone app: this person's key for the Shortcut.
  const sessionToken = req.headers.get('x-casa-history-session')?.trim()
  if (sessionToken) {
    let memberId: string
    try {
      const session = await verifyProfileSessionToken({
        token: sessionToken,
        secret: requireEnv('AI_HISTORY_SESSION_SECRET'),
        loadCredentialVersion: async (s: { role: string; member_id?: string }) => {
          const q = sb.from('ai_history_pin_credentials').select('credential_version').eq('credential_kind', s.role)
          const { data, error } = s.role === 'family_member' ? await q.eq('member_id', s.member_id).maybeSingle() : await q.is('member_id', null).maybeSingle()
          if (error) throw error
          return data?.credential_version ?? null
        },
      }) as { role: string; member_id?: string }
      if (session.role !== 'family_member' || !session.member_id) throw new Error('Sign in as yourself first.')
      memberId = session.member_id
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : 'Sign in again.' }, 401)
    }
    const body = await req.json().catch(() => ({}))
    if (body.action === 'key_status') {
      const { data } = await sb.from('share_keys').select('key_prefix, created_at, last_used_at').eq('member_id', memberId).is('revoked_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      return json({ key: data ?? null })
    }
    if (body.action === 'key') {
      // A new key replaces the old one (a lost phone, a copy that went somewhere it shouldn't).
      await sb.from('share_keys').update({ revoked_at: new Date().toISOString() }).eq('member_id', memberId).is('revoked_at', null)
      const key = `tabor_share_${crypto.randomUUID().replace(/-/g, '')}${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
      const { error } = await sb.from('share_keys').insert({ member_id: memberId, key_hash: await sha256Hex(key), key_prefix: key.slice(0, 16) })
      if (error) return json({ error: error.message }, 500)
      return json({ key })
    }
    return json({ error: 'Which action?' }, 400)
  }

  // From the Shortcut.
  // From Alexa (the assistant, server to server): "save Loco as a place to try" — the same reading, for that person.
  let keyRow: { id: string | null; member_id: string | null } | null = null
  if (req.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() === serviceKey) {
    const b = await req.clone().json().catch(() => ({}))
    keyRow = { id: null, member_id: typeof b?.member_id === 'string' ? b.member_id : null }
  } else {
    const url0 = new URL(req.url)
    const key = req.headers.get('x-share-key')?.trim() || url0.searchParams.get('key')?.trim() || ''
    if (!key) return said('This Shortcut needs your key from Tabor House (Settings › Send to Tabor House).', 401)
    const { data } = await sb.from('share_keys').select('id, member_id').eq('key_hash', await sha256Hex(key)).is('revoked_at', null).maybeSingle()
    if (!data) return said('That key isn’t working anymore. Make a new one in Tabor House (Settings › Send to Tabor House).', 401)
    keyRow = data
    void sb.from('share_keys').update({ last_used_at: new Date().toISOString() }).eq('id', data.id).then(() => {})
  }

  let texts: string[]
  let pictures: Picture[]
  let received: Array<Record<string, unknown>> = []
  try { ({ texts, pictures, received } = await readShare(req)) } catch { return said('That didn’t come through. Try sharing it again.', 400) }

  const all = texts.join('\n').trim()
  const link = urlsIn(all)[0] ?? null
  const words = wordsOf(all)
  const screenshot = !link && !words && pictures.length > 0 && pictures.every((p) => p.mime === 'image/png')
  const source = keyRow.id === null ? 'Alexa' : sourceOf({ url: link, hasImage: pictures.length > 0, screenshot })
  const today = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date())

  const [{ data: members }, { data: llmRow }, { data: homeRow }, { data: tasteRow }] = await Promise.all([
    sb.from('family_members').select('id, name, full_name').neq('name', 'Tabor Family').order('sort_order'),
    sb.from('settings').select('value').eq('key', 'llm_config').maybeSingle(),
    sb.from('settings').select('value').eq('key', 'home_config').maybeSingle(),
    sb.from('settings').select('value').eq('key', TASTE_KEY).maybeSingle(),
  ])
  const who = (members ?? []).find((m: { id: string }) => m.id === keyRow.member_id) as { name: string } | undefined
  const record = async (row: Record<string, unknown>) => {
    const { data } = await sb.from('shared_in').insert({ member_id: keyRow.member_id, source, url: link, said_text: words ? words.slice(0, 4000) : null, received, ...row }).select('id').single()
    return data?.id as string | undefined
  }

  // A Google Maps link is a place: its short link followed, the place named in it — no reading needed.
  let mapsPlace: { name: string; query: string } | null = null
  if (link && /maps\.app\.goo\.gl|goo\.gl\/maps|google\.[a-z.]+\/maps|maps\.google\./i.test(link)) {
    let at = link
    for (let i = 0; i < 4 && !mapsPlace; i++) {
      mapsPlace = mapsPlaceOf(at)
      if (mapsPlace) break
      const r = await fetch(at, { redirect: 'manual', headers: { 'user-agent': BROWSER_UA }, signal: AbortSignal.timeout(5000) }).catch(() => null)
      const next = r?.headers.get('location')
      if (!next) break
      at = new URL(next, at).toString()
    }
    // Still nothing: the page itself, followed all the way (its address, or its og card, names the place).
    if (!mapsPlace) {
      const r = await fetch(link, { redirect: 'follow', headers: { 'user-agent': BROWSER_UA, 'accept-language': 'en-US,en' }, signal: AbortSignal.timeout(7000) }).catch(() => null)
      mapsPlace = r ? mapsPlaceOf(r.url) : null
      if (!mapsPlace && r?.ok) {
        const f = linkFacts((await r.text()).slice(0, 600_000))
        const name = f.title?.replace(/\s*[-·–]\s*Google Maps\s*$/i, '').trim()
        if (name && !/^Google Maps$/i.test(name)) mapsPlace = { name: name.split(',')[0].trim(), query: [name, f.description].filter(Boolean).join(', ') }
      }
    }
    received.push({ maps: mapsPlace?.query ?? null, reached: at.slice(0, 200) })
  }

  // 1. The link: what a server can see of it (a post's caption and picture, a page's card and declared events).
  let facts: LinkFacts | null = null
  let page = link
  if (link && !mapsPlace) {
    const r = await readLink(link)
    facts = r.facts
    page = r.finalUrl
    // A post is usually its picture (a flyer, a menu, the dish): read with the caption.
    if (!pictures.length && facts?.image && (isWalled(page) || !factsSayAnything(facts))) {
      const pic = await fetchPicture(facts.image)
      if (pic) pictures.push(pic)
    }
  }
  const readText = [words, facts?.title, facts?.description, facts?.declared?.length ? `Declared on the page: ${JSON.stringify(facts.declared)}` : null].filter(Boolean).join('\n')
  if (!mapsPlace && !words && !pictures.length && !factsSayAnything(facts)) {
    const reply = shareReply({ kind: 'unreadable', source: link ? (isWalled(link) ? 'a post' : 'a link') : source })
    await record({ kind: 'unreadable', reply })
    return said(reply)
  }

  // 2. What is it? (A Maps link already said.)
  const llm = resolveBackgroundLlmConfig(llmRow?.value) as { api_key?: string }
  if (!llm?.api_key) return said('Tabor House’s reader isn’t set up right now. It’s kept; try again later.', 503)
  const res = mapsPlace ? null : await providerFetch(`https://generativelanguage.googleapis.com/v1beta/models/${TALK_PLAN_GEMINI_MODEL}:generateContent?key=${llm.api_key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: sharePrompt({ today, source, words, facts, hasImage: pictures.length > 0, members: (members ?? []).map((m: { name: string }) => m.name) }) }, ...pictures.slice(0, 4).map((p) => ({ inline_data: { mime_type: p.mime, data: p.data } }))] }],
      generationConfig: { maxOutputTokens: 600, temperature: 0.1, responseMimeType: 'application/json', thinkingConfig: { thinkingBudget: 0 } },
    }),
  }, { callPurpose: 'share-read' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null)
  const answer = ((res?.candidates?.[0]?.content?.parts ?? []) as Array<{ text?: string; thought?: boolean }>).filter((p) => !p.thought).map((p) => p.text ?? '').join('')
  if (!answer && !mapsPlace) return said('I couldn’t read it just now. Try sharing it again in a minute.', 502)
  const read = mapsPlace ? { kind: 'place' as const, summary: mapsPlace.query, place: { name: mapsPlace.name, town: null, said: null, query: mapsPlace.query } } : parseShare(answer)
  const callFunction = (name: string, body: unknown) => fetch(`${supabaseUrl}/functions/v1/${name}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', Authorization: `Bearer ${serviceKey}`, apikey: serviceKey },
    body: JSON.stringify(body),
  }).then((r) => r.json()).catch(() => null)

  // 3a. Dates: read by the flyer scanner, kept for a yes.
  if (read.kind === 'events') {
    const scanned = await callFunction('scan-document-events', {
      files: pictures.slice(0, 4).map((p) => ({ file_base64: p.data, mime_type: p.mime })),
      text: readText || undefined,
      current_date_iso: new Date().toISOString(),
      timezone: 'America/New_York',
      family_members: (members ?? []).map((m: { id: string; name: string; full_name: string | null }) => ({ id: m.id, name: m.name, full_name: m.full_name })),
    })
    const read_ = Array.isArray(scanned?.items) ? scanned.items as Array<Record<string, any>> : []
    // Not what's past (a booking email's old appointment), and what's already on the calendar said so.
    const todayYmd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date())
    const days = [...new Set(read_.map((i) => i.date).filter((d) => d && d >= todayYmd))] as string[]
    const { data: around } = days.length ? await sb.from('events').select('id, title, location_name, start_time, all_day').is('deleted_at', null)
      .gte('start_time', new Date(`${days.sort()[0]}T00:00:00-05:00`).toISOString()).lte('start_time', new Date(`${days[days.length - 1]}T23:59:59-04:00`).toISOString()).limit(300) : { data: [] }
    const local = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso))
    const events = ((around ?? []) as Array<{ id: string; title: string; location_name: string | null; start_time: string; all_day: boolean }>).map((e) => {
      const [ymd, hm] = local(e.start_time).split(', ')
      return { id: e.id, title: e.title, location_name: e.location_name, ymd, minutes: e.all_day ? null : Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) }
    })
    const items = datesToAsk(read_, events, todayYmd)
    const summary = String(scanned?.document_summary ?? read.summary ?? '').trim()
    const reply = shareReply({ kind: 'events', summary: read.summary || summary, items, past: read_.length > 0 && !items.length })
    const waiting = items.some((i) => i.type !== 'prep' && !i.already)
    await record({ kind: 'events', summary: read.summary || summary, read: readText.slice(0, 4000) || null, items, status: waiting ? 'ask' : 'done', reply })
    return said(reply)
  }

  // 3b. A place: found on Google Maps, saved to the guide.
  if (read.kind === 'place' && read.place) {
    const geo = homeRow?.value?.geocode_cache
    const home = typeof geo?.lat === 'number' ? { lat: geo.lat as number, lng: geo.lng as number } : null
    const mapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY')
    const FIELDS = 'places.id,places.displayName,places.formattedAddress,places.rating,places.userRatingCount,places.location,places.primaryTypeDisplayName,places.types,places.websiteUri,places.googleMapsUri'
    const found = mapsKey ? await mapsFetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'X-Goog-Api-Key': mapsKey, 'X-Goog-FieldMask': FIELDS },
      body: JSON.stringify({ textQuery: read.place.query ?? `${read.place.name} ${read.place.town ?? ''} FL`.trim(), maxResultCount: 3, ...(home ? { locationBias: { circle: { center: { latitude: home.lat, longitude: home.lng }, radius: 50000 } } } : {}) }),
    }, { callPurpose: 'share-place' }).then((r: Response) => (r.ok ? r.json() : null)).catch(() => null) : null
    const candidates = (found?.places ?? []) as Array<Record<string, any>>
    // A Maps link names the exact place (its name and address): the first is it.
    const p = candidates.find((c) => sameName(c.displayName?.text, read.place!.name)) ?? (candidates.length === 1 || mapsPlace ? candidates[0] ?? null : null)
    if (!p) {
      const reply = shareReply({ kind: 'place', found: false, name: read.place.name })
      await record({ kind: 'place', summary: read.summary, read: readText.slice(0, 4000) || null, reply })
      return said(reply)
    }
    const name = String(p.displayName?.text ?? read.place.name)
    const minutes = home && p.location ? guideDriveMin(home, { lat: p.location.latitude, lng: p.location.longitude }) : null
    const { data: existing } = await sb.from('guide_places').select('id, status').eq('google_place_id', p.id).maybeSingle()
    let placeId = existing?.id as string | undefined
    if (placeId) {
      await sb.from('guide_places').update({ status: 'saved', updated_at: new Date().toISOString() }).eq('id', placeId)
    } else {
      // What they said it is first ("a tequila and oyster bar"), then what Google calls it.
      const shelf = sharedShelf(GUIDE_SHELVES, `${read.summary} ${p.primaryTypeDisplayName?.text ?? ''} ${(p.types ?? []).join(' ')}`)
      const row = {
        google_place_id: p.id, name, address: p.formattedAddress ?? null, shelf: shelf.id, shelf_label: shelf.label,
        types: p.primaryTypeDisplayName?.text ?? null, lat: p.location?.latitude ?? null, lng: p.location?.longitude ?? null,
        drive_min: minutes, beyond: minutes != null && minutes > tasteOf(tasteRow?.value).reachMin,
        rating: p.rating ?? null, rating_count: p.userRatingCount ?? null, maps_url: p.googleMapsUri ?? null, website: p.websiteUri ?? null,
        buzz: [{ kind: 'shared', said: read.place.said, new: false, url: link }], mentions: 0, labels: [],
        heard: sharedHeard(who?.name ?? null, source, read.place.said), why: null, touristy: false, status: 'saved',
      }
      const { data: inserted, error } = await sb.from('guide_places').insert({ ...row, score: Math.round(guideScore(row) * 100) / 100 }).select('id').single()
      if (error) return said('I found it but couldn’t save it just now. Try again in a minute.', 500)
      placeId = inserted.id
    }
    const reply = shareReply({ kind: 'place', found: true, already: existing?.status === 'saved', name, town: townOf(p.formattedAddress), minutes })
    await record({ kind: 'place', summary: read.summary, read: readText.slice(0, 4000) || null, place_id: placeId, reply })
    return said(reply)
  }

  // 3c. A recipe: the recipe importer reads it (a recipe page itself when it's an open page), then it's saved.
  if (read.kind === 'recipe') {
    const body = link && !isWalled(page) ? { source_type: 'url', source_url: page }
      : pictures.length ? { source_type: 'image', files: pictures.slice(0, 4).map((p) => ({ file_base64: p.data, mime_type: p.mime })) }
      : { source_type: 'text', text: readText }
    const got = await callFunction('extract-recipe-content', { ...body, fallback_name: read.summary || 'A shared recipe' })
    const r = got?.recipe as Record<string, any> | undefined
    const ingredients = (Array.isArray(r?.ingredients) ? r!.ingredients : []).map((i: Record<string, unknown>) => ({ raw_text: String(i.raw_text ?? '').trim(), name: i.name ?? null, quantity: i.quantity ?? null, unit: i.unit ?? null })).filter((i: { raw_text: string }) => i.raw_text)
    const steps = (Array.isArray(r?.steps) ? r!.steps : []).map((s: Record<string, unknown>) => String(s.instruction ?? '').trim()).filter(Boolean)
    let recipeId: string | null = null
    if (r?.name && (ingredients.length || steps.length)) {
      const isWeb = (u: unknown) => typeof u === 'string' && /^https?:\/\//.test(u) && u.length <= 2048
      const images = [...new Set([r.image_url, ...(r.image_urls ?? []), facts?.image].filter(isWeb))] as string[]
      const { data, error } = await sb.rpc('save_recipe', { p: {
        id: null, name: String(r.name).trim(), cook_time: r.cook_time ?? '', servings: r.servings ?? '',
        source_type: link ? 'url' : pictures.length ? 'image' : 'manual', source_url: link,
        image_url: images[0] ?? null, image_urls: images, ingredients, steps,
      } })
      if (!error) recipeId = String(data)
    }
    const reply = shareReply({ kind: 'recipe', name: recipeId ? String(r!.name).trim() : null })
    await record({ kind: 'recipe', summary: read.summary, read: readText.slice(0, 4000) || null, recipe_id: recipeId, reply })
    return said(reply)
  }

  const reply = shareReply({ kind: 'other' })
  await record({ kind: 'other', summary: read.summary, read: readText.slice(0, 4000) || null, reply })
  return said(reply)
})
