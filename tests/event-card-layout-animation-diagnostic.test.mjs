import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: live diagnostic, follow-up to hero-swipe-deck-drag-diagnostic.
// Disabling Hero's drag gesture measurably helped kiosk scroll smoothness
// ("50% better", user-confirmed) but didn't fully fix it. EventCard is the
// only component anywhere in the homepage's render tree using Framer
// Motion's `layout` prop -- verified by grepping every widget/card file the
// homepage renders: CompactReminderCard doesn't use framer-motion at all,
// and no other widget uses `layout` (several use plain motion.div/
// AnimatePresence for enter/exit fades, which don't need continuous
// position/size projection the way `layout` does). Since EventCard renders
// for every real event across Today's/Tomorrow's Schedule -- often several
// at once, all inside the new scrollable right rail -- this is the next
// well-reasoned candidate to test, not a design decision.
const src = readFileSync(new URL('../src/components/calendar/EventCard.tsx', import.meta.url), 'utf8')

test('EventCard has a DIAGNOSTIC_DISABLE_CARD_LAYOUT_ANIMATION flag, currently forcing layout tracking off', () => {
  assert.match(src, /const DIAGNOSTIC_DISABLE_CARD_LAYOUT_ANIMATION = true/)
})

test('both motion.div variants (past and upcoming) respect the diagnostic flag', () => {
  const matches = [...src.matchAll(/layout=\{!DIAGNOSTIC_DISABLE_CARD_LAYOUT_ANIMATION\}/g)]
  assert.equal(matches.length, 2, 'expected the flag applied to both EventCard motion.div variants')
  // No bare `layout` prop should remain unconditional.
  assert.doesNotMatch(src, /^\s*layout\s*$/m)
})
