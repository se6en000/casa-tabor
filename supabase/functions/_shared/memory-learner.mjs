// Casa's memory, phase 2 — the nightly learner (design doc https://claude.ai/code/artifact/c1bc97e8-3b45-4c9f-b005-7a06d57d7db6).
// Pure pieces, tested without the network; the edge function `memory-learner` runs them. It reads what happened
// (the calendar's patterns, the email reader's notes, yesterday's conversations) against what Casa already knows,
// and writes only what it can back up. "Sure" is decided here, never by the model.

const KINDS = ['calendar', 'email', 'conversation', 'routine']
const WEEK = 7 * 86400e3
const norm = (t) => String(t ?? '').toLowerCase().replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim()
const stem = (title) => String(title ?? '').replace(/[#\d/:]+/g, ' ').replace(/\s+/g, ' ').trim()

/** Each person's repeated calendar items: the same title (numbers dropped) at least 3 times. */
export function calendarPatterns(events, { min = 3 } = {}) {
  const groups = new Map()
  for (const e of events ?? []) {
    for (const who of e.people ?? []) {
      const key = `${who}|${norm(stem(e.title))}`
      const g = groups.get(key) ?? { who, title: stem(e.title), times: [], places: new Map() }
      g.times.push(Date.parse(e.start_time))
      if (e.place) g.places.set(e.place, (g.places.get(e.place) ?? 0) + 1)
      groups.set(key, g)
    }
  }
  return [...groups.values()].filter((g) => g.times.length >= min).map((g) => {
    const t = g.times.sort((a, b) => a - b)
    const place = [...g.places.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
    return { who: g.who, title: g.title, count: t.length, weeks: new Set(t.map((x) => Math.floor(x / WEEK))).size, first: new Date(t[0]).toISOString().slice(0, 10), last: new Date(t.at(-1)).toISOString().slice(0, 10), place }
  }).sort((a, b) => b.count - a.count)
}

/** Sure: two kinds of evidence, or the calendar 5+ times over 3+ weeks. In the shadow week, never. */
export function decideConfidence({ kinds = [], count = 0, weeks = 0 }, { shadow }) {
  if (shadow) return 'not_sure'
  return new Set(kinds).size >= 2 || (kinds.includes('calendar') && count >= 5 && weeks >= 3) ? 'sure' : 'not_sure'
}

/** Already in memory in any state — active, corrected, forgotten — so never proposed again. */
export function isKnown(candidate, rows) {
  const about = norm(candidate?.about)
  const text = norm(candidate?.text)
  return (rows ?? []).some((r) => norm(r.about_label) === about && norm(r.text) === text)
}

const text = (v, n = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)
const evidenceOf = (list) => (Array.isArray(list) ? list : []).map((e) => ({ what: text(e?.what, 160), when: text(e?.when, 40) })).filter((e) => e.what).map((e) => (e.when ? e : { what: e.what })).slice(0, 4)

/** The model's answer, read strictly. */
export function readLearnerOutput(raw) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const facts = (Array.isArray(r.facts) ? r.facts : []).map((f) => ({
    about: text(f?.about, 80), text: text(f?.text), words: (Array.isArray(f?.words) ? f.words : []).map((w) => text(w, 40)).filter(Boolean).slice(0, 6),
    kinds: (Array.isArray(f?.kinds) ? f.kinds : []).filter((k) => KINDS.includes(k)), count: Math.max(0, Math.round(Number(f?.count) || 0)), weeks: Math.max(0, Math.round(Number(f?.weeks) || 0)),
    evidence: evidenceOf(f?.evidence), sensitive: f?.sensitive === true,
  })).filter((f) => f.about && f.text && f.kinds.length).slice(0, 30)
  const confirms = (Array.isArray(r.confirms) ? r.confirms : []).filter((c) => typeof c?.id === 'string' && c.id)
    .map((c) => ({ id: c.id, kinds: (Array.isArray(c.kinds) ? c.kinds : []).filter((k) => KINDS.includes(k)), evidence: evidenceOf(c.evidence) })).slice(0, 30)
  const thoughts = (Array.isArray(r.thoughts) ? r.thoughts : []).map((t) => ({ about: text(t?.about, 80) ?? 'Jake', text: text(t?.text), when: text(t?.when, 20) }))
    .filter((t) => t.text).map((t) => (t.when ? t : { about: t.about, text: t.text })).slice(0, 5)
  return { facts, confirms, thoughts }
}

/** What the learner is told. */
export function buildLearnerPrompt({ patterns = [], emails = [], conversations = [], memory = [], family = [], today, lists = [] }) {
  const pat = patterns.map((p) => `- ${p.who} · ${p.title} · ${p.count} times over ${p.weeks} weeks (${p.first} to ${p.last})${p.place ? ` · at ${p.place}` : ''}`).join('\n') || '- none'
  const mail = emails.map((e) => `- ${e.from} · ${e.subject}${e.gist ? ` · ${e.gist}` : ''} · ${String(e.received ?? '').slice(0, 10)}`).join('\n') || '- none'
  const talk = conversations.map((c, i) => `Conversation ${i + 1}:\n${c.map((m) => `  ${m.role === 'user' ? 'Them' : 'Casa'}: ${String(m.content ?? '').slice(0, 300)}`).join('\n')}`).join('\n\n') || 'none'
  const known = memory.map((m) => `- [${m.id}] ${m.about_label}: ${m.text} (${m.status}, ${m.confidence === 'sure' ? 'sure' : 'not sure yet'})`).join('\n') || '- nothing yet'
  return `You keep the Tabor family's memory for their home assistant, Casa: short facts about the people, places and things in their life. Today is ${today}. The family: ${family.map((m) => m.name).join(', ')}.

Read what happened and propose only what the evidence below supports, in plain words a person would say ("Plays softball for the Huskies; practices Mondays at 6 at Lake Lytal Park"). Never propose anything already listed under WHAT CASA KNOWS — not what's active, and never what was corrected or forgotten. Never guess beyond the evidence. Mark sensitive true for health, therapy or money.

A fact is something lasting about someone or something in the family's life: who a person is to them (a teacher, a coach, a doctor, a friend, a sitter), where someone goes (school, work, a team, a gym, a class), what they do regularly (and when), what they like, their pets, their house and cars. Not facts: one-time events or appointments (the calendar has them), companies' notices, bills, account alerts, marketing, newsletters and school-wide news — a sender is a fact only when they're someone to this family ("Rosangela Paine: Owen's kindergarten teacher"), never what one email said. Leave out anything that looks like a test. School and work hours, and who drops off or picks up, are kept as routines on each person's page — never facts.

An open thought is an idea or a plan the family raised about their own life, left open — neither settled nor dropped ("look at a pergola in the spring") — in their words, about the person who raised it. Never about Casa itself, testing it, or the app; never something already done, on the calendar or on a list.

Return only JSON: {"facts": [{"about": "who or what", "text": "the fact", "words": ["what on a flyer or email points to it"], "kinds": ["calendar"|"email"|"conversation"|"routine"], "count": n, "weeks": n, "evidence": [{"what": "…", "when": "…"}], "sensitive": false}], "confirms": [{"id": "an [id] below that is not sure yet and this evidence supports", "kinds": [...], "evidence": [...]}], "thoughts": [{"about": "who", "text": "an idea or to-do talked about in a conversation below that was left unfinished — neither settled nor dropped", "when": "YYYY-MM-DD"}]}

WHAT CASA KNOWS:
${known}

ALREADY ON A LIST (projects and to-dos — never an open thought):
${lists.map((t) => `- ${t}`).join('\n') || '- none'}

THE CALENDAR'S PATTERNS (the last 60 days and the next 30):
${pat}

EMAIL (the last week, as the email reader read it):
${mail}

CONVERSATIONS WITH CASA (the last day):
${talk}`
}
