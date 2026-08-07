/**
 * Pure conversion helper for the one-time migration of legacy
 * `event_enrichments.what_to_bring` string-array data into structured
 * `event_checklist_items` rows. Kept side-effect free so both the migration
 * script and its tests can exercise the same logic without a database.
 */

export interface ChecklistRowDraft {
  label: string
  checked: boolean
  sort_order: number
}

/**
 * Splits a legacy `what_to_bring` value into checklist row drafts.
 * Blank/whitespace-only lines are dropped. Always returns `checked: false`
 * since the old localStorage-based checked state was per-browser and can't
 * be reliably attributed to any one row.
 */
export function whatToBringToChecklistRows(whatToBring: string[] | null | undefined): ChecklistRowDraft[] {
  if (!Array.isArray(whatToBring)) return []
  let sortOrder = 0
  const rows: ChecklistRowDraft[] = []
  for (const raw of whatToBring) {
    const label = typeof raw === 'string' ? raw.trim() : ''
    if (!label) continue
    rows.push({ label, checked: false, sort_order: sortOrder })
    sortOrder += 1
  }
  return rows
}
