import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const transportation = readFileSync(resolve('src/components/calendar/EventTransportationSection.tsx'), 'utf8')
const placeEditor = readFileSync(resolve('src/components/calendar/InlinePlaceEditor.tsx'), 'utf8')
const smartPlace = readFileSync(resolve('src/components/calendar/SmartPlaceInput.tsx'), 'utf8')
const sidecar = readFileSync(resolve('src/components/calendar/living-flow/LivingFlowSidecar.tsx'), 'utf8')
const livingHook = readFileSync(resolve('src/components/calendar/living-flow/hooks/useLivingFlowState.ts'), 'utf8')
const livingRoute = readFileSync(resolve('src/components/calendar/living-flow/components/LivingRouteTimeline.tsx'), 'utf8')
const livingDeparture = readFileSync(resolve('src/components/calendar/living-flow/components/LivingDepartureHero.tsx'), 'utf8')
const livingVenue = readFileSync(resolve('src/components/calendar/living-flow/components/LivingVenueCard.tsx'), 'utf8')
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
})

test('addressed non-reminder events still expose The Plan even when they are not travel-kind', () => {
  assert.match(sidecar, /LivingRouteTimeline/)
  assert.match(sidecar, /LivingDepartureHero/)
  assert.match(livingRoute, /onAssignDriver/)
  assert.match(transportation, /No driving plan configured yet/)
  assert.match(transportation, /Add only the driving that needs coordination for this event\./)
})

test('transportation passengers use touch chips and synchronize with event attendees', () => {
  assert.match(livingHook, /toggleMember/)
  assert.match(eventMutations, /from\('event_members'\)/)
  assert.match(transportation, /\.from\('event_members'\)\.upsert/)
})

test('The Plan supports quick driver reassignment including external drivers and cascading', () => {
  assert.match(livingRoute, /driverLeg1/)
  assert.match(livingRoute, /driverLeg2/)
  assert.match(transportation, /function QuickDriverPicker/)
  assert.match(transportation, /Someone else/)
  assert.match(transportation, /Use for remaining legs/)
  assert.match(transportation, /updateTransportationDriver/)
  assert.match(transportation, /backgroundColor: activeDriver\?\.color_hex/)
  assert.match(transportation, /backgroundColor: driver\.color_hex/)
})

test('transportation mutations separate quick one-off saves from scoped full-plan saves', () => {
  assert.match(livingHook, /setDriver/)
  assert.match(livingHook, /setTravelBehavior/)
  assert.match(transportation, /await onQuickChange\([\s\S]*nextPlan/)
  assert.match(transportation, /await onSave\(/)
  assert.match(transportation, /onSave\(null\)/)
  assert.match(transportation, /savingQuickChange/)
  assert.match(transportation, /Saving trip change…/)
  assert.match(transportation, /transportationPlaceMatchesEvent\(eventPlace, event\)/)
  assert.match(transportationLib, /export function transportationPlaceMatchesEvent/)
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
  assert.match(modal, /onExitComplete\?: \(\) => void/)
  assert.match(eventEdit, /<RecurrenceScopeDialog/)
})

test('saved place addresses confirm directly from the event panel and run a reconciliation migration', () => {
  assert.match(savedPlaces, /findSavedPlaceByAddress/)
  assert.match(savedPlaceAddressConfirmation, /with saved_address_matches as/)
  assert.match(savedPlaceAddressConfirmation, /update public\.event_plan_overrides/)
})

const eventMutations = readFileSync(resolve('src/lib/eventMutations.ts'), 'utf8')

test('category locking prevents AI overwrite while manual category edits stay locked', () => {
  assert.match(categoryLockMigration, /category_locked boolean not null default false/)
  assert.match(enrichFunction, /effectiveLockedCategory/)
  assert.match(enrichFunction, /category_locked: Boolean\(effectiveLockedCategory\)/)
  assert.match(eventMutations, /category_locked: true/)
  assert.match(eventEdit, /category_locked: categoryLocked/)
  assert.match(eventQuery, /category_locked/)
})

test('address review surfaces human trust without blocking on-time route delivery', () => {
  assert.match(addressReview, /Add location/)
  assert.match(addressReview, /<Card padding="sm" className="min-w-0 flex-1">/)
  assert.match(addressReview, /border-t border-casa-border pt-3/)
  assert.doesNotMatch(addressReview, /peopleActionLabel/)
  assert.doesNotMatch(addressReview, /onPeopleAction/)
  assert.match(addressReview, /role="alert"/)
  assert.match(addressReview, />\s*Retry\s*</)
  assert.match(addressReview, /mt-1 min-w-0 text-body-sm leading-relaxed/)
  assert.doesNotMatch(addressReview, /truncate/)
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
  assert.match(recurrenceScope, /<Radio/)
  assert.match(recurrenceScopePresentation, /Only this event/)
  assert.match(recurrenceScopePresentation, /This and following events/)
  assert.match(recurrenceScopePresentation, /Entire series/)
  assert.match(eventLocation, /scope === 'this'/)
  assert.match(eventLocation, /scope === 'all'/)
  assert.match(eventLocation, /start_time\.gte\.\$\{event\.start_time\}/)
})
