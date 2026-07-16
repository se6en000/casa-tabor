export function normalizePossessiveSuffixCasing(title: string): string {
  return title.replace(/([a-z])(['’])S\b/g, '$1$2s')
}

export function cleanEventTitle(title: string): string {
  return normalizePossessiveSuffixCasing(title)
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
