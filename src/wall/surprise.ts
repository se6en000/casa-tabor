import type { WallChecklistItem } from './packing'

// Surprise-safe (P3.7, board note "SURPRISE-SAFE"): the wall is seen by everyone in the
// house, including whoever is being celebrated. So it shows "Kelly's Birthday" and
// nothing more: the gift, the card and the plan never reach it (they belong on the
// other phones, Phase 4). Nothing in the data marks an item private yet, so a
// celebration is recognised from its title: a family member's name right next to a
// celebration word ("Kelly's Birthday", "Kelly BD Night Out", "Surprise party for
// Kelly"). A friend's party someone goes to ("Liv going to Piper's Birthday Party")
// celebrates nobody in the family.

const NEXT_TO_NAME = String.raw`birthday|bday|b-day|bd|anniversary|surprise|party`
const BEFORE_NAMES = String.raw`birthday|bday|b-day|bd|anniversary|surprise|party|gift`

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** The family members an event celebrates (by id), from its title. */
export function celebrationHonorees(title: string, members: Array<{ id: string; name: string }>): string[] {
  const text = title ?? ''
  const found = new Set<string>()
  for (const m of members) {
    const name = escape(m.name.trim())
    if (!name) continue
    // "Kelly's Birthday", "Kelly BD Night Out", "Owen's 8th birthday party"
    const own = new RegExp(String.raw`\b${name}(?:'s|’s)?\s+(?:\d+(?:st|nd|rd|th)\s+)?(?:${NEXT_TO_NAME})\b`, 'i')
    // "Surprise party for Kelly", "Anniversary dinner — Jake & Kelly"
    const after = new RegExp(String.raw`\b(?:${BEFORE_NAMES})\b[^.]*?(?:\bfor\b|—|–|\s-\s|:)[^.]*\b${name}\b`, 'i')
    if (own.test(text) || after.test(text)) found.add(m.id)
  }
  return [...found]
}

/** The checklist with every celebration's prep taken out: what the wall may show. */
export function surpriseSafeChecklist<T extends Pick<WallChecklistItem, 'event_id'>>(
  items: T[],
  events: Array<{ id: string; title: string }>,
  members: Array<{ id: string; name: string }>,
): T[] {
  const secret = new Set(events.filter((e) => celebrationHonorees(e.title, members).length > 0).map((e) => e.id))
  return items.filter((i) => !secret.has(i.event_id))
}
