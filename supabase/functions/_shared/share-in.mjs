// Send to Tabor House (Jake, Oct 9): what came in from the iPhone's share sheet or a back-tap screenshot, read and
// filed. Pure helpers here (tests/share-in.test.mjs); the share-in function does the fetching and the saving.

/** Every web address in some words. */
export function urlsIn(text) {
  // iOS adds "(null)" after a link it shares from a Shortcut (Oct 9, a Maps share): not part of it.
  return [...new Set(String(text ?? '').replace(/\(null\)/g, ' ').match(/https?:\/\/[^\s<>"'()\]]+/gi) ?? [])].map((u) => u.replace(/[.,;!?]+$/, ''))
}

/** What a share's words say besides a link or a file's name ("IMG_2231.PNG", "Screenshot 2026-10-09 at 8.14.22 PM"). */
export function wordsOf(text) {
  let t = String(text ?? '').replace(/\(null\)/g, ' ')
  for (const u of urlsIn(t)) t = t.split(u).join(' ')
  t = t.replace(/\s+/g, ' ').trim()
  if (/^(IMG|image|Photo|Screenshot|PDF)[\w .:-]*\.(png|jpe?g|heic|gif|pdf)$/i.test(t)) return ''
  // What the Shortcut writes for a picture as words ("Image", "Photo").
  if (/^(image|photo|screenshot|picture|file)s?$/i.test(t)) return ''
  if (/^Screenshot \d{4}-\d{2}-\d{2}/i.test(t)) return ''
  if (!/[a-z0-9]/i.test(t)) return ''
  return t
}

/** Where it came from, said plainly. */
export function sourceOf({ url, hasImage, screenshot }) {
  if (url) {
    let host = ''
    try { host = new URL(url).hostname.replace(/^www\.|^m\./, '') } catch { host = '' }
    if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram'
    if (/(^|\.)tiktok\.com$/.test(host)) return 'TikTok'
    if (/(^|\.)(facebook\.com|fb\.watch)$/.test(host)) return 'Facebook'
    if (/(^|\.)(x\.com|twitter\.com)$/.test(host)) return 'X'
    if (/(^|\.)reddit\.com$/.test(host)) return 'Reddit'
    if (/(^|\.)(maps\.app\.goo\.gl|google\.com|goo\.gl)$/.test(host) && /maps|goo\.gl/.test(url)) return 'Google Maps'
    return host || 'a link'
  }
  if (screenshot) return 'a screenshot'
  if (hasImage) return 'a picture'
  return 'a text'
}

/** The link's page can't be read by a server (a login wall): the post itself is behind it. */
export function isWalled(url) {
  return /instagram\.com|tiktok\.com|facebook\.com|fb\.watch|x\.com|twitter\.com/i.test(String(url ?? ''))
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }
export function decodeEntities(s) {
  return String(s ?? '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
}

const meta = (html, name) => {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i')
  const tag = String(html).match(re)?.[0]
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1] ?? tag?.match(/content="([^"]*)"/i)?.[1]
  return content ? decodeEntities(content).trim() : null
}

/** What a page says about itself: its card (og:…), and what it declares (JSON-LD: an event, a recipe, a business). */
export function linkFacts(html) {
  const h = String(html ?? '')
  const ld = []
  for (const m of h.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const j = JSON.parse(m[1].trim())
      const all = Array.isArray(j) ? j : j?.['@graph'] ?? [j]
      for (const x of all) if (x && typeof x === 'object') ld.push(x)
    } catch { /* not JSON */ }
  }
  const types = ld.flatMap((x) => [x['@type']].flat()).filter(Boolean).map(String)
  const title = meta(h, 'og:title') ?? decodeEntities(h.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? '').trim() ?? null
  return {
    title: title || null,
    description: meta(h, 'og:description') ?? meta(h, 'description'),
    image: meta(h, 'og:image'),
    site: meta(h, 'og:site_name'),
    types,
    recipe: types.some((t) => /recipe/i.test(t)),
    // A page's own events and places, compactly (names, dates, addresses), for the reader.
    declared: ld.filter((x) => /event|restaurant|bar|business|store|hotel|place/i.test([x['@type']].flat().join(' '))).slice(0, 6).map((x) => ({
      type: [x['@type']].flat().join(','), name: x.name ?? null, startDate: x.startDate ?? null, endDate: x.endDate ?? null,
      location: typeof x.location === 'object' ? x.location?.name ?? null : x.location ?? null,
      address: typeof x.address === 'object' ? [x.address?.streetAddress, x.address?.addressLocality].filter(Boolean).join(', ') : x.address ?? (typeof x.location === 'object' ? [x.location?.address?.streetAddress, x.location?.address?.addressLocality].filter(Boolean).join(', ') : null),
    })),
  }
}

/** TikTok's public card for a video: its caption and who posted it. */
export function tiktokFacts(o) {
  if (!o || typeof o !== 'object') return null
  return { title: o.title ? String(o.title) : null, description: o.author_name ? `Posted by ${o.author_name}` : null, image: o.thumbnail_url ?? null, site: 'TikTok', types: [], recipe: false, declared: [] }
}

/** Anything a server could read from the link at all (a login wall gives the site's name and nothing else). */
export function factsSayAnything(f) {
  if (!f) return false
  const words = `${f.title ?? ''} ${f.description ?? ''}`.replace(/\s+/g, ' ').trim()
  if (f.declared?.length) return true
  if (!words) return false
  return !/^(Instagram|TikTok|Facebook|Log in|Login|X)\b[\s\S]{0,40}$/i.test(words) && words.length > 30
}

/** The reader's question: what is this, and the gist. */
export function sharePrompt({ today, source, words, facts, hasImage, members = [] }) {
  const read = facts ? [facts.site && `Site: ${facts.site}`, facts.title && `Title: ${facts.title}`, facts.description && `Description: ${facts.description}`, facts.declared?.length ? `The page declares: ${JSON.stringify(facts.declared)}` : null].filter(Boolean).join('\n') : ''
  return `Someone in the family (${members.join(', ') || 'a family of four in West Palm Beach, Florida'}) shared this to their family's house assistant from their iPhone. It came from ${source}. Today is ${today}.

${words ? `What they shared, as words:\n"""${words.slice(0, 4000)}"""\n` : ''}${read ? `What the link's page says:\n${read.slice(0, 4000)}\n` : ''}${hasImage ? 'A picture is attached (a screenshot or a photo): read it carefully, every line.\n' : ''}
Decide what it is — one of:
- "events": something with a date: an event, a show, a game, a class, an invitation, a school flyer, a deadline, or plans in a text or email ("dinner at 7 Saturday at Mr B's").
- "place": a specific restaurant, bar, café, shop, hotel or venue being shown off or recommended to try — no particular date to go.
- "recipe": a recipe (ingredients, or steps, or a dish being cooked with how).
- "other": none of these, or nothing readable.
A place hosting a dated event is "events". A restaurant post that mentions its hours is still "place".

Answer with only JSON:
{"kind": "events" | "place" | "recipe" | "other",
 "summary": "what it is, in a few plain words (\\"Fall Fest at Roosevelt Elementary\\", \\"An oyster bar in Lake Worth\\", \\"Crispy gnocchi recipe\\")",
 "place": {"name": "the place's own name, exactly as written", "town": "its town if shown, else null", "said": "the line that says the most about it, copied word for word (under 140 characters), else null"} or null}
Never make anything up: names and words only as they appear.`
}

/** The reader's answer, checked. */
export function parseShare(text) {
  const m = String(text ?? '').match(/\{[\s\S]*\}/)
  let j = {}
  try { j = m ? JSON.parse(m[0]) : {} } catch { j = {} }
  const kind = ['events', 'place', 'recipe', 'other'].includes(j.kind) ? j.kind : 'other'
  const name = typeof j.place?.name === 'string' ? j.place.name.trim() : ''
  return {
    kind: kind === 'place' && !name ? 'other' : kind,
    summary: typeof j.summary === 'string' ? j.summary.trim().slice(0, 160) : '',
    place: name ? { name, town: typeof j.place.town === 'string' && j.place.town.trim() ? j.place.town.trim() : null, said: typeof j.place.said === 'string' && j.place.said.trim() ? j.place.said.trim().slice(0, 200) : null } : null,
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const clock = (hhmm) => {
  const [h, m] = String(hhmm).split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}
/** "Sat, Oct 17 · 11 AM – 3 PM" from a scanned item. */
export function itemWhen(item) {
  const [y, mo, d] = String(item.date ?? '').split('-').map(Number)
  if (!y) return ''
  const day = `${DAYS[new Date(y, mo - 1, d).getDay()]}, ${MONTHS[mo - 1]} ${d}`
  if (item.all_day || !item.start_time_local) return day
  return `${day} · ${clock(item.start_time_local)}${item.end_time_local ? ` – ${clock(item.end_time_local)}` : ''}`
}

/** What the phone is told, in a line (the notification). */
export function shareReply(outcome) {
  switch (outcome.kind) {
    case 'place': {
      if (outcome.found && outcome.already) return `${outcome.name} is already in Places worth trying${outcome.town ? ` — ${outcome.town}` : ''}${outcome.minutes ? `, ${outcome.minutes} min` : ''}.`
      if (!outcome.found) return `I couldn’t find ${outcome.name} on Google Maps. It’s kept with what you shared.`
      const where = [outcome.town, outcome.minutes ? `${outcome.minutes} min` : null].filter(Boolean).join(', ')
      return `Saved ${outcome.name} to Places worth trying${where ? ` — ${where}` : ''}.`
    }
    case 'events': {
      const all = (outcome.items ?? []).filter((i) => i.type !== 'prep')
      const items = all.filter((i) => !i.already)
      if (!all.length) return outcome.past ? 'The dates in it have already passed.' : 'I couldn’t find a date in it.'
      if (!items.length) return all.length === 1 ? `${all[0].already.title} is already on your calendar (${itemWhen(all[0])}).` : `Those ${all.length} are already on your calendar.`
      if (items.length === 1) return `${items[0].title} · ${itemWhen(items[0])}. Add it? It’s waiting in Tabor House.`
      return `${items.length} dates from ${outcome.summary || 'that'}. They’re waiting in Tabor House for your yes.`
    }
    case 'recipe':
      return outcome.name ? `Saved ${outcome.name} to Recipes.` : 'I couldn’t read a recipe in it.'
    case 'unreadable':
      return `I couldn’t see that ${outcome.source === 'a link' ? 'page' : 'post'} from here. Double-tap the back of your phone while it’s open and I’ll read the screen.`
    default:
      return 'I read it, but there’s no date, place or recipe in it, so I kept it with what you’ve shared.'
  }
}

/** A guide shelf for a shared place, from what Google calls it (else "You shared"). */
export function sharedShelf(shelves, text) {
  const s = shelves.find((x) => x.match && x.match.test(String(text ?? '')))
  return s ? { id: s.id, label: s.label } : { id: 'shared', label: 'You shared' }
}

/** The guide note's "what I'm hearing" for a place someone shared: who shared it and, quoted, the post's own line. */
export function sharedHeard(name, source, said) {
  const how = source === 'Alexa' ? 'asked Alexa to save it' : source === 'a text' ? 'saved it' : `shared it from ${source}`
  return `${name ?? 'Someone'} ${how}.${said ? ` ${said.charAt(0).toUpperCase()}${said.slice(1)}` : ''}`
}

const wordsIn = (t) => new Set(String(t ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 2 && !['the', 'and', 'with', 'appointment', 'for'].includes(w)))

/** Dates worth asking about: none already past (a confirmation email's old booking), each marked when it's already on
 * the calendar (the same day, within an hour, sharing a word of its name or place). */
export function datesToAsk(items, events, todayYmd) {
  return (items ?? []).filter((i) => !i.date || i.date >= todayYmd).map((i) => {
    if (i.type === 'prep') return i
    const words = wordsIn(`${i.title} ${i.location_name ?? ''}`)
    const start = i.start_time_local ? Number(i.start_time_local.slice(0, 2)) * 60 + Number(i.start_time_local.slice(3, 5)) : null
    const hit = (events ?? []).find((e) => {
      if (e.ymd !== i.date) return false
      if (start != null && e.minutes != null && Math.abs(e.minutes - start) > 60) return false
      const theirs = wordsIn(`${e.title} ${e.location_name ?? ''}`)
      return [...words].some((w) => theirs.has(w))
    })
    return hit ? { ...i, already: { id: hit.id, title: hit.title } } : i
  })
}

/** A Google Maps link's place, once its short link is followed: "?q=Loco West Palm Beach, 840 N Railroad Ave, …" or
 * "/maps/place/Loco+West+Palm+Beach/@…" → its name, and the whole line to look up (Oct 9, Jake's Maps share). */
export function mapsPlaceOf(url) {
  let u
  try { u = new URL(url) } catch { return null }
  if (!/(^|\.)google\.[a-z.]+$/.test(u.hostname) || !/maps|^\/$/.test(u.pathname + (u.hostname.startsWith('maps.') ? 'maps' : ''))) return null
  const plus = (t) => decodeURIComponent(String(t).replace(/\+/g, ' ')).trim()
  const q = u.searchParams.get('q') ?? u.searchParams.get('query')
  const fromPath = u.pathname.match(/\/maps\/place\/([^/@]+)/)?.[1]
  const line = q ? q.trim() : fromPath ? plus(fromPath) : ''
  if (!line || /^-?\d+(\.\d+)?,\s*-?\d+(\.\d+)?$/.test(line)) return null
  return { name: line.split(',')[0].trim(), query: line }
}
