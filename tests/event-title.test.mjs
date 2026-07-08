import test from 'node:test'
import assert from 'node:assert/strict'

import { cleanEventTitle, normalizePossessiveSuffixCasing, isBirthdayEvent } from '../src/utils/eventTitle.ts'

test('normalizePossessiveSuffixCasing lowercases broken possessive suffix', () => {
  assert.equal(normalizePossessiveSuffixCasing("Owen'S Soccer Practice"), "Owen's Soccer Practice")
  assert.equal(normalizePossessiveSuffixCasing("Jake'S Reminder"), "Jake's Reminder")
})

test('normalizePossessiveSuffixCasing preserves non-possessive apostrophe casing', () => {
  assert.equal(normalizePossessiveSuffixCasing("O'Connor Visit"), "O'Connor Visit")
})

test('cleanEventTitle strips owner prefix and fixes possessive suffix', () => {
  assert.equal(cleanEventTitle("Jake | Owen'S Soccer Practice"), "Owen's Soccer Practice")
  assert.equal(cleanEventTitle("Owen'S Soccer Practice"), "Owen's Soccer Practice")
})

test('isBirthdayEvent trusts enrichment category first', () => {
  assert.equal(isBirthdayEvent({ title: 'Family Dinner', enrichment: { category: 'birthday' } }), true)
  assert.equal(isBirthdayEvent({ title: 'Family Dinner', enrichment: { category: 'dining' } }), false)
})

test('isBirthdayEvent falls back to title keyword match when category is missing', () => {
  assert.equal(isBirthdayEvent({ title: "Owen's Birthday", enrichment: null }), true)
  assert.equal(isBirthdayEvent({ title: 'Birthday party planning', enrichment: undefined }), true)
  assert.equal(isBirthdayEvent({ title: 'Soccer Practice', enrichment: null }), false)
})
