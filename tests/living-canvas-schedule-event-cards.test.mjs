import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')

const todaysSchedule = read('src/components/canvas/widgets/TodaysScheduleWidget.tsx')
const tomorrowPreview = read('src/components/canvas/widgets/TomorrowPreviewWidget.tsx')
const calmKioskView = read('src/components/canvas/CalmKioskView.tsx')

// living_canvas is the default experience mode (appStore.ts) and what the kiosk
// actually runs — these two widgets, not HomePage.tsx's classic timeline, are what
// the household sees day to day. Both render real events via a hand-rolled dot-rail
// row (driver detection via a title regex, not the real responsibility system). This
// switches them to the same shared EventCard the calendar's stacking view uses.
test('TodaysScheduleWidget renders real events via the shared EventCard', () => {
  assert.match(todaysSchedule, /import EventCard from ['"]\.\.\/\.\.\/calendar\/EventCard['"]/)
  assert.match(todaysSchedule, /<EventCard/)
  assert.doesNotMatch(todaysSchedule, /toLowerCase\(\)\.includes\(m\.family_member\.name\.toLowerCase\(\) \+ ' drives'\)/,
    'the old title-regex driver guess should be gone, superseded by EventCard\'s real responsibility logic')
})

test('TomorrowPreviewWidget renders real events via the shared EventCard', () => {
  assert.match(tomorrowPreview, /import EventCard from ['"]\.\.\/\.\.\/calendar\/EventCard['"]/)
  assert.match(tomorrowPreview, /<EventCard/)
  assert.doesNotMatch(tomorrowPreview, /toLowerCase\(\)\.includes\(m\.family_member\.name\.toLowerCase\(\) \+ ' drives'\)/)
})

test('both widgets accept household and can be told which event is highlighted', () => {
  for (const src of [todaysSchedule, tomorrowPreview]) {
    assert.match(src, /household:\s*FamilyMember\[\]/)
    assert.match(src, /activeEventId:\s*string \| null/)
  }
})

test('CalmKioskView passes real family data and the sidecar-open event id to both widgets', () => {
  assert.match(calmKioskView, /familyMembers\}/, 'household should come from the same familyMembers the presenter already loads, not a new fetch')
  assert.match(calmKioskView, /const activeEventId = aiDrawerOpen && sidecarTab === 'event' \? selectedSidecarEventId : null/,
    'should mirror StackedView\'s own activeEventId derivation exactly')
  const todaysWidgetCall = calmKioskView.slice(calmKioskView.indexOf('<TodaysScheduleWidget'), calmKioskView.indexOf('<TodaysScheduleWidget') + 400)
  const tomorrowWidgetCall = calmKioskView.slice(calmKioskView.indexOf('<TomorrowPreviewWidget'), calmKioskView.indexOf('<TomorrowPreviewWidget') + 400)
  assert.match(todaysWidgetCall, /household=\{familyMembers\}/)
  assert.match(todaysWidgetCall, /activeEventId=\{activeEventId\}/)
  assert.match(tomorrowWidgetCall, /household=\{familyMembers\}/)
  assert.match(tomorrowWidgetCall, /activeEventId=\{activeEventId\}/)
})
