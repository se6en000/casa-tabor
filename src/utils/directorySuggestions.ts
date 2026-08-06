/** Shared fuzzy candidate shape for directory (places/contacts) suggestion ranking. */
export interface DirectorySuggestionCandidate {
  id: string
  primary: string
  aliases?: string[]
  secondary?: string
}

function normalize(value: string): string {
  return value.trim().toLowerCase()
}

function score(candidate: DirectorySuggestionCandidate, needle: string): number | null {
  const name = normalize(candidate.primary)
  const aliases = (candidate.aliases ?? []).map(normalize)
  const secondary = normalize(candidate.secondary ?? '')

  if (name === needle || aliases.includes(needle)) return 0
  if (name.startsWith(needle) || aliases.some(a => a.startsWith(needle))) return 1
  if (name.includes(needle) || aliases.some(a => a.includes(needle))) return 2
  if (secondary && (secondary.includes(needle) || needle.includes(secondary))) return 3
  return null
}

/**
 * Ranks directory candidates (saved places or saved contacts) against a
 * free-typed query, matching on name, aliases, and a secondary field
 * (phone/address). Used to power lookup-first autocomplete so new entries
 * are checked against existing records before a duplicate is created.
 */
export function rankDirectorySuggestions<T extends DirectorySuggestionCandidate>(
  candidates: T[],
  query: string,
  limit = 6,
): T[] {
  const needle = normalize(query)
  if (!needle) {
    return [...candidates].sort((a, b) => a.primary.localeCompare(b.primary)).slice(0, limit)
  }
  return candidates
    .map(candidate => ({ candidate, matchScore: score(candidate, needle) }))
    .filter((entry): entry is { candidate: T; matchScore: number } => entry.matchScore !== null)
    .sort((a, b) => a.matchScore - b.matchScore || a.candidate.primary.localeCompare(b.candidate.primary))
    .slice(0, limit)
    .map(entry => entry.candidate)
}

/**
 * Finds a candidate whose name or an alias exactly equals the query. Used to
 * catch the case where a user types an "add new" entry that actually already
 * exists verbatim, so we can link to it instead of creating a duplicate.
 */
export function findExactDirectoryMatch<T extends DirectorySuggestionCandidate>(
  candidates: T[],
  query: string,
): T | null {
  const needle = normalize(query)
  if (!needle) return null
  return candidates.find(candidate =>
    normalize(candidate.primary) === needle || (candidate.aliases ?? []).some(a => normalize(a) === needle),
  ) ?? null
}

export type DirectoryPlaceSelection =
  | { mode: 'existing'; placeId: string }
  | { mode: 'new'; input: { name: string; address?: string | null; city?: string | null; state?: string | null; zip?: string | null; lat?: number | null; lng?: number | null } }
  | null

export type DirectoryPlaceSaveResult =
  | { action: 'none' }
  | { action: 'link'; placeId: string }
  | { action: 'create-and-link'; createInput: NonNullable<Extract<DirectoryPlaceSelection, { mode: 'new' }>>['input'] }

/**
 * Decides whether saving a contact/event's place selection should link to an
 * existing place or create a new one — and catches the case where an
 * "add new" entry's name exactly matches an existing place, linking to that
 * instead of creating a duplicate.
 */
export function resolveDirectoryPlaceSave<T extends DirectorySuggestionCandidate>(
  selection: DirectoryPlaceSelection,
  existingPlaces: T[],
): DirectoryPlaceSaveResult {
  if (!selection) return { action: 'none' }
  if (selection.mode === 'existing') return { action: 'link', placeId: selection.placeId }
  const exact = findExactDirectoryMatch(existingPlaces, selection.input.name)
  if (exact) return { action: 'link', placeId: exact.id }
  return { action: 'create-and-link', createInput: selection.input }
}
