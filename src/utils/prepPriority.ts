import type { ChipTone } from '../design-system/variants.mjs'

export interface PrepPriorityVisual {
  /** Left-edge border class reinforcing priority — never the only signal (paired with `chip` text). */
  borderClass: string
  /** Visible text label for priority 2-3 only; priority 1 (standard) shows no chip to avoid clutter. */
  chip: { label: string; tone: ChipTone } | null
}

/**
 * Priority (1=low, 2=medium, 3=high) currently only drove sort order with zero visual
 * distinction on cards. This gives priority 3 a clear "Critical" signal and priority 2
 * an "Important" signal, backed by both a border weight/color AND a text label (never
 * color alone, per design-system rules).
 */
export function priorityVisual(priority: number | null | undefined): PrepPriorityVisual {
  if (priority != null && priority >= 3) {
    return { borderClass: 'border-l-4 border-l-casa-error', chip: { label: 'Critical', tone: 'danger' } }
  }
  if (priority != null && priority === 2) {
    return { borderClass: 'border-l-4 border-l-casa-warning', chip: { label: 'Important', tone: 'warning' } }
  }
  return { borderClass: 'border-l-4 border-l-transparent', chip: null }
}
