import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { finishSplash } from '../src/phone/splash.ts'

// Jake, Oct 5: "an animated repeating loading logo, with that icon … on mobile app launch" — canvas 39a, drawn by hand.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')

test('the loading mark is drawn on /phone only, and never stays more than 8 s', () => {
  assert.match(html, /if \(location\.pathname === '\/phone'\)/)
  assert.match(html, /setTimeout\(function \(\) \{ window\.__thSplashDone && window\.__thSplashDone\(\) \}, 8000\)/)
  assert.match(html, /<div id="th-splash" aria-hidden="true">/)
  // the four parts of 38l: the ring, the T, the rule, HOUSE
  for (const part of ['class="ring"', '/icons/mark-t.png', 'class="rule"', '/icons/mark-house.png']) assert.ok(html.includes(part), part)
})

test('it loops until the day is here, and rests still for Reduce Motion', () => {
  assert.match(html, /animation:th-ring 3\.4s[^;]*infinite/)
  assert.match(html, /prefers-reduced-motion: reduce\)\{#th-splash \*\{animation:none!important\}/)
})

test('the day loading ends it; calling it again, or with no mark, does nothing', () => {
  let calls = 0
  finishSplash({ __thSplashDone: () => { calls++ } })
  assert.equal(calls, 1)
  assert.doesNotThrow(() => finishSplash({}))
  const view = readFileSync(new URL('../src/phone/PhoneView.tsx', import.meta.url), 'utf8')
  assert.match(view, /useEffect\(\(\) => \{ if \(!loading\) finishSplash\(\) \}, \[loading\]\)/)
})
