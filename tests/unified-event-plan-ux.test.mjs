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
const eventLocation = readFileSync(resolve('src/lib/eventLocation.ts'), 'utf8')
const transportationLib = readFileSync(resolve('src/lib/eventTransportation.ts'), 'utf8')
const recurrenceScope = readFileSync(resolve('src/components/calendar/RecurrenceScopeDialog.tsx'), 'utf8')
const recurrenceScopePresentation = readFileSync(resolve('src/lib/recurrenceScopePresentation.ts'), 'utf8')
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

test('transportation mutations use one awaited durable writer without stale plan overwrites', () => {
  assert.match(detail, /const persistTransportationPlan = useCallback\(async/)
  assert.match(detail, /transportation_plan: nextPlan/)
  assert.match(detail, /onSetTransportationPlan=\{persistTransportationPlan\}/)
  assert.doesNotMatch(detail, /two_driver_confirmed: twoDriverConfirmed,\s+transportation_plan: transportationPlan,/)
  assert.match(transportation, /await onChange\(draft\)/)
  assert.match(transportation, /await onChange\(nextPlan\)/)
  assert.match(transportation, /void onChange\(null\)\.then/)
  assert.match(transportation, /savingQuickChange/)
  assert.match(transportation, /Saving trip change…/)
  assert.match(transportation, /transportationPlaceMatchesEvent\(eventPlace, event\)/)
  assert.match(transportationLib, /export function transportationPlaceMatchesEvent/)
  assert.match(transportation, /lat: place\.lat \?\? null/)
  assert.match(transportation, /lng: place\.lng \?\? null/)
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
  assert.match(detail, /<CategoryPicker event=\{event\} category=\{category\} accent=\{accent\} dark=\{!isBirthday\} onQuickAction=\{onQuickAction\} \/>/)
  // crown owns the location, full address, and review state
  assert.match(detail, /planKind === 'travel'/)
  assert.match(detail, /<AddressReviewSummary/)
  assert.match(addressReview, /\{normalizedAddress && normalizedAddress !== normalizedName/)
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
  assert.match(detail, /\{\(hasPeople \|\| showAddressSummary\) && \([\s\S]{0,100}<div className="relative mt-3/)
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

test('route stops and crown address editor reuse saved and Google place entry', () => {
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
  assert.match(eventLocation, /\.from\('events'\)\.update\(payload\)/)
  assert.match(eventLocation, /lat: trusted \? \(place\.lat \?\? null\) : null/)
  assert.match(eventLocation, /lng: trusted \? \(place\.lng \?\? null\) : null/)
  assert.match(detail, /invalidateQueries\(\{ queryKey: \['events'\] \}\)/)
  assert.match(eventLocation, /updateTransportationEventPlace\(currentPlan, nextPlace\)/)
})

test('address review means explicit human confirmation rather than automatic route confidence', () => {
  assert.match(detail, /const addressReviewed = verifiedOverride === true/)
  assert.doesNotMatch(detail, /verifyFromTrustedSource/)
  assert.doesNotMatch(detail, /findSavedPlace\(savedPlaces.*event\.location_name/)
  assert.match(detail, /onConfirmAddress=\{\(\) => setVerifiedOverride\(true\)\}/)
  assert.match(eventLocation, /verified: false/)
  assert.match(eventLocation, /place\.source === 'google' \|\| place\.source === 'saved'/)
  assert.match(detail, /locationSignature\(event\)/)
})

test('address review summary lives in the crown with a full address and truthful actions', () => {
  assert.match(addressReview, /rgba\(255,255,255,0\.10\)/)
  assert.doesNotMatch(addressReview, />Confirmed</)
  assert.doesNotMatch(addressReview, /Needs review/)
  assert.match(addressReview, /Address missing/)
  assert.match(addressReview, /Checking review/)
  assert.match(addressReview, /Confirm address/)
  assert.match(addressReview, /Change address/)
  assert.match(addressReview, /Add location/)
  assert.match(addressReview, /grid-cols-1 items-start gap-x-3 gap-y-1 sm:grid-cols-\[minmax\(0,1fr\)_auto\]/)
  assert.match(addressReview, /peopleActionLabel/)
  assert.match(addressReview, /onPeopleAction/)
  assert.match(addressReview, /role="alert"/)
  assert.match(addressReview, />\s*Retry\s*</)
  assert.match(addressReview, /min-w-0 flex-1 text-body-sm leading-relaxed/)
  assert.doesNotMatch(addressReview, /truncate/)
  assert.doesNotMatch(addressReview, /<Card/)
  assert.match(detail, /peopleActionLabel=\{hasPeople \? \(rosterOpen \? 'Done editing' : editPeopleLabel\) : undefined\}/)
  assert.doesNotMatch(detail, /showAddressSummary && hasPeople && \(/)
  assert.match(detail, /const showAddressSummary = !reminder && \(planKind === 'travel' \|\| hostedAtHome \|\| Boolean\(event\.location_name \|\| event\.address\)\)/)
  assert.match(detail, /overridesHydratedEventId !== event\.id/)
})

test('trusted selections preserve provenance and coordinates while typing clears trust', () => {
  assert.match(smartPlace, /source: suggestion\.source/)
  assert.match(smartPlace, /placeId: suggestion\.placeId/)
  assert.match(smartPlace, /lat: suggestion\.lat/)
  assert.match(smartPlace, /lng: suggestion\.lng/)
  assert.match(smartPlace, /source: 'manual'[\s\S]{0,120}placeId: undefined,[\s\S]{0,80}lat: null,[\s\S]{0,80}lng: null/)
  assert.match(placeEditor, /setDraft\(place\)/)
})

test('recurring quick address saves ask scope and target the selected range', () => {
  assert.match(detail, /<RecurrenceScopeDialog/)
  assert.match(recurrenceScope, /<Radio/)
  assert.match(recurrenceScopePresentation, /Only this event/)
  assert.match(recurrenceScopePresentation, /This and following events/)
  assert.match(recurrenceScopePresentation, /Entire series/)
  assert.match(eventLocation, /scope === 'this'/)
  assert.match(eventLocation, /scope === 'all'/)
  assert.match(eventLocation, /start_time\.gte\.\$\{event\.start_time\}/)
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
  const locationBlock = detail.slice(detail.indexOf('function LocationBlock'), detail.indexOf('function PanelFooter'))
  assert.doesNotMatch(locationBlock, /<InlinePlaceEditor/)
})
