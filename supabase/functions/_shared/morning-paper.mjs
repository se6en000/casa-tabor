// The morning paper (canvas 48a; Jake, Oct 6: "bring in the briefing into the calm screen … a newspaper editorial
// look"), then the morning brief (canvas 58: today, the weekend, next month, way out, one thing forgotten, a surprise,
// a joke — "you can adjust this every day without my permission"). The wall sends the facts (src/wall/paper.ts); the
// server looks up the surprise and this writes the words, once a day. Pure, so it's tested.

import { holidaysSection } from './school-calendar.mjs'
const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`)

/** The day's sky from Open-Meteo's hourly forecast (local times "2026-10-07T15:00"), 6 AM to 9 PM, in plain facts. */
export function skyFacts(hourly) {
  const rows = (hourly?.time ?? []).map((t, i) => ({ h: Number(String(t).slice(11, 13)), temp: hourly.temperature_2m?.[i], rain: hourly.precipitation_probability?.[i] }))
    .filter((r) => r.h >= 6 && r.h <= 21 && Number.isFinite(r.temp))
  if (!rows.length) return null
  const morning = rows.find((r) => r.h === 7) ?? rows[0]
  const high = rows.reduce((a, b) => (b.temp > a.temp ? b : a))
  const wettest = rows.reduce((a, b) => ((b.rain ?? 0) > (a.rain ?? 0) ? b : a))
  const wetFrom = rows.find((r) => (r.rain ?? 0) >= 30)
  const parts = [`${Math.round(morning.temp)}° at ${hourLabel(morning.h)}`, `high ${Math.round(high.temp)}° about ${hourLabel(high.h)}`]
  if (wetFrom) parts.push(`rain chance 30% or more from ${hourLabel(wetFrom.h)}, up to ${wettest.rain}% about ${hourLabel(wettest.h)}`)
  else parts.push(`rain chance no more than ${wettest.rain ?? 0}%`)
  return parts.join('; ')
}

/** What to look up for the day's surprise (canvas 58): somewhere for a date night, something on nearby this weekend. */
export function searchPrompt(area, day, until = null) {
  return `Search the web for ${area}. Today is ${day}. Find:
1. One restaurant good for a date night that is getting strong recent reviews or recognition (new, newly praised, or a local favourite). Its name, neighbourhood, what it's known for, and why it's notable now.
2. One family-friendly thing happening nearby ${until ? `between today and ${until}` : 'in the next nine days'} (a market, festival, show, free event): its name, its exact date, time and place. Nothing outside those dates.
Only real, current places and events, with their sources. Short factual notes, no advice.`
}

const list = (label, items, each) => `${label}: ${items.length ? items.map(each).join(' | ') : 'none'}`

export function paperPrompt(facts, sky, more = null, found = null, voice = null) {
  const lines = [
    `Day: ${facts.day}`,
    `On the road today (time · what): ${facts.runs.length ? facts.runs.map((r) => `${r.at} · ${r.text}${r.alert ? ` (${r.alert})` : ''}`).join(' | ') : 'nothing'}`,
    `Away or travelling: ${facts.away.length ? facts.away.join(' | ') : 'nobody'}`,
    `All day today: ${facts.also.length ? facts.also.join(' | ') : 'nothing'}`,
    `Sky: ${sky ?? facts.weatherNow ?? 'unknown'}`,
  ]
  if (more) {
    lines.push(
      `The family: ${more.people.join(', ')}`,
      list('The days ahead', more.week, (d) => `${d.day}: ${d.lines.join('; ')}`),
      list('Coming up (days away · what · next step)', more.comingUp, (c) => `${c.daysAway} days · ${c.title}${c.late ? ' (late to start)' : ''} · ${c.nextStep}`),
      list('Projects not finished (done of steps · next step)', more.projects, (p) => `${p.title} (${p.done} of ${p.total}${p.aim ? `, aiming for ${p.aim}` : ''}) · next: ${p.next ?? 'none written'}`),
      list('To-dos that have gone quiet', more.quiet, (q) => q),
      list('To-dos coming due (a heads-up: today or soon)', more.soon ?? [], (q) => q),
    )
  }
  // Holidays and the kids' school breaks ahead, for the weekend, month and way-out columns (Jake, Oct 7).
  if (more) { const ahead = holidaysSection(facts.date, 4); if (ahead) lines.push(ahead.split('\nBe a step ahead')[0]) }
  if (found) lines.push(`Found on the web this morning (real places and events — use only these for the surprise): ${found}`)
  return `You write Tabor House's morning brief: the front page on the family's kitchen wall, read over coffee. You have creative freedom (Jake: "surprise me … make it what you think would be a great morning brief"), within the rules below.${voice ? `
${voice} Let the aside and the joke sound like her; the logistics stay plain.` : ''}

