import test from 'node:test'
import assert from 'node:assert/strict'
import { signInPeople, greeting, wrongPinText, nextNewPin, rememberedMember, rememberMember } from '../src/signin/signin.ts'

// Signing in, restyled (canvas row 40; Jake, Oct 5: "love all this, also include the manage/add a pin screen").
const family = [
  { id: 'milo', name: 'Milo', role: 'child', show_on_home_sidebar: false, sort_order: 9 },
  { id: 'g', name: 'Giselle', role: 'caregiver', show_on_home_sidebar: true, sort_order: 7 },
  { id: 'o', name: 'Owen', role: 'child', show_on_home_sidebar: true, sort_order: 5 },
  { id: 'tf', name: 'Tabor Family', role: 'child', show_on_home_sidebar: false, sort_order: 5 },
  { id: 'k', name: 'Kelly', role: 'parent', show_on_home_sidebar: true, sort_order: 2 },
  { id: 'j', name: 'Jake', role: 'parent', show_on_home_sidebar: true, sort_order: 1 },
]

test('only people are offered, in the family order (no mailbox, no dog)', () => {
  assert.deepEqual(signInPeople(family).map((m) => m.name), ['Jake', 'Kelly', 'Owen', 'Giselle'])
})

test('good morning, afternoon, evening', () => {
  assert.equal(greeting('Jake', new Date('2026-10-05T07:42:00')), 'Good morning, Jake')
  assert.equal(greeting('Kelly', new Date('2026-10-05T13:00:00')), 'Good afternoon, Kelly')
  assert.equal(greeting('Liv', new Date('2026-10-05T21:00:00')), 'Good evening, Liv')
})

test('a wrong PIN says so plainly; five says who can reset it', () => {
  assert.equal(wrongPinText('That PIN is not correct.', ['Jake', 'Kelly']), 'That’s not it. Try again.')
  assert.equal(wrongPinText('Private history has not been set up for this family member.', ['Jake', 'Kelly']), 'No PIN yet — Jake or Kelly can set one in Family PINs.')
  assert.equal(wrongPinText('Too many attempts. Try again in 15 minutes.', ['Jake', 'Kelly']), 'Too many tries. Try again in 15 minutes — or Jake or Kelly can reset it in Family PINs.')
})

test('a new PIN is typed twice; a mismatch starts over', () => {
  let r = nextNewPin({ stage: 'first', first: '' }, '12345')
  assert.equal(r.step.stage, 'first')
  r = nextNewPin(r.step, '123456')
  assert.deepEqual(r.step, { stage: 'again', first: '123456' })
  assert.equal(nextNewPin(r.step, '123456').done, '123456')
  const miss = nextNewPin(r.step, '654321')
  assert.equal(miss.mismatch, true)
  assert.equal(miss.step.stage, 'first')
})

test('the phone remembers its person; no storage is no memory, never an error', () => {
  const kept = new Map()
  const store = { getItem: (k) => kept.get(k) ?? null, setItem: (k, v) => kept.set(k, v) }
  assert.equal(rememberedMember(store), null)
  rememberMember(store, 'j')
  assert.equal(rememberedMember(store), 'j')
  const broken = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(rememberedMember(broken), null)
  assert.doesNotThrow(() => rememberMember(broken, 'j'))
})
