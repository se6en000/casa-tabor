// The family's routines, for Alexa (Jake, Oct 7: Owen's afternoons with Giselle — "could be worth it for the AI to
// know? when we have to deal with conflicts, like Owen has a dentist apt at 3PM, i would need to coordinate that with
// Giselle (or she would take him and I would pick up Liv)"). From member_availability_rules (one row per weekday, the
// routine in `reason`) and the days off ahead. Pure.

const DAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const clock = (hhmm) => {
  const [h, m] = String(hhmm ?? '').split(':').map(Number)
  if (!Number.isFinite(h)) return ''
  return `${h % 12 === 0 ? 12 : h % 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`
}
const daysText = (days) => {
  const d = [...new Set(days)].sort((a, b) => a - b)
  if (d.join() === '1,2,3,4,5') return 'Mon–Fri'
  return d.map((x) => DAY[x]).join(', ')
}

function parse(reason) {
  try {
    const p = typeof reason === 'string' ? JSON.parse(reason) : reason
    return p && (p.type === 'family_routine' || p.type === 'school_routine') ? p : null
  } catch { return null }
}

/** One line per routine: who, what, where, which days, when, who drives or has them, and how a day differs. */
export function routineLines(rules, family) {
  const nameOf = (id) => family.find((m) => m.id === id)?.name ?? null
  const groups = new Map()
  for (const r of rules ?? []) {
    const p = parse(r.reason)
    if (!p || p.enabled === false) continue
    const key = `${r.member_id}|${p.key ?? 'main'}`
    const g = groups.get(key) ?? { memberId: r.member_id, p, days: [] }
    g.days.push(Number(r.day_of_week))
    groups.set(key, g)
  }
  const lines = []
  for (const { memberId, p, days } of groups.values()) {
    const who = nameOf(memberId)
    if (!who) continue
    const when = `${daysText(days)} ${clock(p.startLocal)}–${clock(p.endLocal)}`
    const place = p.venueName ? ` at ${p.venueName}` : ''
    let how
    if (p.routineType === 'care') {
      const carer = p.pickupDriverName || p.dropoffDriverName
      how = carer ? ` — ${carer} has ${who} then${p.pickupDriverName ? ` and brings ${who} home` : ''}` : ''
    } else if (p.routineType === 'work') {
      how = ''
    } else {
      const pickupAt = p.pickupVenueName ? ` at ${p.pickupVenueName}` : ''
      how = ` — ${p.dropoffDriverName || 'nobody'} drops off, ${p.pickupDriverName || 'nobody'} picks up${pickupAt}`
    }
    const title = p.routineType === 'care' ? p.title : p.routineType === 'work' ? 'Work' : p.routineType === 'school' ? 'School' : p.title || 'Routine'
    const overrides = (p.dayOverrides ?? []).filter((o) => o.enabled !== false && (o.startLocal || o.endLocal))
      .map((o) => `${DAY[o.dayOfWeek]} ${clock(o.startLocal ?? p.startLocal)}–${clock(o.endLocal ?? p.endLocal)}${o.label ? ` (${o.label})` : ''}`)
    lines.push(`- ${who}: ${title}${place}, ${when}${how}${overrides.length ? `; but ${overrides.join(', ')}` : ''}`)
  }
  return lines
}

/** The ROUTINES section of the assistant's prompt, with the days off ahead and what to do when something lands in one. */
export function routinesSection(rules, family, daysOff = []) {
  const lines = routineLines(rules, family)
  if (!lines.length) return null
  const nameOf = (id) => family.find((m) => m.id === id)?.name ?? null
  // The day's own date (a day off starts at the house's midnight), and what it's for or who has them ("Columbus Day · Giselle has them").
  const off = daysOff.map((d) => {
    const day = new Date(Date.parse(d.start_at) + 12 * 3600e3).toISOString().slice(0, 10)
    const note = d.note && d.note !== 'Day off' ? ` (${d.note})` : ''
    return `${nameOf(d.member_id) ?? '?'} ${day}${note}`
  }).filter((t) => !t.startsWith('?'))
  return `ROUTINES (every week, the same; the wall draws the school runs from these — they're not calendar events):
${lines.join('\n')}${off.length ? `\nDays off ahead (no routine that day): ${off.join(', ')}` : ''}
Something added for someone during their routine is not a clash — don't warn about it. But when someone else has them then (a carer, or the pickup driver for a pickup it changes), say so in a line and ask who's taking them ("Giselle has Owen then — is she taking him, or are you? Then who gets Liv at 3:30?"); the card asks it too.`
}
