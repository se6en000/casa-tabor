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
const savedPlaces = readFileSync(resolve('src/hooks/useSavedPlaces.ts'), 'utf8')
const savedPlaceAddressConfirmation = readFileSync(
  resolve('supabase/migrations/20260715267000_confirm_saved_place_event_addresses.sql'),
  'utf8',
)
const recurrenceScope = readFileSync(resolve('src/components/calendar/RecurrenceScopeDialog.tsx'), 'utf8')
const recurrenceScopePresentation = readFileSync(resolve('src/lib/recurrenceScopePresentation.ts'), 'utf8')
const categoryPicker = detail.slice(detail.indexOf('function CategoryPicker'), detail.indexOf('/* ── Header'))
const eventEdit = readFileSync(resolve('src/components/calendar/EventEditSheet.tsx'), 'utf8')
const eventQuery = readFileSync(resolve('src/hooks/useCalendarEvents.ts'), 'utf8')
const enrichFunction = readFileSync(resolve('supabase/functions/enrich-event/index.ts'), 'utf8')
const categoryLockMigration = readFileSync(resolve('supabase/migrations/20260715122500_event_enrichment_category_lock.sql'), 'utf8')
const dropoffConsolidation = readFileSync(
  resolve('supabase/migrations/20260715263000_consolidate_owen_dropoff_series.sql'),
  'utf8',
)
const recurrenceEnrichmentNormalization = readFileSync(
  resolve('supabase/migrations/20260715262500_normalize_recurrence_enrichment_arrays.sql'),
  'utf8',
)
const dropoffReimportCleanup = readFileSync(
  resolve('supabase/migrations/20260715264000_remove_reimported_owen_dropoff_instances.sql'),
  'utf8',
)
const dropoffFinalProjection = readFileSync(
  resolve('supabase/migrations/20260715266000_finalize_owen_dropoff_google_projection.sql'),
  'utf8',
)

test('explicit transportation uses the navy The Plan command-center presentation', () => {
  assert.match(transportation, /aria-label="The Plan"/)
  assert.match(transportation, /bg-casa-navy/)
  assert.match(transportation, />The Plan</)
  assert.match(transportation, /Use a place pencil or driver menu for a quick change/)
  assert.match(placeEditor, /<IconButton/)
  assert.match(placeEditor, /aria-label=\{`Edit \$\{ariaLabel\}`\}/)
  const placeSummaryStart = placeEditor.indexOf('if (!editing && !editorOnly)')
  const placeSummaryReturn = placeEditor.indexOf('\n    return (', placeSummaryStart)
  const placeSummary = placeEditor.slice(
    placeSummaryStart,
    placeEditor.indexOf('\n  return (', placeSummaryReturn + 1),
  )
  assert.doesNotMatch(placeSummary, /<Button/)
  assert.match(transportation, /Edit entire plan/)
  assert.match(transportation, /Casa generated · review anytime/)
  assert.match(transportation, /label="Driver waits on site"/)
  assert.match(transportation, /No local driving route attached/)
  assert.doesNotMatch(detail, /<PlanBlock/)
})

