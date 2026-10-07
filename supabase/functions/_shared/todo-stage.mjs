// Where a to-do is in its time (Jake, Oct 7: "I would like for the task to be prioritized as it comes up to its due
// day or at the due day, but I would like for the proactive system to be aware of what is coming up due and notify or
// proactively bring up to me an appropiate about of time before … stuff that is overdue, we should always be talking
// about, if I snooze it I want it actually snoozed from all conversations till its due again"). One clock, read by To
// do, the morning brief, Alexa and the pushes, so they never disagree:
//   snoozed   — silent everywhere until the snooze ends
//   overdue   — past its day: top of Next up, in the brief daily, Alexa raises one a day (with an offer)
//   due       — its day: on Next up
//   heads_up  — a lead time before (by size): the brief mentions it, Alexa may say so once, in passing
//   quiet     — further off: folded under Later, nobody brings it up
//   undated   — no date: sorted as before (quick wins, fixes)
// Pure.

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400e3)

/**
 * How long before its day a to-do is worth a heads-up, by what it takes: a small reminder (the washer clean, Hello
 * Fresh) the day before; something with a part to buy, half an hour or more, or a fix three days; anything needing a
 * pro, a booking or other people a week.
 */
export function leadDays({ minutes = null, shape = null, needs = [] } = {}) {
  const n = (needs ?? []).map((x) => String(x).toLowerCase())
  if (shape === 'project' || n.some((x) => /pro\b|book|hire|quote|schedule/.test(x))) return 7
  if (shape === 'fix' || (minutes != null && minutes >= 30) || n.some((x) => /buy|order|part/.test(x))) return 3
  return 1
}

/** { stage, daysAway, leadDays } for a to-do on a day (YYYY-MM-DD, the house's). */
export function todoStage(item, today) {
  const lead = leadDays(item)
  if (item.snoozedUntil && item.snoozedUntil > today) return { stage: 'snoozed', daysAway: item.due ? daysBetween(today, item.due) : null, leadDays: lead }
  if (!item.due) return { stage: 'undated', daysAway: null, leadDays: lead }
  const daysAway = daysBetween(today, item.due)
  const stage = daysAway < 0 ? 'overdue' : daysAway === 0 ? 'due' : daysAway <= lead ? 'heads_up' : 'quiet'
  return { stage, daysAway, leadDays: lead }
}

/**
 * The one overdue to-do Alexa raises today, or null: the most pressing — safety and the house first, then one late
 * this week (oldest first), then the long-gone ones (each gets its "still want this?") — not one already raised today,
 * nothing snoozed.
 */
export function overdueToRaise(items, today, raised = null) {
  if (raised?.date === today) return null
  const urgent = (i) => (i.needs ?? []).some((n) => /safety|hot water|leak|no power/i.test(n)) ? 1 : 0
  // Late this week before long gone: something still worth an offer before "still want this?" about a stale one.
  const fresh = (i) => (todoStage(i, today).daysAway >= -7 ? 1 : 0)
  return (items ?? [])
    .filter((i) => todoStage(i, today).stage === 'overdue')
    .sort((a, b) => urgent(b) - urgent(a) || fresh(b) - fresh(a) || a.due.localeCompare(b.due))[0] ?? null
}

/**
 * The one offer that moves a late to-do, as a yes/no question (Jake, Oct 7: "look up a part number, suggest a
 * professional … put a post on a work job site … Something thats an action item i can say yes or no to" → "for Pros,
 * lets keep it local … im looking for mostly DYI guys, handimen, for a big project I wont use alexa"). Only what she
 * can do: look up, find, a calendar card, a draft — never "open" or "start" something outside the app.
 */
const HANDYMEN = 'find three well-reviewed local handymen near home, with their numbers — or write a short TaskRabbit post he can send (Nextdoor if he would rather ask the neighbours)'
export function offerFor(item) {
  const n = (item.needs ?? []).map((x) => String(x).toLowerCase())
  // A big project is his to run: time for it, never pros or a post.
  const big = item.shape === 'project' || (item.minutes != null && item.minutes >= 240)
  if (big) return `put ${Math.min(item.minutes ?? 120, 180)} minutes for it on the calendar this week — a day and time he can say yes to`
  if (n.some((x) => /pro\b|hire|quote|handy/.test(x))) return HANDYMEN
  if (n.some((x) => /buy|order|part/.test(x))) return 'find the exact part and what it costs, and where to get it nearby'
  if (n.some((x) => /look-?up|research/.test(x))) return 'look it up right now'
  if (item.shape === 'fix') return HANDYMEN
  if (n.some((x) => /call/.test(x))) return 'find the number and put a 10-minute call on the calendar'
  if (item.nextStep) return `help with its first step right here (${item.nextStep}), or put ${item.minutes ?? 30} minutes for it on the calendar this week`
  return `put ${item.minutes ?? 60} minutes for it on the calendar this week — a day and time he can say yes to`
}
