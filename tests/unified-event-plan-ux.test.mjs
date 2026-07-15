import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transportation = readFileSync(resolve('src/components/calendar/EventTransportationSection.tsx'), 'utf8')
const placeEditor = readFileSync(resolve('src/components/calendar/InlinePlaceEditor.tsx'), 'utf8')
const smartPlace = readFileSync(resolve('src/components/calendar/SmartPlaceInput.tsx'), 'utf8')
const passengerChips = readFileSync(resolve('src/components/calendar/PassengerChipSelector.tsx'), 'utf8')
const detail = readFileSync(resolve('src/components/calendar/EventDetailPanel.tsx'), 'utf8')
const addressReview = readFileSync(resolve('src/components/calendar/AddressReviewSummary.tsx'), 'utf8')
const categoryPicker = detail.slice(detail.indexOf('function CategoryPicker'), detail.indexOf('/* ── Header'))
const eventEdit = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')
const eventQuery = readFileSync(resolve('src/hooks/useCalendarEvents.ts'), 'utf8')
const enrichFunction = readFileSync(resolve('supabase/functions/enrich-event/index.ts'), 'utf8')
const categoryLockMigration = readFileSync(resolve('supabase/migrations/20260715122500_event_enrichment_category_lock.sql'), 'utf8')

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
  assert.match(detail, /category_locked: true/)
  assert.match(detail, /import \{ cleanEventTitle, isBirthdayEvent \} from '\.\.\/\.\.\/utils\/eventTitle'/)
  assert.match(detail, /const displayTitle = cleanedTitle \|\| rawTitle \|\|/)
  // navy crown background
  assert.match(detail, /background.*S\.navy/)
  // compact avatar circles in eyebrow row
  assert.match(detail, /avatarMembers\.map/)
  assert.match(detail, /avatarOverflow/)
  // title-first hero and meta line with category beneath title
  assert.match(detail, /Title hero/)
  assert.match(detail, /event-command-center-title/)
  assert.match(detail, /casa-heading-on-dark/)
  assert.match(detail, /Meta line: category \+ date \+ duration/)
  assert.match(detail, /<CategoryPicker eventId=\{event\.id\} category=\{category\} accent=\{accent\} dark=\{!isBirthday\} \/>/)
  // adaptive utility row: travel uses location-first chip
  assert.match(detail, /planKind === 'travel'/)
  assert.match(detail, /event\.location_name \|\| event\.address \|\| 'Location not set'/)
  // attendee editing is now intentional (toggle) instead of always-on divider row
  assert.match(detail, /Edit attendees/)
  assert.match(detail, /rosterOpen \? 'Done editing' : editPeopleLabel/)
  assert.match(detail, /hasPeople && rosterOpen[\s\S]{0,300}MemberEditor/)
  // close button remains in the top utility rail
  assert.match(detail, /aria-label="Close event details"/)
})

