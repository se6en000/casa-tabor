import test from 'node:test'
import assert from 'node:assert/strict'
import { driversLine } from '../supabase/functions/_shared/assistant-event-drivers.mjs'

const family = [{ id: 'k', name: 'Kelly' }, { id: 'j', name: 'Jake' }]
const plan = (...legs) => ({ transportation_plan: { legs } })

test('the assistant is told who drives each trip', () => {
  assert.equal(driversLine(plan({ purpose: 'appointment', driverId: 'k' }, { purpose: 'return', driverId: 'k' }), family), 'Kelly drives')
  assert.equal(driversLine([plan({ purpose: 'appointment', driverId: 'j' }, { purpose: 'return', driverId: 'k' })], family), 'drop-off Jake · pick-up Kelly')
  assert.equal(driversLine(plan({ purpose: 'appointment', driverId: null }), family), 'no driver set yet')
  assert.equal(driversLine(plan({ purpose: 'appointment', driverId: 'j' }, { purpose: 'return', driverId: null }), family), 'drop-off Jake · pick-up nobody yet')
  assert.equal(driversLine(null, family), '')
})
