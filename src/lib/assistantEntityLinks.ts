const EXISTING_MARKDOWN_LINK = /\[[^\]]+\]\([^)]+\)/g

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function buildAssistantEventHref(eventId: string) {
  return `casa://event/${eventId}`
}

export function buildAssistantRecipeHref(recipeQuery: string) {
  return `casa://recipe/${encodeURIComponent(recipeQuery)}`
}

export function buildAssistantNavHref(destination: 'calendar' | 'grocery' | 'cook' | 'briefing' | 'settings') {
  return `casa://navigate/${destination}`
}

export function parseAssistantHref(href: string): {
  type: 'event' | 'recipe' | 'grocery' | 'navigate' | 'external'
  idOrPath: string
} {
  if (!href) return { type: 'external', idOrPath: '' }
  const eventMatch = href.match(/^casa:\/\/event\/([^/?#]+)$/)
  if (eventMatch) return { type: 'event', idOrPath: eventMatch[1] }

  const recipeMatch = href.match(/^casa:\/\/recipe\/([^/?#]+)$/)
  if (recipeMatch) return { type: 'recipe', idOrPath: decodeURIComponent(recipeMatch[1]) }

  const navMatch = href.match(/^casa:\/\/navigate\/([^/?#]+)$/)
  if (navMatch) return { type: 'navigate', idOrPath: navMatch[1] }

  if (href === 'casa://grocery') return { type: 'grocery', idOrPath: 'grocery' }
  if (href === 'casa://cook') return { type: 'navigate', idOrPath: 'cook' }
  if (href === 'casa://calendar') return { type: 'navigate', idOrPath: 'calendar' }

  return { type: 'external', idOrPath: href }
}

export function parseAssistantEventHref(href: string) {
  const parsed = parseAssistantHref(href)
  return parsed.type === 'event' ? parsed.idOrPath : null
}

export interface AssistantEventLinkCandidate {
  id?: string | null
  title?: string | null
}

function collectUniqueTitleMatches(events: AssistantEventLinkCandidate[]) {
  const byTitle = new Map<string, AssistantEventLinkCandidate[]>()
  for (const event of events) {
    const id = typeof event.id === 'string' ? event.id : ''
    const title = typeof event.title === 'string' ? event.title.trim() : ''
    if (!id || !title) continue
    const key = title.toLocaleLowerCase()
    const existing = byTitle.get(key)
    if (existing) existing.push(event)
    else byTitle.set(key, [event])
  }

  return [...byTitle.values()]
    .filter((entry) => entry.length === 1)
    .map(([event]) => event)
}

export function linkAssistantEventMentions(
  text: string,
  events: AssistantEventLinkCandidate[],
  options: { preferredEventId?: string | null } = {},
) {
  if (!text) return text

  const uniqueEvents = collectUniqueTitleMatches(events)
  const preferredEvent = options.preferredEventId
    ? events.find((event) => event.id === options.preferredEventId && typeof event.title === 'string' && event.title.trim().length > 0) ?? null
    : null
  if (uniqueEvents.length === 0 && !preferredEvent) return text

  const orderedEvents = [
    ...(preferredEvent ? [preferredEvent] : []),
    ...uniqueEvents.filter((event) => event.id !== preferredEvent?.id),
  ].sort((first, second) => (second.title?.length ?? 0) - (first.title?.length ?? 0))

  const segments: Array<{ type: 'text' | 'link'; value: string }> = []
  let lastIndex = 0
  EXISTING_MARKDOWN_LINK.lastIndex = 0
  for (let linkMatch = EXISTING_MARKDOWN_LINK.exec(text); linkMatch; linkMatch = EXISTING_MARKDOWN_LINK.exec(text)) {
    if (linkMatch.index > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, linkMatch.index) })
    }
    segments.push({ type: 'link', value: linkMatch[0] })
    lastIndex = EXISTING_MARKDOWN_LINK.lastIndex
  }
  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) })
  }

  return segments
    .map((segment) => {
      if (segment.type === 'link') return segment.value

      const matches: Array<{ start: number; end: number; matchedTitle: string; eventId: string }> = []
      for (const event of orderedEvents) {
        const id = typeof event.id === 'string' ? event.id : ''
        const title = typeof event.title === 'string' ? event.title.trim() : ''
        if (!id || !title) continue

        const matcher = new RegExp(`(^|[^A-Za-z0-9])(${escapeRegExp(title)})(?=$|[^A-Za-z0-9])`, 'gi')
        for (let match = matcher.exec(segment.value); match; match = matcher.exec(segment.value)) {
          const prefix = match[1] ?? ''
          const matchedTitle = match[2] ?? ''
          const start = match.index + prefix.length
          const end = start + matchedTitle.length
          const overlaps = matches.some((existing) => start < existing.end && end > existing.start)
          if (!overlaps) matches.push({ start, end, matchedTitle, eventId: id })
        }
      }

      if (matches.length === 0) return segment.value

      matches.sort((first, second) => first.start - second.start)
      let rebuilt = ''
      let cursor = 0
      for (const match of matches) {
        rebuilt += segment.value.slice(cursor, match.start)
        rebuilt += `[${match.matchedTitle}](${buildAssistantEventHref(match.eventId)})`
        cursor = match.end
      }
      rebuilt += segment.value.slice(cursor)
      return rebuilt
    })
    .join('')
}
