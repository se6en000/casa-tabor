import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { summarizeGmailHealth } from '../src/utils/gmailHealth.ts'

const gmailHealthCode = readFileSync(new URL('../src/utils/gmailHealth.ts', import.meta.url), 'utf8')
const useGmailHealthCode = readFileSync(new URL('../src/hooks/useGmailHealth.ts', import.meta.url), 'utf8')
const indicatorCode = readFileSync(new URL('../src/components/shared/GmailSyncStatusIndicator.tsx', import.meta.url), 'utf8')
const calmKioskView = readFileSync(new URL('../src/components/canvas/CalmKioskView.tsx', import.meta.url), 'utf8')
const turboCanvasView = readFileSync(new URL('../src/components/canvas/TurboCanvasView.tsx', import.meta.url), 'utf8')
const mobileTodayView = readFileSync(new URL('../src/components/mobile/MobileTodayView.tsx', import.meta.url), 'utf8')
const homePage = readFileSync(new URL('../src/pages/HomePage.tsx', import.meta.url), 'utf8')
const luxuryTopBar = readFileSync(new URL('../src/components/shared/LuxuryTopBar.tsx', import.meta.url), 'utf8')

test('summarizeGmailHealth: returns off status when no accounts have scan enabled', () => {
  const summary = summarizeGmailHealth([
    {
      gmail_scan_enabled: false,
      health_status: 'connected',
      reauthorization_required: false,
      last_sync_error: null,
      last_sync_at: new Date().toISOString(),
    },
  ])

  assert.equal(summary.status, 'off')
  assert.equal(summary.isDown, false)
  assert.equal(summary.label, 'Email scan off')
  assert.equal(summary.tone, 'neutral')
})

test('summarizeGmailHealth: flags reauthorization required as error with isDown true', () => {
  const summary = summarizeGmailHealth([
    {
      gmail_scan_enabled: true,
      health_status: 'reauthorization_required',
      reauthorization_required: true,
      last_sync_error: 'Token expired',
      last_sync_at: new Date().toISOString(),
    },
  ])

  assert.equal(summary.status, 'error')
  assert.equal(summary.isDown, true)
  assert.equal(summary.label, 'Reconnect Gmail')
  assert.equal(summary.tone, 'danger')
  assert.equal(summary.errorMessage, 'Token expired')
})

test('summarizeGmailHealth: flags sync errors and scan errors with isDown true', () => {
  const summary = summarizeGmailHealth([
    {
      gmail_scan_enabled: true,
      health_status: 'degraded',
      reauthorization_required: false,
      last_sync_error: 'Connection timeout',
      last_sync_at: new Date().toISOString(),
      gmail_last_scan_error: 'Gmail API rate limit',
    },
  ])

  assert.equal(summary.status, 'error')
  assert.equal(summary.isDown, true)
  assert.equal(summary.label, 'Gmail sync issue')
  assert.equal(summary.tone, 'danger')
  assert.equal(summary.errorMessage, 'Gmail API rate limit')
})

test('summarizeGmailHealth: flags stale sync (> 45 minutes) as warning with isDown true', () => {
  const fiftyMinutesAgo = new Date(Date.now() - 50 * 60 * 1000).toISOString()
  const summary = summarizeGmailHealth([
    {
      gmail_scan_enabled: true,
      health_status: 'healthy',
      reauthorization_required: false,
      last_sync_error: null,
      last_sync_at: fiftyMinutesAgo,
      gmail_last_scan_success_at: fiftyMinutesAgo,
      gmail_last_scan_error: null,
    },
  ])

  assert.equal(summary.status, 'stale')
  assert.equal(summary.isDown, true)
  assert.equal(summary.label, 'Gmail sync delayed')
  assert.equal(summary.tone, 'warning')
})

test('summarizeGmailHealth: returns healthy when recently synced without errors', () => {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString()
  const summary = summarizeGmailHealth([
    {
      gmail_scan_enabled: true,
      health_status: 'healthy',
      reauthorization_required: false,
      last_sync_error: null,
      last_sync_at: fiveMinutesAgo,
      gmail_last_scan_success_at: fiveMinutesAgo,
      gmail_last_scan_error: null,
    },
  ])

  assert.equal(summary.status, 'healthy')
  assert.equal(summary.isDown, false)
  assert.equal(summary.label, 'Email sync OK')
  assert.equal(summary.tone, 'success')
})

test('useGmailHealth hook queries google_connection_status and provides syncNow mutation', () => {
  assert.match(useGmailHealthCode, /export function useGmailHealth\(\)/)
  assert.match(useGmailHealthCode, /from\('google_connection_status'\)/)
  assert.match(useGmailHealthCode, /summarizeGmailHealth\(typedRows\)/)
  assert.match(useGmailHealthCode, /syncNow:/)
})

test('GmailSyncStatusIndicator component provides banner, compact, and pill variants with direct settings link', () => {
  assert.match(indicatorCode, /export default function GmailSyncStatusIndicator/)
  assert.match(indicatorCode, /to="\/settings\/google"/)
  assert.match(indicatorCode, /Fix in Settings/)
  assert.match(indicatorCode, /useGmailHealth/)
  assert.match(indicatorCode, /AlertCircle/)
  assert.match(indicatorCode, /AlertTriangle/)
  assert.doesNotMatch(indicatorCode, /[\u{1F300}-\u{1F9FF}]/u) // No raw Unicode emojis
})

test('Homepage views all embed GmailSyncStatusIndicator to ensure visibility across devices and modes', () => {
  assert.match(calmKioskView, /<GmailSyncStatusIndicator variant="banner"/)
  assert.match(turboCanvasView, /<GmailSyncStatusIndicator variant="compact"/)
  assert.match(mobileTodayView, /<GmailSyncStatusIndicator variant="compact"/)
  assert.match(homePage, /<GmailSyncStatusIndicator variant="banner"/)
  assert.match(luxuryTopBar, /useGmailHealth/)
})
