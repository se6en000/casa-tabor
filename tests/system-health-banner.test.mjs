import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { describeBreaker, bannerAlerts } from '../src/lib/systemHealth.mjs'

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
const NOW = Date.parse('2026-09-23T20:00:00Z')

test('describeBreaker: not paused is inactive', () => {
  assert.equal(describeBreaker(null, NOW).active, false)
  assert.equal(describeBreaker({ paused: false }, NOW).active, false)
})

test('describeBreaker: an expired timed pause is inactive (matches the edge-function check)', () => {
  const state = { paused: true, pause_scope: 'all', pause_until: '2026-09-23T19:00:00Z' }
  assert.equal(describeBreaker(state, NOW).active, false)
})

test('describeBreaker: auto trip names the cause and the scope', () => {
  const d = describeBreaker({
    paused: true, pause_scope: 'background', tripped_by: 'auto',
    trip_reason: '640 AI calls in the last hour (limit 600)',
  }, NOW)
  assert.equal(d.active, true)
  assert.equal(d.auto, true)
  assert.match(d.headline, /background AI paused/i)
  assert.match(d.detail, /640 AI calls/)
  assert.match(d.detail, /Chat still works/i)
})

test('describeBreaker: scope all says chat is paused too', () => {
  const d = describeBreaker({ paused: true, pause_scope: 'all', tripped_by: 'manual' }, NOW)
  assert.match(d.headline, /all AI paused/i)
  assert.doesNotMatch(d.detail, /Chat still works/i)
})

test('bannerAlerts: the breaker alert is not shown twice when the breaker card already covers it', () => {
  const alerts = [
    { id: '1', alert_key: 'ai_spend:runaway', title: 'AI usage spike', detail: 'x' },
    { id: '2', alert_key: 'latency:calendar_feed', title: 'Calendar loading very slowly', detail: 'y' },
  ]
  const shown = bannerAlerts(alerts, { paused: true, pause_scope: 'background' }, NOW)
  assert.deepEqual(shown.map((a) => a.id), ['2'])
  assert.deepEqual(bannerAlerts(alerts, null, NOW).map((a) => a.id), ['1', '2'])
})

test('banner is mounted everywhere the Gmail sync banner is', () => {
  for (const file of [
    'src/pages/HomePage.tsx',
    'src/components/canvas/CalmKioskView.tsx',
    'src/components/canvas/TurboCanvasView.tsx',
    'src/components/mobile/MobileTodayView.tsx',
  ]) {
    assert.match(source(file), /<SystemHealthBanner\b/, file)
  }
})

test('System Health page is routed and linked from settings', () => {
  assert.match(source('src/components/shared/AnimatedRoutes.tsx'), /path="health"/)
  assert.match(source('src/components/settings/SettingsShell.tsx'), /\/settings\/health/)
})

test('Cost & Usage pause buttons go through the merging RPC, not a whole-value overwrite', () => {
  const page = source('src/pages/StatusDashboardPage.tsx')
  assert.match(page, /rpc\('set_ai_circuit_breaker'/)
  assert.doesNotMatch(page, /setSetting\('ai_circuit_breaker'/)
  assert.doesNotMatch(page, /mock stubs/)
})
