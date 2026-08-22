export function normalizePossessiveSuffixCasing(title: string): string {
  return title.replace(/([a-z])(['’])S\b/g, '$1$2s')
}

export function cleanEventTitle(title: string): string {
  return normalizePossessiveSuffixCasing(title)
}

/**
 * Compresses verbose boilerplate in event titles for tight visual contexts
 * (Month View pills, compact Week View blocks) without losing meaning or names.
 */
export function formatGlanceTitle(title: string): string {
  if (!title) return ''
  let cleaned = cleanEventTitle(title)
  cleaned = cleaned
    .replace(/^Drop off\s+([A-Za-z0-9\s]+?)\s+@\s+/i, '$1 @ ')
    .replace(/^Pick up\s+([A-Za-z0-9\s]+?)\s+@\s+/i, 'Pick up $1 @ ')
    .replace(/\bAppointment for\b/gi, '')
    .replace(/\bAppointment\b/gi, 'Apt')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned
}

/**
 * Detects birthday events for festive card theming. Trusts the enrichment
 * category first (source of truth going forward); falls back to a title
 * keyword match so existing events created before category enrichment still
 * get the birthday treatment.
 */
export function isBirthdayEvent(event: { title?: string | null; enrichment?: { category?: string | null } | null }): boolean {
  if (event.enrichment?.category === 'birthday') return true
  return /\bbirthdays?\b/i.test(event.title ?? '')
}
