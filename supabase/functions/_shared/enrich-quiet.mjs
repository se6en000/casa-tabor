// What the event enricher may add without making noise (Jake, 2026-10-01: "review what it does and if it's helping or
// creating noise" — then "cleanup the enrich event issue"). Its guessed packing items ("Insurance card", "List of
// current medications" on an orthodontist visit, three times over), generic prep and parking text, and moved places
// were the noise; what the event's own words say is the signal.

const STOP = new Set(['with', 'your', 'their', 'from', 'that', 'this', 'have', 'will', 'into', 'over', 'some', 'list', 'items', 'item', 'current'])

/** The meaningful words of a phrase (4+ letters, not filler), singular-ish. */
function words(text) {
  return String(text ?? '').toLowerCase().match(/\p{L}{4,}/gu)?.filter((w) => !STOP.has(w)).map((w) => w.replace(/(ies|es|s)$/, '')) ?? []
}

/** Whether an item to bring is something the event's own text mentions ("Violin" in "Emme Practice Violin"). */
export function statedInSource(item, sourceText) {
  const source = new Set(words(sourceText))
  const want = words(item)
  return want.length > 0 && want.some((w) => source.has(w))
}

/** Only the items the source mentions, each once (case and spacing ignored). */
export function bringFromSource(items, sourceText) {
  const seen = new Set()
  return (items ?? []).filter((item) => {
    const key = String(item ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key) || !statedInSource(item, sourceText)) return false
    seen.add(key)
    return true
  })
}

/** A school run copied from a routine ("Drop off Emme @ Palm Beach Public …"): the routine is the source; nothing to add. */
export function isRoutineRunCopy(title) {
  return /^(drop off|pick up|pickup|dropoff)\b.+@/i.test(String(title ?? '').trim())
}
