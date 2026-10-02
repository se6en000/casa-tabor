// Smarter drafts (the UX review's ten moments; step 5 of the phone rearranged): what Casa's card already says, said on
// every way of adding — a clash for anyone going, and the place from the last time it happened. Pure, so it's tested
// without a database.

export { clashLines } from '../wall/clashes.ts'

export interface PastPlace { title: string; location_name: string | null; address: string | null; start_time: string }

// Words that say what kind of thing it is, not which: they don't make two titles the same.
const PLAIN = new Set(['the', 'and', 'for', 'with', 'appointment', 'appt', 'meeting', 'pick', 'drop', 'off', 'from', 'visit'])
const words = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).map((w) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w)).filter((w) => w.length > 2 && !PLAIN.has(w)))

/** The place the last event like this one was at ("Happy Tails, like last time"), or null. */
export function placeFromLastTime(title: string, past: PastPlace[], now: Date): { name: string; address: string | null } | null {
  const mine = words(title)
  if (mine.size === 0) return null
  const match = past
    .filter((p) => new Date(p.start_time) <= now)
    .sort((a, b) => Date.parse(b.start_time) - Date.parse(a.start_time))
    .find((p) => {
      const theirs = words(p.title)
      const shared = [...mine].filter((w) => theirs.has(w)).length
      return shared > 0 && shared / Math.min(mine.size, theirs.size || 1) >= 0.5
    })
  if (!match || !(match.location_name || match.address)) return null
  return { name: match.location_name || match.address!, address: match.address }
}