test('addressed non-reminder events still expose The Plan even when they are not travel-kind', () => {
  assert.match(detail, /const showTransportationSection = hasDestination \|\| Boolean\(transportationPlan\)/)
  assert.match(detail, /!reminder && showTransportationSection/)
  assert.match(detail, /transportationNeeded=\{showTransportationSection\}/)
  assert.match(transportation, /No driving plan configured yet/)
  assert.match(transportation, /Add only the driving that needs coordination for this event\./)
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

test('transportation mutations separate quick one-off saves from scoped full-plan saves', () => {
  const legacyOverrideUpsert = detail.slice(detail.lastIndexOf('driver_overrides: driverOverrides'), detail.lastIndexOf('driver_overrides: driverOverrides') + 500)
  assert.match(detail, /const persistQuickTransportationPlan = useCallback\(async/)
  assert.match(detail, /executeRecurringQuickActionScope\(request, 'this'\)/)
  assert.match(detail, /const persistFullTransportationPlan = useCallback\(async/)
  assert.match(detail, /requestRecurringQuickAction\(\{[\s\S]*recurringTransportationRequest/)
  assert.match(detail, /transportation_plan: durablePlan/)
  assert.match(detail, /onQuickTransportationPlanChange=\{persistQuickTransportationPlan\}/)
  assert.match(detail, /onSaveTransportationPlan=\{persistFullTransportationPlan\}/)
  assert.doesNotMatch(legacyOverrideUpsert, /transportation_plan: transportationPlan/)
  assert.match(transportation, /await onQuickChange\([\s\S]*nextPlan/)
  assert.match(transportation, /await onSave\(/)
  assert.match(transportation, /onSave\(null\)/)
  assert.match(transportation, /savingQuickChange/)
  assert.match(transportation, /Saving trip change…/)
  assert.match(transportation, /transportationPlaceMatchesEvent\(eventPlace, event\)/)
  assert.match(transportationLib, /export function transportationPlaceMatchesEvent/)
  assert.match(detail, /markTransportationPlanManual/)
  assert.match(detail, /lat: trusted \? \(eventPlace\.lat \?\? null\) : null/)
  assert.match(detail, /lng: trusted \? \(eventPlace\.lng \?\? null\) : null/)
})

test('legacy Owen Drop Off consolidation is guarded and preserves the enhanced finite plan', () => {
  assert.match(dropoffConsolidation, /expected 57 active legacy rows/)
  assert.match(dropoffConsolidation, /jsonb_array_length\(transportation_plan->'legs'\) = 2/)
  assert.match(dropoffConsolidation, /transportation_plan#>>'\{legs,1,purpose\}' = 'return'/)
  assert.match(dropoffConsolidation, /UNTIL=20260817T125959Z/)
  assert.match(dropoffConsolidation, /obsolete_google_master_ids/)
  assert.match(dropoffConsolidation, /'recreate_projection',\s*3/)
})

test('recurrence reusable patches normalize nullable enrichment arrays', () => {
  assert.match(recurrenceEnrichmentNormalization, /jsonb_typeof\(value#>'\{enrichment,what_to_bring\}'\) = 'array'/)
  assert.match(recurrenceEnrichmentNormalization, /else '\[\]'::jsonb/)
  assert.match(recurrenceEnrichmentNormalization, /grant execute on function public\.recurrence_build_reusable_patch\(uuid\) to service_role/)
})

test('drop-off cleanup links canonical occurrences before retiring flattened imports', () => {
  assert.match(dropoffReimportCleanup, /Expected 18 freshly reimported Owen Drop Off instances/)
  assert.match(dropoffReimportCleanup, /canonical\.start_time = duplicate\.start_time/)
  assert.match(dropoffReimportCleanup, /tombstone_origin = 'google'/)
  assert.doesNotMatch(dropoffReimportCleanup, /calendar_sync_operations/)
})

test('final drop-off projection removes orphan resources through one audited recreation', () => {
  assert.match(dropoffFinalProjection, /Expected 23 linked canonical Owen Drop Off instances/)
  assert.match(dropoffFinalProjection, /Final Owen Drop Off projection requires an idle recurrence queue/)
  assert.match(dropoffFinalProjection, /'recreate_projection'/)
  assert.match(dropoffFinalProjection, /'obsolete_google_master_ids', v_obsolete_ids/)
  assert.match(dropoffFinalProjection, /'finalize-owen-dropoff-google-projection'/)
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
  assert.match(transportation, /onConfirm=\{\(\) => \{[\s\S]*?onSave\(null\)/)
})

test('full-plan recurrence handoff closes the sheet before scope and preserves drafts on cancellation', () => {
  const sheet = readFileSync(resolve('src/components/ui/Sheet.tsx'), 'utf8')
  const modal = readFileSync(resolve('src/components/ui/Modal.tsx'), 'utf8')

  assert.match(sheet, /onExitComplete\?: \(\) => void/)
  assert.match(sheet, /<AnimatePresence onExitComplete=\{onExitComplete\}>/)
  assert.match(modal, /onExitComplete\?: \(\) => void/)
  assert.match(modal, /<AnimatePresence onExitComplete=\{onExitComplete\}>/)
  assert.match(transportation, /const closeEditorBeforeScope = \(\) => new Promise<void>/)
  assert.match(transportation, /await closeEditorBeforeScope\(\)[\s\S]*await onSave/)
  assert.match(transportation, /result === 'cancelled'\) setEditorOpen\(true\)/)
  assert.match(transportation, /catch \(cause\) \{[\s\S]*setEditorOpen\(true\)/)
})

test('full-plan event-place changes share the scoped transportation mutation', () => {
  assert.match(detail, /'transportationPlan',[\s\S]*'event\.locationName'[\s\S]*'event\.address'[\s\S]*'event\.lat'[\s\S]*'event\.lng'/)
  assert.match(detail, /transportation_plan: durablePlan/)
  assert.match(detail, /event: \{[\s\S]*location_name:[\s\S]*address:[\s\S]*lat:[\s\S]*lng:/)
  const saveDraftIndex = transportation.indexOf('const saveDraft = async')
  const saveHandler = transportation.slice(
    saveDraftIndex,
    transportation.indexOf('const editorTitle', saveDraftIndex),
  )
  assert.doesNotMatch(saveHandler, /persistEventLocation\(/)
  assert.match(saveHandler, /onSave\(/)
  assert.match(transportation, /await onQuickChange\([\s\S]*current && isTransportationEventPlace\(current\)/)
  assert.doesNotMatch(transportation, /const persistEventLocation = async/)
})

test('transportation editor is bounded on desktop and progressive on every viewport', () => {
  assert.match(transportation, /useDesktopTransportationEditor/)
  assert.match(transportation, /<Modal[\s\S]*size="xl"[\s\S]*max-h-\[85dvh\]/)
  assert.match(transportation, /<Sheet[\s\S]*max-h-\[92dvh\][\s\S]*contentClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"/)
  assert.match(transportation, /flex min-h-0 flex-1 flex-col bg-casa-bg-2/)
  assert.match(transportation, /<Card key=\{leg\.id\} tone="subtle" padding="none"/)
  assert.match(transportation, /transportationLegSummary\(leg\)/)
  assert.match(transportation, /aria-expanded=\{expanded\}/)
  assert.match(transportation, /expandedLegId === leg\.id/)
  assert.match(transportation, /Open a leg to change its driver, places, timing, or passengers\./)
  assert.match(transportation, /shrink-0[\s\S]*border-t[\s\S]*Save trip/)
  assert.match(transportation, /'Set up trip'/)
  assert.doesNotMatch(transportation, /'Set up now'/)
})

test('event editors use the event-detail canvas with distinct structural surfaces', () => {
  assert.match(eventEdit, /rounded-t-modal bg-casa-bg-2 shadow-modal/)
  assert.match(eventEdit, /h-16 shrink-0 items-center justify-between gap-3 border-b border-casa-border bg-casa-surface px-6/)
  assert.match(eventEdit, /shrink-0 justify-center bg-casa-surface pb-1 pt-3/)
  assert.match(eventEdit, /BounceScroll className="flex-1 min-h-0 bg-casa-bg-2"/)
  assert.match(eventEdit, /section className="mx-5 mt-5 rounded-card border border-casa-border\/70 bg-casa-bg p-4"/)
  assert.match(eventEdit, /aria-label="Event title"/)
  assert.match(eventEdit, /flex shrink-0 flex-col-reverse gap-2 border-t border-casa-border bg-casa-surface/)
  assert.match(eventEdit, />\s*Cancel\s*</)
  assert.match(eventEdit, /: 'Save changes'/)
})

test('event detail header uses a light semantic surface with compact event identity', () => {
  assert.match(detail, /function CategoryPicker/)
  assert.match(detail, /aria-label=\{`Category:.*Tap to change`\}/)
  assert.match(detail, /aria-expanded=\{open\}/)
  assert.match(detail, /className="min-h-control-lg capitalize text-casa-text"/)
  assert.match(categoryPicker, /minHeight: 'var\(--ds-control-lg\)'/)
  assert.doesNotMatch(categoryPicker, /color: S\.navy/)
  assert.match(detail, /category_locked: true/)
  assert.match(detail, /import \{ cleanEventTitle, isBirthdayEvent \} from '\.\.\/\.\.\/utils\/eventTitle'/)
  assert.match(detail, /const displayTitle = cleanedTitle \|\| rawTitle \|\|/)
  assert.match(detail, /Light editorial header/)
  assert.match(detail, /border-b border-casa-border bg-casa-bg/)
  assert.match(detail, /event-detail-accent-marker/)
  assert.match(detail, /backgroundColor: accent/)
  // compact avatar circles in eyebrow row
  assert.match(detail, /avatarMembers\.map/)
  assert.match(detail, /avatarOverflow/)
  // title-first hero and meta line with category beneath title
  assert.match(detail, /Title hero/)
  assert.match(detail, /event-command-center-title/)
  assert.match(detail, /event-command-center-title[\s\S]{0,120}text-casa-navy/)
  assert.match(detail, /Meta line: category \+ date \+ duration/)
  assert.match(detail, /<CategoryPicker event=\{event\} category=\{category\} accent=\{accent\} onQuickAction=\{onQuickAction\} \/>/)
  // crown owns the location, full address, and review state
  assert.match(detail, /planKind === 'travel'/)
  assert.match(detail, /<AddressReviewSummary/)
  assert.match(addressReview, /\{normalizedAddress && normalizedAddress !== normalizedName/)
  // attendee editing is now intentional (toggle) instead of always-on divider row
  assert.match(detail, /Edit attendees/)
  assert.match(detail, /rosterOpen \? 'Done editing' : editPeopleLabel/)
  assert.match(detail, /rosterOpen && \([\s\S]{0,700}MemberEditor/)
  // close button remains in the top utility rail
  assert.match(detail, /aria-label="Close event details"/)
})

test('event detail shell uses semantic light header, tinted workspace, and surface footer', () => {
  assert.doesNotMatch(detail, /eventCrownStyle/)
  assert.match(detail, /var\(--color-casa-navy\) 8%, transparent\)[\s\S]*var\(--casa-scrim\)/)
  assert.match(detail, /boxShadow: 'var\(--shadow-modal\), 0 20px 56px color-mix\(in srgb, var\(--color-casa-navy\) 20%, transparent\)'/)
  assert.match(detail, /className="relative h-control-sm flex-shrink-0 border-b border-casa-border bg-casa-bg px-3"/)
  assert.match(detail, /className="absolute inset-x-0 top-0 z-10 mx-auto block h-control w-\[86px\]/)
  assert.match(detail, /h-\[5px\] w-control-sm rounded-full/)
  assert.match(detail, /aria-label=\{showEdit \? 'Panel dismissal disabled while editing' : 'Drag down to dismiss panel'\}/)
  assert.match(detail, /var\(--color-casa-navy\) 38%, transparent/)
  assert.match(detail, /overflow-y-auto overflow-x-hidden overscroll-contain bg-casa-bg-2/)
  assert.match(detail, /event-command-center-content space-y-5 bg-casa-bg-2 p-6/)
  assert.match(detail, /bg-casa-surface px-5 py-3\.5/)
  assert.doesNotMatch(detail, /background: '#(?:1b2a4a|1B2A4A)'/)
})

test('reminder details identify their type and allow assigned people editing', () => {
  assert.match(detail, /event\.event_type === 'reminder' \? 'Reminder' : 'Event'/)
  assert.match(detail, /<Bell size=\{12\} aria-hidden="true" \/>[\s\S]{0,80}Reminder/)
  assert.match(detail, /const attendeeCount = effectiveMembers\.length/)
  assert.match(detail, /reminder \? `\$\{attendeeCount\} assigned` : `\$\{attendeeCount\} attending`/)
  assert.match(detail, /reminder \? 'Edit people' : 'Edit attendees'/)
  assert.match(detail, /reminder \? 'Assigned people' : 'Attendees'/)
  assert.match(detail, /rosterOpen && \([\s\S]{0,700}<MemberEditor/)
  assert.doesNotMatch(detail, /const showAttendees = !reminder/)
})

test('category popover paints above the later people utility row', () => {
  assert.match(detail, /Meta line: category \+ date \+ duration[\s\S]{0,120}<div className="relative z-10/)
  assert.match(detail, /<div className="relative mt-3">[\s\S]{0,100}\{showAddressSummary \? \(/)
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

test('route stops and header address editor reuse saved and Google place entry', () => {
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

test('address review trusts exact household saved addresses but not automatic route confidence', () => {
  assert.match(detail, /const addressReviewed = verifiedOverride === true[\s\S]*findSavedPlaceByAddress\(savedPlaces, event\?\.address\)/)
  assert.doesNotMatch(detail, /verifyFromTrustedSource/)
  assert.match(detail, /isPending: savedPlacesPending/)
  assert.match(detail, /addressReviewLoading=\{overridesHydratedEventId !== event\.id \|\| savedPlacesPending\}/)
  assert.match(savedPlaces, /export function findSavedPlaceByAddress/)
  assert.match(savedPlaces, /replace\(\/\[\^\\p\{L\}\\p\{N\}\]\+\/gu, ''\)/)
  assert.match(savedPlaces, /normalizeSavedPlaceAddress\(savedPlaceAddress\(place\)\) === normalizedAddress/)
  assert.match(detail, /onConfirmAddress=\{\(\) => void confirmAddress\(\)\}/)
  assert.match(eventLocation, /verified: place\.source === 'saved'/)
  assert.match(eventLocation, /place\.source === 'google' \|\| place\.source === 'saved'/)
  assert.match(detail, /locationSignature\(event\)/)
  assert.match(detail, /location_projection_blocked: false/)
  assert.match(savedPlaceAddressConfirmation, /event_plan_overrides override/)
  assert.match(savedPlaceAddressConfirmation, /override\.location_projection_blocked = true/)
  assert.doesNotMatch(savedPlaceAddressConfirmation, /insert into public\.event_plan_overrides/)
})

test('address review summary lives in the header with a full address and truthful actions', () => {
  assert.match(addressReview, /text-casa-muted/)
  assert.doesNotMatch(addressReview, /rgba\(255,255,255/)
  assert.doesNotMatch(addressReview, /text-white/)
  assert.doesNotMatch(addressReview, />Confirmed</)
  assert.match(addressReview, /Needs review/)
  assert.match(addressReview, /Address missing/)
  assert.match(addressReview, /Checking review/)
  assert.match(addressReview, /Confirm address/)
  assert.match(addressReview, /Change address/)
  assert.match(addressReview, /Add location/)
  assert.match(addressReview, /<Card padding="sm" className="min-w-0 flex-1">/)
  assert.match(addressReview, /border-t border-casa-border pt-3/)
  assert.doesNotMatch(addressReview, /peopleActionLabel/)
  assert.doesNotMatch(addressReview, /onPeopleAction/)
  assert.match(addressReview, /role="alert"/)
  assert.match(addressReview, />\s*Retry\s*</)
  assert.match(addressReview, /mt-1 min-w-0 text-body-sm leading-relaxed/)
  assert.doesNotMatch(addressReview, /truncate/)
  // attendee editing moved to the top-rail avatar cluster, not the address summary
  assert.match(detail, /onClick=\{\(\) => setRosterOpen\(\(open\) => !open\)\}[\s\S]{0,200}aria-expanded=\{rosterOpen\}/)
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