${lines.join('\n')}

Write JSON only:
{"headline": "...", "turn": "...", "deck": "...", "sky": "...",
 "today": [{"title": "...", "detail": "..."}], "weekend": [...], "month": [...], "wayOut": [...],
 "forgot": {"title": "...", "detail": "..."}, "feature": {"label": "...", "title": "...", "detail": "..."}, "aside": "..."}
- headline + turn: the front page's one line, said in two halves — headline the plain first half ("Spirit Day,"), turn the second half set in italic ("and a big weekend coming."). Together at most 12 words; true to the family's facts (the day's real news — never the surprise, never invent a change or a problem). turn may be "" for a one-part headline.
- deck: one sentence, at most 30 words, on today and what's coming (who drives, the big thing tomorrow).
- sky: one or two sentences, at most 26 words, on the weather and what it means for the plans.
- today: 1–3 things to watch for today — a run with no driver, two things at once, a tight turnaround, rain on a game, something late. When nothing is wrong, say so first ("Nothing’s wrong").
- weekend: 1–3 things to get ready in the days ahead, only from "The days ahead" (a list not packed, a guest coming, a driver missing). Never from the web.
- month: 1–3 things two to six weeks out that need real planning (from Coming up and projects): what it is, how far, the first step.
- wayOut: 1–3 things further out worth starting early. Only from the facts — never invent dates or documents.
- forgot: the one thing that has gone quietest — a project stuck partway, a to-do put off again and again, a Coming up thing late to start — and why now is a good moment. Null when there's nothing.
- feature: today's surprise, your choice: a date night at a real place from "Found on the web" (title: the place's name; detail: why it's worth it, and an evening in "The days ahead" that looks free), an outing from "Found on the web" (title: its name; detail: its day and why the kids would like it), or something else that would delight this family. label is two to five words ("Worth a try · date night", "This weekend · outing"). When "Found on the web" names a place or an event, use one of them — a date night or a weekend outing first; something today only when the calendar clearly leaves room for it. Null only when there's nothing real to offer.
- aside: one witty line for the foot — a gentle joke or wordplay from today's or the week's real facts (two games at once in one park → "Saturday at Ferrin Park: the Taborville Classic."; three school runs before 8 → "Jake, Kelly and Giselle: the morning relay."). Never the weather, never a plain fact or a summary. Kind; never at a child's expense.
- Each title at most 6 words; each detail at most 22 words.
- Names exactly as given. Times as written (7:00, 2:13). Days by name ("Saturday"); dates as people say them ("October 3", "in two weeks") — never 2026-10-03.
- Family facts only from the lists above: no invented people, events, times, documents or ages.
- Never mention gifts, gift ideas or surprises for anyone in the family (they read this wall). Nothing private (medicine, money, health).
- No emoji, no exclamation marks, no "Good morning".

The voice, for a different day (don't copy its facts): {"headline": "Kelly is in Boston,", "turn": "so Owen’s swim needs a ride.", "deck": "Jake takes Liv to Bak at 7:40; Emme has picture day, and Saturday is the Harvest Fair.", "sky": "Hot and dry, 91° by three. Water bottles for the pool."}`
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/^["“']|["”']$/g, '').trim()

// The paper's voice has no exclamation marks; one that slips into the brief becomes a full stop.
const calm = (s) => clean(s).replace(/!+/g, '.')
const capped = (s, n) => { const v = calm(s); return v.length > n ? `${v.slice(0, n - 1).replace(/\s+\S*$/, '')}…` : v }
const line = (v) => (v && typeof v === 'object' && clean(v.title) ? { title: capped(v.title, 60), detail: capped(v.detail, 180) } : null)
const lines = (v) => (Array.isArray(v) ? v.map(line).filter(Boolean).slice(0, 3) : [])
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u

/** The model's reply as the paper's words — the three lines, and the brief when it wrote one — or null when unusable. */
export function parsePaperWords(text) {
  const json = String(text ?? '').match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let raw
  try { raw = JSON.parse(json) } catch { return null }
  const words = { headline: clean(raw.headline), deck: clean(raw.deck), sky: clean(raw.sky) }
  if (!words.headline || words.headline.length > 120 || words.deck.length > 240 || words.sky.length > 200) return null
  const hasBrief = ['today', 'weekend', 'month', 'wayOut'].some((k) => Array.isArray(raw[k]))
  if (hasBrief) {
    const feature = line(raw.feature)
    words.brief = {
      turn: clean(raw.turn).slice(0, 80) || null,
      today: lines(raw.today), weekend: lines(raw.weekend), month: lines(raw.month), wayOut: lines(raw.wayOut),
      forgot: line(raw.forgot),
      feature: feature ? { ...feature, label: capped(raw.feature.label || 'Worth a try', 40) } : null,
      aside: calm(raw.aside).slice(0, 160) || null,
    }
  }
  if (EMOJI.test(JSON.stringify(words))) return null
  return words
}

/** The facts the wall sent, kept to their shape and size (anyone with the wall's key can call the function). */
export function cleanFacts(facts) {
  const str = (v, n) => String(v ?? '').slice(0, n)
  const list = (v, n, each) => (Array.isArray(v) ? v.slice(0, n).map(each) : [])
  if (!facts || !/^\d{4}-\d{2}-\d{2}$/.test(String(facts.date))) return null
  return {
    date: String(facts.date),
    day: str(facts.day, 60),
    runs: list(facts.runs, 12, (r) => ({ at: str(r?.at, 8), text: str(r?.text, 120), alert: r?.alert ? str(r.alert, 40) : null })),
    away: list(facts.away, 6, (s) => str(s, 120)),
    also: list(facts.also, 8, (s) => str(s, 120)),
    weatherNow: facts.weatherNow ? str(facts.weatherNow, 60) : null,
  }
}

/** The week, Coming up, projects and quiet to-dos the wall sent for the brief (src/wall/paper.ts briefFacts). */
export function cleanBriefFacts(more) {
  if (!more || typeof more !== 'object') return null
  const str = (v, n) => String(v ?? '').slice(0, n)
  const list = (v, n, each) => (Array.isArray(v) ? v.slice(0, n).map(each) : [])
  const num = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : 0)
  return {
    people: list(more.people, 12, (p) => str(p, 40)),
    week: list(more.week, 7, (d) => ({ day: str(d?.day, 40), lines: list(d?.lines, 8, (l) => str(l, 160)) })),
    comingUp: list(more.comingUp, 16, (c) => ({ title: str(c?.title, 100), date: str(c?.date, 10), daysAway: num(c?.daysAway), nextStep: str(c?.nextStep, 140), late: Boolean(c?.late) })),
    projects: list(more.projects, 8, (p) => ({ title: str(p?.title, 100), done: num(p?.done), total: num(p?.total), next: p?.next ? str(p.next, 140) : null, aim: p?.aim ? str(p.aim, 10) : null })),
    quiet: list(more.quiet, 8, (q) => str(q, 140)),
    soon: list(more.soon, 6, (q) => str(q, 360)),
  }
}
