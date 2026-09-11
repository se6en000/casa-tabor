import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fixMigration = readFileSync(
  new URL('../supabase/migrations/20260911191253_fix_no_ride_transportation_plan_constraint.sql', import.meta.url),
  'utf8',
)
const livingFlowState = readFileSync(
  new URL('../src/components/calendar/living-flow/hooks/useLivingFlowState.ts', import.meta.url),
  'utf8',
)

// Live-reproduced 2026-09-11: selecting "At Home (No Drive)" in the event
// sidecar visually toggled but never persisted. Root cause, confirmed via a
// real Playwright repro against the live app plus direct REST queries against
// production data: buildEventTransportationPlanForMode's 'none' mode legitimately
// builds { version: 1, legs: [], ... } -- and multiple existing read paths
// (LargeEventCard, StackedView, EventBlock, calendarResponsibility.ts) already
// deliberately key off exactly that shape (non-null transportation_plan + an
// empty legs array) to mean "confirmed, no one is driving." But a same-day
// "harden" migration (20260715115000) had added
// `jsonb_array_length(legs) > 0` to the DB check constraint, which rejected
// that exact legitimate shape -- so the ENTIRE upsert was silently rejected
// with a 400 (swallowed into a console.error, never surfaced to the user),
// leaving whatever driving plan existed before untouched.

test('the transportation_plan check constraint no longer requires a non-empty legs array', () => {
  assert.match(fixMigration, /drop constraint if exists event_plan_overrides_transportation_plan_check/)
  assert.match(fixMigration, /transportation_plan->>'version' = '1'/)
  assert.match(fixMigration, /jsonb_typeof\(transportation_plan->'legs'\) = 'array'/)
  // The actual constraint body (not this migration's explanatory comment,
  // which legitimately references the old constraint by name) must not
  // reintroduce the length requirement that broke "no ride needed."
  const constraintBody = fixMigration.slice(fixMigration.indexOf('check ('))
  assert.doesNotMatch(constraintBody, /jsonb_array_length/)
})

test('switching travel behavior removes a now-stale driver from event_members, not just the transportation_plan', () => {
  // Previously only additive: a driver assigned under "Needs Family Ride" stayed
  // in event_members forever, even after switching to "At Home / No Drive" --
  // so anything reading event_members directly (attendee lists, avatars, driver
  // conflict checks) kept reporting a driver for an event confirmed to need none.
  assert.match(livingFlowState, /const staleDriverMembers = existingMembers\.filter\(/)
  assert.match(livingFlowState, /m\.role === 'driver' && !relevantDriverIdSet\.has\(m\.family_member\?\.id \|\| m\.id\)/)
  assert.match(livingFlowState, /\.from\('event_members'\)\s*\n\s*\.delete\(\)/)
})

test('"none" (no drive at all) excludes BOTH driver legs from relevantDriverIds, not just pickup_only/dropoff_only', () => {
  // Live-reproduced gap: relevantDriverIds only special-cased the single-leg
  // pickup_only/dropoff_only modes, so a "none" toggle still counted both
  // existing drivers as "relevant" -- meaning the staleDriverMembers cleanup
  // above never actually fired for the one mode where it matters most.
  assert.match(livingFlowState, /const relevantDriverIds = newBehavior === 'none' \? \[\] : \[/)
})
