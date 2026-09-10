/**
 * Strips the machine-readable Casa details block from an event description
 * before it's shown to a person.
 *
 * Bug this fixes: `buildGoogleEventDescription` (in
 * `supabase/functions/_shared/google-event-details-core.mjs`) appends a
 * `<!-- CASA-TABOR-DETAILS:START --> ... <!-- CASA-TABOR-DETAILS:END -->`
 * block to the Google-synced description so the round-trip sync can
 * find/replace its own content without clobbering what a person typed.
 * Nothing on the frontend stripped that block back out, so the raw HTML
 * comment markers and machine-generated lines (people, checklist, "Open in
 * Casa" link, etc.) rendered directly in the UI wherever event.description
 * was shown — e.g. the Happening Now card, the day view.
 */
const CASA_BLOCK_START = '<!-- CASA-TABOR-DETAILS:START -->'
const CASA_BLOCK_END = '<!-- CASA-TABOR-DETAILS:END -->'

/** Returns the human-written part of an event description, with the Casa details block removed. */
export function getEventDisplayDescription(description: string | null | undefined): string {
  const text = (description ?? '').trim()
  if (!text) return ''

  const start = text.indexOf(CASA_BLOCK_START)
  const end = text.indexOf(CASA_BLOCK_END)
  const withoutCasaBlock =
    start >= 0 && end > start ? `${text.slice(0, start)}${text.slice(end + CASA_BLOCK_END.length)}` : text

  return withoutCasaBlock.trim()
}
