// Casa sorts Jake's Reminders to-dos (FAMILY_WALL_PLAN.md P3.22 step 2). The model gives each one
// a shape, a size, a cost, a next step and what it needs; it may also suggest merging a duplicate,
// closing one that's clearly past, or moving a grocery to Shopping. Suggestions change his iOS
// list, so they only ever wait for his yes. Pure: prompt in, validated answer out.

export const SHAPES = ['nudge', 'quick', 'fix', 'project', 'dated']
// The only "needs" labels the wall shows; anything else the model invents is dropped.
export const NEEDS = ['Safety', 'Hot water', 'Leak', 'No power', 'Call', 'Look-up', 'Order', 'Buy', 'Needs a pro', 'Dry weather', 'Daylight', 'Kids', 'School']
const SUGGESTIONS = ['merge', 'done', 'shopping']

export function buildSortPrompt(items, { today }) {
  const lines = items.map((i) => `- [${i.id}] ${i.title}${i.due ? ` (due ${i.due})` : ''}`).join('\n')
  return `You sort a family man's to-do list (captured quickly on his phone and watch; he has ADHD, so each item needs one small, concrete next step). Today is ${today}. Home: West Palm Beach, Florida.

First, look for repeats: items that mean the same thing (same task, maybe worded differently or with different dates) — mark every extra one {"kind": "merge", "with": "<id of the one to keep>"}.

For each item decide:
- shape: "nudge" (something that repeats at a time, like taking the trash out or a monthly clean), "quick" (one sitting of 30 minutes or less: a call, a look-up, an order, a small errand or swap), "fix" (a repair or install: diagnose or get a quote, buy parts, then do it), "project" (many steps in order over weeks, like painting the house), "dated" (it is about an event or deadline on its date: a school deadline, a party, a pickup, a message for a certain day). Having a reminder date does not make something "dated" — "Replace the smoke-detector battery" with a date is still a quick job.
- minutes: a realistic estimate for the next step (a number), or null.
- cost: rough dollars for the whole thing, or null if unknown.
- next_step: the first physical action, short and specific ("Check the gas valve, then reset it"), or null if the title already is one.
- needs: zero to three of exactly these labels: ${NEEDS.join(', ')}. "Safety" only for a real hazard (live electrical, gas, a fall, something structural); "No power" / "Hot water" / "Leak" only when the house is actually without it.
- suggestion (optional): the merge above; {"kind": "done", "reason": "..."} only when the thing itself was a moment that has clearly passed (a birthday pickup months ago, a spirit day last week, a message for "tomorrow" days ago) — a missed date is still a to-do, never "done" just because its date went by; {"kind": "shopping", "reason": "..."} when it is just a grocery or household item to buy.

Items:
${lines}

Answer with only a JSON array, one object per item: {"id","shape","minutes","cost","next_step","needs","suggestion"}.`
}

const clampInt = (value, min, max) => {
  const n = Number(value)
  return Number.isFinite(n) && n >= min && n <= max ? Math.round(n) : null
}

/**
 * @param {Array<{ id: string, due?: string | null }>} items the items asked about (and any others
 *   shown for spotting repeats)
 */
export function parseSortResult(text, items, { today }) {
  const ids = items.map((i) => i.id)
  const dueOf = new Map(items.map((i) => [i.id, i.due ?? null]))
  const raw = String(text ?? '').replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim()
  let rows
  try {
    rows = JSON.parse(raw)
  } catch {
    const match = raw.match(/\[[\s\S]*\]/)
    try { rows = match ? JSON.parse(match[0]) : [] } catch { rows = [] }
  }
  if (!Array.isArray(rows)) return {}
  const known = new Set(ids)
  const out = {}
  for (const row of rows) {
    const id = String(row?.id ?? '')
    if (!known.has(id) || out[id] || !SHAPES.includes(row.shape)) continue
    const s = row.suggestion
    let suggestion = null
    if (s && SUGGESTIONS.includes(s.kind)) {
      const reason = typeof s.reason === 'string' ? s.reason.slice(0, 140) : ''
      if (s.kind === 'merge') {
        const withId = String(s.with ?? '')
        if (known.has(withId) && withId !== id) suggestion = { kind: 'merge', with: withId, reason }
      } else if (s.kind === 'done') {
        // Only for a date that's really gone by: the model's date slips never close anything.
        const due = dueOf.get(id)
        // …and only for a moment (a party, a spirit day), never a job whose date simply went by.
        if (due && today && due < today && row.shape === 'dated') suggestion = { kind: 'done', reason }
      } else {
        suggestion = { kind: s.kind, reason }
      }
    }
    const cost = clampInt(row.cost, 0, 100000)
    out[id] = {
      shape: row.shape,
      minutes: clampInt(row.minutes, 1, 60 * 24 * 7),
      cost_cents: cost == null ? null : cost * 100,
      next_step: typeof row.next_step === 'string' && row.next_step.trim() ? row.next_step.trim().slice(0, 160) : null,
      needs: Array.isArray(row.needs) ? row.needs.filter((n) => NEEDS.includes(n)).slice(0, 3) : [],
      suggestion,
    }
  }
  return out
}
