// The morning paper (canvas 48a; Jake, Oct 6: "bring in the briefing into the calm screen … a newspaper editorial
// look"). The wall sends the day's facts (src/wall/paper.ts); this writes three lines from them — the headline, the
// line under it, and the sky — once a day. Pure, so it's tested.

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

export function paperPrompt(facts, sky) {
  const lines = [
    `Day: ${facts.day}`,
    `On the road (time · what): ${facts.runs.length ? facts.runs.map((r) => `${r.at} · ${r.text}${r.alert ? ` (${r.alert})` : ''}`).join(' | ') : 'nothing'}`,
    `Away or travelling: ${facts.away.length ? facts.away.join(' | ') : 'nobody'}`,
    `All day: ${facts.also.length ? facts.also.join(' | ') : 'nothing'}`,
    `Sky: ${sky ?? facts.weatherNow ?? 'unknown'}`,
  ]
  return `You write the front page of Tabor House's morning paper: three short lines on a kitchen wall, read over coffee.

${lines.join('\n')}

Write JSON only: {"headline": "...", "deck": "...", "sky": "..."}
- headline: the one thing worth knowing today, at most 16 words, as one or two short plain sentences with full stops. Someone going away and a run with no driver are the news; when both happen, tie them together (who's away, so who needs a driver). On a day with nothing unusual, say so warmly ("An easy Saturday.").
- deck: one sentence, at most 30 words, beginning "The rest" or similar, on everything else: the runs with who drives and the time, and the all-day things.
- sky: one or two sentences, at most 26 words, on the weather and what it means for the day's plans (an umbrella for practice, a hot afternoon at the park).
- Always use people's names exactly as given (never "the children", "two kids", "a parent"). Times as written (7:00, 2:13).
- Use only the facts above: no names, places, times or events that aren't there. No emoji, no exclamation marks, no "Good morning".

The voice, for a different day (don't copy its facts): {"headline": "Kelly is in Boston. Owen's 4:30 swim needs a ride.", "deck": "The rest is a usual Tuesday: Jake takes Liv to Bak at 7:40, and Emme has picture day.", "sky": "Hot and dry, 91° by three. Water bottles for the pool."}`
}

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').replace(/^["“']|["”']$/g, '').trim()

/** The model's reply as the paper's three lines, or null when it isn't usable. */
export function parsePaperWords(text) {
  const json = String(text ?? '').match(/\{[\s\S]*\}/)?.[0]
  if (!json) return null
  let raw
  try { raw = JSON.parse(json) } catch { return null }
  const words = { headline: clean(raw.headline), deck: clean(raw.deck), sky: clean(raw.sky) }
  if (!words.headline || words.headline.length > 120 || words.deck.length > 240 || words.sky.length > 200) return null
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(Object.values(words).join(' '))) return null
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
