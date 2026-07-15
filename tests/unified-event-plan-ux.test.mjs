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

test('event detail header uses two-column layout with attendees right and no dead whitespace', () => {
  assert.match(detail, /function CategoryPicker/)
  assert.match(detail, /aria-label=\{`Category:.*Tap to change`\}/)
  assert.match(detail, /aria-expanded=\{open\}/)
  assert.match(detail, /lockedCategory: cat/)
  assert.match(detail, /lg:flex-row lg:items-start/)
  assert.match(detail, /lg:w-44 lg:shrink-0/)
  assert.match(detail, /absolute top-4 right-4 z-10/)
  assert.doesNotMatch(detail, /function PanelHeader[\s\S]{0,3000}justify-between/)
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
