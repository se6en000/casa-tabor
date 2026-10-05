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

// Face ID (canvas 40c): a passkey stands in for the PIN, never more. Read from the source: WebAuthn needs a real device.
import { readFileSync } from 'node:fs'
const src = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

test('Face ID: set up only by someone signed in with their PIN; it signs in like the PIN (same credential version)', () => {
  const gateway = src('../supabase/functions/assistant-history/index.ts')
  assert.match(gateway, /action === 'passkey_register_options' \|\| action === 'passkey_register'\) \{\s*const session = await assertHistorySession\(request, sb\)\s*const memberId = requireMemberSession\(session\)/)
  assert.match(gateway, /action === 'passkey_login'[\s\S]{0,700}credential_version: credential\.credential_version/)
})

test('Face ID: the face must be checked, on our site only, and each challenge works once within five minutes', () => {
  const pk = src('../supabase/functions/_shared/passkey-signin.ts')
  assert.equal((pk.match(/requireUserVerification: true/g) ?? []).length, 2)
  assert.match(pk, /RP_ORIGIN = 'https:\/\/casa-tabor\.vercel\.app'/)
  assert.match(pk, /from\('member_passkey_challenges'\)\.delete\(\)\.eq\('challenge', signed\)\.eq\('purpose', purpose\)/)
  assert.match(pk, /CHALLENGE_MS = 5 \* 60 \* 1000/)
})

test('Face ID: offered once after a right PIN, then a key in the keypad corner; cancelling goes back to the PIN', () => {
  const view = src('../src/signin/SignIn.tsx')
  assert.match(view, /faceId === 'can' && !wasOfferedFaceId\(member\.id\)/)
  assert.match(view, /aria-label="Use Face ID"/)
  assert.match(view, /if \(t\) goIn\(t\)\s*else setState\('typing'\)/)
})
