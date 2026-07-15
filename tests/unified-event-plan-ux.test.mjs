import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transportation = readFileSync(resolve('src/components/calendar/EventTransportationSection.tsx'), 'utf8')
const placeEditor = readFileSync(resolve('src/components/calendar/InlinePlaceEditor.tsx'), 'utf8')
const smartPlace = readFileSync(resolve('src/components/calendar/SmartPlaceInput.tsx'), 'utf8')
const passengerChips = readFileSync(resolve('src/components/calendar/PassengerChipSelector.tsx'), 'utf8')
const detail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')

test('explicit transportation uses the navy The Plan command-center presentation', () => {
  assert.match(transportation, /aria-label="The Plan"/)
  assert.match(transportation, /bg-casa-navy/)
  assert.match(transportation, />The Plan</)
  assert.match(transportation, /Tap any place or driver for a quick change/)
  assert.match(transportation, /Edit entire plan/)
})

test('transportation passengers use touch chips and synchronize with event attendees', () => {
  assert.match(transportation, /<PassengerChipSelector/)
  assert.match(passengerChips, /<Chip/)
  assert.match(passengerChips, /selected=\{selected\}/)
  assert.match(passengerChips, /min-h-control-lg/)
  assert.match(passengerChips, /backgroundColor: member\.color_hex/)
  assert.match(transportation, /\.from\('event_members'\)\.upsert/)
  assert.match(detail, /syncTransportationAttendees/)
})

test('The Plan supports quick driver reassignment including external drivers and cascading', () => {
  assert.match(transportation, /function QuickDriverPicker/)
  assert.match(transportation, /Someone else/)
  assert.match(transportation, /Use for remaining legs/)
  assert.match(transportation, /updateTransportationDriver/)
  assert.match(transportation, /backgroundColor: activeDriver\?\.color_hex/)
  assert.match(transportation, /backgroundColor: driver\.color_hex/)
})

test('driving plan removal is truthful, editor-only, and confirmed', () => {
  const summary = transportation.slice(
    transportation.indexOf('<section aria-label="The Plan">'),
    transportation.indexOf('<Sheet'),
  )
  assert.doesNotMatch(summary, /<Button[\s\S]{0,200}>[\s\S]{0,80}No driving logistics/)
  assert.doesNotMatch(summary, /onChange\(null\)/)
  assert.match(transportation, />\s*Remove driving plan\s*</)
  assert.match(transportation, /<ConfirmationDialog/)
  assert.match(transportation, /title="Remove driving plan\?"/)
  assert.match(transportation, /onConfirm=\{\(\) => \{[\s\S]*?onChange\(null\)/)
})

test('event detail header uses editorial navy crown with compact avatars', () => {
  assert.match(detail, /function CategoryPicker/)
  assert.match(detail, /aria-label=\{`Category:.*Tap to change`\}/)
  assert.match(detail, /aria-expanded=\{open\}/)
  assert.match(detail, /lockedCategory: cat/)
  assert.match(detail, /import \{ cleanEventTitle, isBirthdayEvent \} from '\.\.\/\.\.\/utils\/eventTitle'/)
  assert.match(detail, /const displayTitle = cleanedTitle \|\| rawTitle \|\|/)
  // navy crown background
  assert.match(detail, /background.*S\.navy/)
  // compact avatar circles in eyebrow row
  assert.match(detail, /avatarMembers\.map/)
  assert.match(detail, /avatarOverflow/)
  // title-first hero and meta line with category beneath title
  assert.match(detail, /Title hero/)
  assert.match(detail, /text-display-md/)
  assert.match(detail, /Meta line: category \+ date \+ duration/)
  assert.match(detail, /<CategoryPicker eventId=\{event\.id\} category=\{category\} accent=\{accent\} dark=\{!isBirthday\} \/>/)
  // adaptive utility row: travel uses location-first chip
  assert.match(detail, /planKind === 'travel'/)
  assert.match(detail, /event\.location_name \|\| event\.address \|\| 'Location not set'/)
  // attendee editing is now intentional (toggle) instead of always-on divider row
  assert.match(detail, /Edit attendees/)
  assert.match(detail, /rosterOpen \? 'Done editing' : 'Edit attendees'/)
  assert.match(detail, /showAttendees && rosterOpen[\s\S]{0,300}MemberEditor/)
  // close button remains in the top utility rail
  assert.match(detail, /aria-label="Close event details"/)
})

test('month view uses shared cleanEventTitle helper for non-holiday non-reminder labels', () => {
  const month = readFileSync(resolve('src/components/calendar/MonthView.tsx'), 'utf8')
  assert.match(month, /import \{ cleanEventTitle \} from '\.\.\/\.\.\/utils\/eventTitle'/)
  assert.match(month, /cleanEventTitle\(event\.title\)/)
  assert.doesNotMatch(month, /event\.title\.includes\(' \| '\) \? event\.title\.split/)
})

test('route stops and event Where reuse confirmed inline saved-place editing', () => {
  assert.match(transportation, /<InlinePlaceEditor/)
  assert.match(detail, /<InlinePlaceEditor/)
  assert.match(smartPlace, /Saved/)
  assert.match(smartPlace, /Google/)
  assert.match(placeEditor, /Save place/)
  assert.match(placeEditor, /requireAddress/)
  assert.match(smartPlace, /onPointerDown=\{\(event\) => event\.preventDefault\(\)\}/)
  assert.match(placeEditor, /Apply/)
  assert.match(placeEditor, /Cancel/)
})

test('event location quick edit persists location fields and invalidates stale coordinates', () => {
  assert.match(detail, /\.from\('events'\)[\s\S]*?location_name: normalizedName,[\s\S]*?address: normalizedAddress,[\s\S]*?lat: null,[\s\S]*?lng: null/)
  assert.match(detail, /onLocationChanged\(next\)/)
  assert.match(detail, /invalidateQueries\(\{ queryKey: \['events'\] \}\)/)
  assert.match(detail, /updateTransportationEventPlace/)
})
