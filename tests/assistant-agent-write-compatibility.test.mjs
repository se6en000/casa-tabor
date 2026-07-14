import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isAgentWriteCompatible,
} from '../supabase/functions/_shared/assistant-agent-write-compatibility.mjs'

test('authoritative grocery intent cannot be reclassified as a calendar write', () => {
  assert.equal(isAgentWriteCompatible('create_event', { groceryIntent: 'grocery.add' }), false)
  assert.equal(isAgentWriteCompatible('delete_event', { groceryIntent: 'grocery.remove' }), false)
  assert.equal(isAgentWriteCompatible('add_grocery_items', { groceryIntent: 'grocery.add' }), true)
  assert.equal(isAgentWriteCompatible('remove_grocery_item', { groceryIntent: 'grocery.remove' }), true)
  assert.equal(isAgentWriteCompatible('create_event', { groceryIntent: 'grocery.list' }), false)
})

test('authoritative calendar mutation direction cannot be changed by the planner', () => {
  assert.equal(isAgentWriteCompatible('create_event', { calendarIntent: 'event.move' }), false)
  assert.equal(isAgentWriteCompatible('update_event', { calendarIntent: 'event.move' }), true)
})

test('unclassified reminder language remains available to semantic planning', () => {
  assert.equal(isAgentWriteCompatible('create_event'), true)
  assert.equal(isAgentWriteCompatible('complete_reminder'), true)
})
