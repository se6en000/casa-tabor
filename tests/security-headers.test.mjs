import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-23 (item 7 of the app best-practices review). Deliberately scoped:
// the safe, well-understood headers (nosniff, referrer policy, frame
// options, permissions policy) ship ENFORCING. CSP ships REPORT-ONLY, not
// enforcing -- an audit found real, actively-used local hardware bridges
// this session cannot test live (LED strip on :8765, wake-word sensitivity
// on :8766, a DeepGram STT bridge over HTTP :8766 + WebSocket :8767,
// YouTube cast sync on :5891) plus the Spotify Web Playback SDK, whose
// internal connection behavior isn't fully documented. Enforcing a CSP
// against features that can only be tested on the physical kiosk would risk
// silently breaking voice input, ambient lighting, or music -- report-only
// gathers real violation data with zero risk of breaking anything, and is
// the standard, correct way to stage a CSP into a large, already-shipping app.
const vercelConfig = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'))
const catchAll = vercelConfig.headers.find((h) => h.source === '/(.*)')
const headerNames = catchAll?.headers.map((h) => h.key) ?? []
const headerValue = (name) => catchAll.headers.find((h) => h.key === name)?.value

test('the safe headers are enforcing on every route', () => {
  assert.ok(headerNames.includes('X-Content-Type-Options'))
  assert.equal(headerValue('X-Content-Type-Options'), 'nosniff')
  assert.ok(headerNames.includes('Referrer-Policy'))
  assert.ok(headerNames.includes('X-Frame-Options'))
  assert.equal(headerValue('X-Frame-Options'), 'DENY')
})

test('Permissions-Policy explicitly allows the features this app actually uses (mic, geolocation) rather than blanket-denying', () => {
  const policy = headerValue('Permissions-Policy')
  assert.ok(policy)
  assert.match(policy, /microphone=\(self\)/)
  assert.match(policy, /geolocation=\(self\)/)
})

test('CSP ships report-only, not enforcing -- real local hardware bridges cannot be verified live from this session', () => {
  assert.ok(!headerNames.includes('Content-Security-Policy'), 'CSP must not be enforcing yet')
  assert.ok(headerNames.includes('Content-Security-Policy-Report-Only'))
})

test('the report-only CSP accounts for every local hardware bridge and third-party SDK found in an audit of src/', () => {
  const csp = headerValue('Content-Security-Policy-Report-Only')
  // Supabase (API + Realtime)
  assert.match(csp, /sjiejymuuuqzqukyeagk\.supabase\.co/)
  assert.match(csp, /wss:\/\/sjiejymuuuqzqukyeagk\.supabase\.co/)
  // Fonts
  assert.match(csp, /fonts\.googleapis\.com/)
  assert.match(csp, /fonts\.gstatic\.com/)
  // Spotify (script, OAuth, Web API, SDK's own CDN)
  assert.match(csp, /sdk\.scdn\.co/)
  assert.match(csp, /accounts\.spotify\.com/)
  assert.match(csp, /api\.spotify\.com/)
  // Local hardware bridges: LED strip (8765), wake-word + STT HTTP (8766),
  // STT WebSocket streaming (8767) -- wildcarded by port since multiple
  // distinct ports exist across different files
  assert.match(csp, /http:\/\/(127\.0\.0\.1|localhost):\*/)
  assert.match(csp, /ws:\/\/(127\.0\.0\.1|localhost):\*/)
})
