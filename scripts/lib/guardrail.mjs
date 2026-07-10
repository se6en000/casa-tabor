// Pure guardrail comparison logic, split out from scripts/style-audit.mjs so it
// can be unit tested (tests/style-guardrail.test.mjs) without touching the
// filesystem or process.exitCode.

/**
 * Computes per-category count/baseline/delta rows.
 * @param {{ id: string, label: string }[]} categories
 * @param {Record<string, number>} counts current counts keyed by category id
 * @param {Record<string, number> | undefined | null} baselineCategories committed baseline counts keyed by category id
 * @returns {{ id: string, label: string, count: number, base: number | undefined, delta: number | null }[]}
 */
export function computeRows(categories, counts, baselineCategories) {
  return categories.map((cat) => {
    const count = counts[cat.id] ?? 0
    const base = baselineCategories?.[cat.id]
    const delta = typeof base === 'number' ? count - base : null
    return { id: cat.id, label: cat.label, count, base, delta }
  })
}

/**
 * A category "regresses" only when it has a numeric baseline AND its current
 * count is strictly greater than that baseline. Categories with no baseline
 * (new categories added later) never fail the check on their own — this is a
 * budget/guardrail, not a zero-tolerance linter, and must never fail on
 * PRE-EXISTING debt that hasn't grown.
 * @param {{ id: string, label: string, count: number, base?: number, delta: number | null }[]} rows
 */
export function findRegressions(rows) {
  return rows.filter((r) => typeof r.base === 'number' && typeof r.delta === 'number' && r.delta > 0)
}
