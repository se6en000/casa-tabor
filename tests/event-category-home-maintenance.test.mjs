import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: "Community / Church" replaced with "Home Maintenance" in the EVENT
// (not reminder) category picker -- user will never use Community/Church, and a
// real event (an AC repair appointment) had no matching category to pick from.
// Reuses the same category name/icon REMINDER_CATEGORIES already established
// ('Maintenance', Wrench) so the value is consistent across both pickers.
for (const path of [
  'src/components/calendar/living-flow/modals/CategoryPopover.tsx',
  'src/components/calendar/living-flow/components/LivingHeroTitleCard.tsx',
]) {
  test(`${path}: EVENT_CATEGORIES has Home Maintenance instead of Community / Church`, () => {
    const src = readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
    const eventCategoriesBlock = src.slice(
      src.indexOf('const EVENT_CATEGORIES'),
      src.indexOf('const REMINDER_CATEGORIES'),
    )
    assert.doesNotMatch(eventCategoriesBlock, /Community \/ Church/)
    assert.match(eventCategoriesBlock, /\{ name: 'Maintenance', label: 'Home Maintenance', icon: Wrench \}/)
  })
}