test('event detail drag cap and crown share one theme-aware treatment', () => {
  assert.match(detail, /function eventCrownStyle\(event: EventWithDetails, region: 'cap' \| 'body'\): React\.CSSProperties/)
  assert.match(detail, /eventCrownStyle\(event, 'cap'\)/)
  assert.match(detail, /eventCrownStyle\(event, 'body'\)/)
  assert.match(detail, /backgroundColor: 'var\(--color-casa-navy\)'/)
  assert.match(detail, /var\(--color-casa-accent-subtle\), transparent 72%/)
  assert.match(detail, /const glowOrigin = region === 'cap' \? '90% 100%' : '90% 0%'/)
  assert.match(detail, /className="relative h-control-sm flex-shrink-0 px-3"/)
  assert.match(detail, /className="absolute inset-x-0 top-0 z-10 mx-auto block h-control w-\[86px\]/)
  assert.match(detail, /h-\[5px\] w-control-sm rounded-full/)
  assert.match(detail, /aria-label="Drag down to dismiss panel"/)
  assert.match(detail, /var\(--color-casa-on-dark\) 48%, transparent/)
  assert.match(detail, /var\(--color-casa-navy\) 38%, transparent/)
  assert.doesNotMatch(detail, /borderBottom: '1px solid color-mix/)
  assert.doesNotMatch(detail, /boxShadow: 'inset 0 -1px 0 color-mix/)
  assert.doesNotMatch(detail, /background: '#(?:1b2a4a|1B2A4A)'/)
})

test('reminder details identify their type and allow assigned people editing', () => {
  assert.match(detail, /event\.event_type === 'reminder' \? 'Reminder' : 'Event'/)
  assert.match(detail, /<Bell size=\{12\} aria-hidden="true" \/>[\s\S]{0,80}Reminder/)
  assert.match(detail, /const hasPeople = attendeeCount > 0/)
  assert.match(detail, /reminder \? `\$\{attendeeCount\} assigned` : `\$\{attendeeCount\} attending`/)
  assert.match(detail, /reminder \? 'Edit people' : 'Edit attendees'/)
  assert.match(detail, /reminder \? 'Assigned people' : 'Attendees'/)
  assert.match(detail, /hasPeople && rosterOpen[\s\S]{0,300}<MemberEditor/)
  assert.doesNotMatch(detail, /const showAttendees = !reminder/)
})

test('category popover paints above the later people utility row', () => {
  assert.match(detail, /Meta line: category \+ date \+ duration[\s\S]{0,120}<div className="relative z-10/)
  assert.match(detail, /\{\(hasPeople \|\| \(!reminder && planKind === 'travel'\)\) && \([\s\S]{0,100}<div className="relative mt-3/)
  assert.doesNotMatch(detail, /<div className="relative z-10 mt-3 flex items-center gap-2">/)
  assert.doesNotMatch(categoryPicker, /initial=\{\{ opacity:/)
})

test('manual category changes persist, stay locked, and surface save failures', () => {
  assert.match(categoryLockMigration, /category_locked boolean not null default false/)
  assert.match(eventQuery, /category_locked,/)
  assert.match(detail, /fields: \{ category: cat, category_locked: true \}/)
  assert.doesNotMatch(detail, /fields: \{ category: cat, lockedCategory:/)
  assert.match(detail, /setSelectedCategory\(cat\)/)
  assert.match(detail, /role="alert"/)
  assert.match(detail, /Could not save category\. Please try again\./)
  assert.match(eventEdit, /setCategoryLocked\(Boolean\(activeEnr\?\.category_locked\)\)/)
  assert.match(eventEdit, /patch\.category_locked = categoryLocked/)
  assert.match(enrichFunction, /event_enrichments\(source_hash, category, category_locked,/)
  assert.match(enrichFunction, /existingEnrichment\?\.category_locked === true/)
  assert.match(enrichFunction, /category_locked: Boolean\(effectiveLockedCategory\)/)
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

test('address review means explicit human confirmation rather than automatic route confidence', () => {
  assert.match(detail, /const addressReviewed = verifiedOverride === true/)
  assert.doesNotMatch(detail, /verifyFromTrustedSource/)
  assert.doesNotMatch(detail, /findSavedPlace\(savedPlaces.*event\.location_name/)
  assert.match(detail, /onConfirmAddress=\{\(\) => setVerifiedOverride\(true\)\}/)
  assert.match(detail, /onSetVerifiedOverride\(false\)/)
  assert.match(detail, /locationSignature\(event\)/)
})

test('address review summary is neutral, explicit, actionable, and does not truncate the address', () => {
  assert.match(addressReview, /bg-casa-surface/)
  assert.match(addressReview, /border-casa-border/)
  assert.match(addressReview, /Address reviewed/)
  assert.match(addressReview, /Needs review/)
  assert.match(addressReview, /Address missing/)
  assert.match(addressReview, /Checking review/)
  assert.match(addressReview, /Confirm address/)
  assert.match(addressReview, /\{missing \? 'Add address' : 'Edit'\}/)
  assert.match(addressReview, /role="alert"/)
  assert.match(addressReview, />\s*Retry\s*</)
  assert.match(addressReview, /leading-snug text-casa-muted/)
  assert.doesNotMatch(addressReview, /truncate/)
  assert.doesNotMatch(addressReview, /bg-casa-success-soft/)
  assert.doesNotMatch(addressReview, /bg-casa-warning\/15.*<Card/)
  assert.match(detail, /const showAddressSummary = !reminder && \(planKind === 'travel' \|\| Boolean\(event\.location_name \|\| event\.address\)\)/)
  assert.match(detail, /overridesHydratedEventId !== event\.id/)
})

test('route and weather readiness no longer depend on human address review', () => {
  assert.match(detail, /enabled: !reminder && showSuggestedTravel && Boolean\(commuteDestination\)/)
  assert.match(detail, /enabled: !reminder && showLocation && Boolean\(commuteDestination\)/)
  assert.match(detail, /const routeReady = commuteQuery\.data\?\.found === true/)
  assert.match(detail, /eta: routeReady \? commuteQuery\.data : null/)
  assert.match(detail, /verified: routeReady/)
  assert.doesNotMatch(detail, /showSuggestedTravel && verified/)
})

test('map area reports technical location state without duplicating review controls', () => {
  assert.match(detail, /<AddressTechnicalStatusChip status=\{technicalStatus\} \/>/)
  assert.match(addressReview, /Checking location/)
  assert.match(addressReview, /Location ready/)
  assert.match(addressReview, /Location unavailable/)
  assert.doesNotMatch(detail, /Yes, confirm/)
  assert.doesNotMatch(detail, /Is this the right place\?/)
  assert.doesNotMatch(detail, /Address confirmed/)
})
