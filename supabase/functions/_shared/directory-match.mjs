// Shared "pick the best fuzzy-match row" logic for find_similar_places /
// find_similar_contacts RPC results. Centralizes the score threshold so
// every server-side entry point that wires these RPCs behaves consistently.
export function pickBestDirectoryMatch(rows, { threshold = 0.6, requireConfirmed = false } = {}) {
  if (!Array.isArray(rows)) return null
  const candidates = requireConfirmed ? rows.filter((row) => row?.confirmed === true) : rows
  const ranked = candidates
    .filter((row) => Number(row?.score ?? 0) >= threshold)
    .sort((a, b) => Number(b?.score ?? 0) - Number(a?.score ?? 0))
  return ranked[0] ?? null
}
