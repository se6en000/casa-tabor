import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { reconnectCalendarId } from '../supabase/functions/_shared/google-connection-core.mjs'

// Jake, 2026-09-29: the Google token expired; reconnecting "3 times … still gives an error". The logs:
// each reconnect saved the new token, then failed "duplicate key … calendar_connections_one_enabled_member"
// — the "Casa Tabor" lookup missed his synced family calendar, fell back to the account's own calendar,
// and tried to enable that old (disabled) connection beside the enabled one. Reconnecting never changes
// which calendar syncs.

test('a reconnect keeps the calendar this account already syncs', () => {
  const existing = [{ google_email: 'jacobrtabor@gmail.com', calendar_id: '9157@group.calendar.google.com' }]
  assert.equal(reconnectCalendarId({ existing, email: 'jacobrtabor@gmail.com', discovered: null }), '9157@group.calendar.google.com')
  assert.equal(reconnectCalendarId({ existing, email: 'JacobRTabor@gmail.com ', discovered: 'other@group' }), '9157@group.calendar.google.com', 'even if another calendar is found by name')
})

test('a first connection uses the calendar found by name, else the account’s own', () => {
  assert.equal(reconnectCalendarId({ existing: [], email: 'kelly@gmail.com', discovered: 'casa@group' }), 'casa@group')
  assert.equal(reconnectCalendarId({ existing: [], email: 'kelly@gmail.com', discovered: null }), 'kelly@gmail.com')
  assert.equal(reconnectCalendarId({ existing: [{ google_email: 'other@gmail.com', calendar_id: 'x' }], email: 'kelly@gmail.com', discovered: null }), 'kelly@gmail.com', 'another account’s calendar is not this one')
})

test('the callback keeps the synced calendar, and turns off any other enabled one first', () => {
  const fn = readFileSync(new URL('../supabase/functions/google-oauth-callback/index.ts', import.meta.url), 'utf8')
  assert.match(fn, /reconnectCalendarId\(\{ existing: /)
  const disable = fn.slice(fn.indexOf("const { error: disableError }"), fn.indexOf('if (disableError)'))
  assert.match(disable, /\.neq\('calendar_id', resolvedPolicy\.calendarId\)/, 'every other enabled connection of this person, same account or not')
  assert.doesNotMatch(disable, /\.neq\('google_email', normalizedEmail\)/)
})
