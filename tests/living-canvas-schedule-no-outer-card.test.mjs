import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

// 2026-09-24 follow-up: the outer "Today's Schedule" / "Tomorrow's Schedule" white
// card box looked like cards-within-a-card once each event became its own real
// EventCard. The section header now floats directly on the page; only the event
// cards (and the collapsed content) carry their own card chrome.
for (const [label, path] of [
  ["TodaysScheduleWidget", 'src/components/canvas/widgets/TodaysScheduleWidget.tsx'],
  ["TomorrowPreviewWidget", 'src/components/canvas/widgets/TomorrowPreviewWidget.tsx'],
]) {
  test(`${label} no longer wraps its header + cards in the structural TIER_CARD box`, () => {
    const src = read(path)
    assert.doesNotMatch(src, /TIER_CARD/, `${label} should no longer reference TIER_CARD at all`)
    assert.doesNotMatch(src, /rounded-container/, `${label}'s outer element should drop the card-container radius`)
    // The header row itself (icon chip, title, badge) should still render.
    assert.match(src, /rounded-lg flex items-center justify-center shrink-0/)
    assert.match(src, /<EventCard/)
  })
}
