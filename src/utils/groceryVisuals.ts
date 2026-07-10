// Pure, dependency-free style-debt helpers for the Grocery page's design-system
// migration (Phase 3). Extracted so the tone mappings are covered directly by
// node:test (see tests/grocery-visuals.test.mjs) and so GroceryPage.tsx never
// reaches for raw hex literals to color-code categories or pantry depletion
// urgency — every tone here resolves to a canonical casa-* token class
// (see src/design-system/tokens.mjs), so both the light and midnight themes
// stay correct automatically.
import type { GroceryCategoryKey } from './groceryCategorization'

/** Shared semantic tone vocabulary — mirrors Chip's CHIP_TONES so category and
 * urgency badges stay visually consistent with the rest of the design system. */
export type GrocerySemanticTone = 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'neutral'

/** bg/fg pair for a square icon badge (e.g. the category section icon chip). */
const TONE_ICON_BADGE_CLASS: Record<GrocerySemanticTone, string> = {
  success: 'bg-casa-success-soft text-casa-success-strong',
  danger: 'bg-casa-error/10 text-casa-error',
  warning: 'bg-casa-warning/15 text-casa-warning',
  info: 'bg-casa-info-soft text-casa-info-strong',
  accent: 'bg-casa-accent-soft text-casa-top-pick-band',
  neutral: 'bg-casa-bg-2 text-casa-text-secondary',
}

/** Returns the token-backed bg/fg class pair for a category icon badge's tone. */
export function categoryIconBadgeClassName(tone: GrocerySemanticTone): string {
  return TONE_ICON_BADGE_CLASS[tone] ?? TONE_ICON_BADGE_CLASS.neutral
}

/** Category -> semantic tone. Multiple categories intentionally share a tone —
 * the goal is a consistent, theme-safe palette, not a unique hue per category. */
export const CATEGORY_TONE: Record<GroceryCategoryKey, GrocerySemanticTone> = {
  produce: 'success',
  dairy: 'danger',
  meat: 'warning',
  bakery: 'accent',
  frozen: 'info',
  pantry: 'warning',
  beverages: 'info',
  snacks: 'danger',
  deli: 'accent',
  household: 'info',
  'personal-care': 'accent',
  baby: 'warning',
  pet: 'success',
  other: 'neutral',
}

/** Looks up a category's semantic tone, defaulting to neutral for unknown keys. */
export function getCategoryTone(categoryKey: string): GrocerySemanticTone {
  return (CATEGORY_TONE as Record<string, GrocerySemanticTone>)[categoryKey] ?? 'neutral'
}

export type GroceryUrgencyTone = 'now' | 'soon' | 'later'

export interface DepletionVisual {
  dueLabel: string
  tone: GroceryUrgencyTone
}

/** Pantry depletion urgency -> { label, tone }. Pure so the day-bucket cutoffs
 * (today, within 3 days, later) stay unit-testable without rendering anything. */
export function getDepletionVisual(daysUntil: number): DepletionVisual {
  if (daysUntil <= 0) {
    return { dueLabel: 'Due now', tone: 'now' }
  }
  if (daysUntil <= 3) {
    return { dueLabel: `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, tone: 'soon' }
  }
  return { dueLabel: `In ${daysUntil} day${daysUntil === 1 ? '' : 's'}`, tone: 'later' }
}

/** currentColor-driven text class for the urgency dot/icon (paired with fill="currentColor"). */
const URGENCY_DOT_CLASS: Record<GroceryUrgencyTone, string> = {
  now: 'text-casa-warning',
  soon: 'text-casa-gold',
  later: 'text-casa-success',
}

/** Solid background class for the cadence meter bar fill. */
const URGENCY_METER_CLASS: Record<GroceryUrgencyTone, string> = {
  now: 'bg-casa-warning',
  soon: 'bg-casa-gold',
  later: 'bg-casa-success',
}

/** bg/fg pair for the "Due now / In N days" pill. */
const URGENCY_TAG_CLASS: Record<GroceryUrgencyTone, string> = {
  now: 'bg-casa-warning/15 text-casa-warning',
  soon: 'bg-casa-accent-soft text-casa-top-pick-band',
  later: 'bg-casa-success-soft text-casa-success-strong',
}

export function urgencyDotClassName(tone: GroceryUrgencyTone): string {
  return URGENCY_DOT_CLASS[tone] ?? URGENCY_DOT_CLASS.later
}

export function urgencyMeterClassName(tone: GroceryUrgencyTone): string {
  return URGENCY_METER_CLASS[tone] ?? URGENCY_METER_CLASS.later
}

export function urgencyTagClassName(tone: GroceryUrgencyTone): string {
  return URGENCY_TAG_CLASS[tone] ?? URGENCY_TAG_CLASS.later
}
