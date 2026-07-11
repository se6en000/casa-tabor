const COMPOUNDS = [
  'whipped cream',
  'birthday candles',
  'party favors',
  'water bottles',
  'paper plates',
  'plastic utensils',
  'swim suits',
]

function enrichmentFor(event) {
  return Array.isArray(event?.event_enrichments) ? event.event_enrichments[0] : event?.event_enrichments
}

function unique(items) {
  const result = []
  const keys = new Set()
  for (const raw of items) {
    const item = String(raw ?? '').replace(/\s+/g, ' ').trim()
    const key = item.toLowerCase()
    if (!item || keys.has(key)) continue
    keys.add(key)
    result.push(item)
  }
  return result
}

function parseItems(value) {
  let input = String(value ?? '')
    .replace(/[.!?]+$/g, '')
    .replace(/\b(?:please|thanks|thank you)\b/gi, '')
    .trim()
  const protectedItems = []
  for (const compound of COMPOUNDS) {
    input = input.replace(new RegExp(`\\b${compound}\\b`, 'gi'), () => {
      const token = `compound${protectedItems.length}`
      protectedItems.push(compound)
      return token
    })
  }
  const chunks = input.split(/\s*(?:,|;|\band\b|\bplus\b)\s*/i).filter(Boolean)
  return unique(chunks.flatMap((chunk) => {
    const parts = chunk.trim().split(/\s+/)
    if (parts.length > 1 && parts.some((part) => /^compound\d+$/.test(part))) return parts
    return [chunk]
  }).map((item) => {
    const match = item.match(/^compound(\d+)$/)
    return match ? protectedItems[Number(match[1])] : item
  }))
}

function pendingBringList(pendingAction, eventId) {
  if (
    pendingAction?.tool !== 'update_event' ||
    pendingAction?.args?.id !== eventId ||
    !Array.isArray(pendingAction?.args?.what_to_bring)
  ) return null
  return pendingAction.args.what_to_bring
}

export function resolveBringListEdit(text, event, options = {}) {
  if (!event?.id) return null
  const input = String(text ?? '').replace(/\s+/g, ' ').trim()
  const pending = pendingBringList(options.pendingAction, event.id)
  const current = pending ?? enrichmentFor(event)?.what_to_bring ?? []

  const correction = pending && input.match(/^(.+?)\s+(?:not|instead of)\s+(.+?)[.!]?$/i)
  if (correction) {
    const additions = parseItems(correction[1])
    const removeKey = correction[2].trim().toLowerCase()
    const next = unique([...current.filter((item) => String(item).toLowerCase() !== removeKey), ...additions])
    if (next.length === 0 || next.length > 25) return null
    return {
      tool: 'update_event',
      args: { id: event.id, expected_updated_at: event.updated_at, what_to_bring: next },
      event,
    }
  }

  const explicit = input.match(
    /\badd\s+(?:to\s+)?(?:the\s+)?(?:list\s+to\s+bring|things?\s+to\s+bring|what\s+to\s+bring|bring\s+list)\s+(.+)$/i,
  ) ?? input.match(
    /\badd\s+(.+?)\s+to\s+(?:the\s+)?(?:list\s+to\s+bring|things?\s+to\s+bring|what\s+to\s+bring|bring\s+list)$/i,
  )
  const continuation = pending && !/\b(?:what|why|how|when|where|who)\b/i.test(input) && input.split(/\s+/).length <= 6
  const additions = parseItems(explicit?.[1] ?? (continuation ? input : ''))
  if (additions.length === 0) return null

  const next = unique([...current, ...additions])
  if (next.length === 0 || next.length > 25 || next.length === current.length) return null
  return {
    tool: 'update_event',
    args: { id: event.id, expected_updated_at: event.updated_at, what_to_bring: next },
    event,
  }
}
