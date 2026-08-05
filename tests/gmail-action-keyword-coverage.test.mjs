import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// Regression coverage for a real bug: scan-gmail-inbox's hard keyword pre-filter
// (ACTION_KEYWORDS / CALENDAR_KEYWORDS) gated ~69% of processed emails away from
// any AI classification at all, so common actionable emails (bills, statements,
// deliveries, renewals) never became prep items. This test asserts the broadened
// keyword lists actually match representative real-world subject/body phrases,
// and that the extraction/persist pipeline supports the new "delivery"/"renewal"
// prep item types end-to-end.

const scanGmail = readFileSync(new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url), 'utf8')

function extractRegex(source, constName) {
  const match = source.match(new RegExp(`const ${constName} = /(.*)/i`))
  assert.ok(match, `expected to find ${constName} regex in scan-gmail-inbox/index.ts`)
  return new RegExp(match[1], 'i')
}

test('ACTION_KEYWORDS now matches common bill/payment phrasing that previously fell through', () => {
  const ACTION_KEYWORDS = extractRegex(scanGmail, 'ACTION_KEYWORDS')
  const examples = [
    'Please pay $266.08 immediately to avoid disconnection',
    'Your account balance is now due',
    'This is a friendly reminder that your bill is ready',
    'Your statement is ready to view online',
    'Autopay is scheduled for your account',
    'Final notice: your payment is past due',
  ]
  for (const text of examples) {
    assert.match(text, ACTION_KEYWORDS, `expected ACTION_KEYWORDS to match: "${text}"`)
  }
})

test('ACTION_KEYWORDS now matches delivery and renewal phrasing', () => {
  const ACTION_KEYWORDS = extractRegex(scanGmail, 'ACTION_KEYWORDS')
  const examples = [
    'Your order has shipped and is on its way',
    'Your package is out for delivery today',
    'Your subscription will renew automatically next week',
    'Your membership is expiring soon',
  ]
  for (const text of examples) {
    assert.match(text, ACTION_KEYWORDS, `expected ACTION_KEYWORDS to match: "${text}"`)
  }
})

test('CALENDAR_KEYWORDS includes common school/logistics phrasing', () => {
  const CALENDAR_KEYWORDS = extractRegex(scanGmail, 'CALENDAR_KEYWORDS')
  const examples = [
    'Please plan for pickup at 3pm',
    'Sign up for the upcoming field trip',
    'Join us for the school open house',
  ]
  for (const text of examples) {
    assert.match(text, CALENDAR_KEYWORDS, `expected CALENDAR_KEYWORDS to match: "${text}"`)
  }
})

test('InboxActionItem type union and extraction prompt include delivery and renewal', () => {
  assert.match(scanGmail, /type: 'forms' \| 'payment' \| 'rsvp' \| 'deadline' \| 'delivery' \| 'renewal' \| 'general'/)
  assert.match(scanGmail, /"type": "forms\|payment\|rsvp\|deadline\|delivery\|renewal\|general"/)
})

test('persistInboxActions maps delivery and renewal types to distinct emoji', () => {
  assert.match(scanGmail, /a\.type === 'delivery' \? '📦'/)
  assert.match(scanGmail, /a\.type === 'renewal' \? '🔄'/)
})

const actionHubPage = readFileSync(new URL('../src/pages/ActionHubPage.tsx', import.meta.url), 'utf8')

test('Action Hub renders type and source filter chips for the Prep & Action list', () => {
  assert.match(actionHubPage, /PREP_FILTERS/)
  assert.match(actionHubPage, /PREP_SOURCE_FILTERS/)
  assert.match(actionHubPage, /Bills & Payments/)
  assert.match(actionHubPage, /Deliveries/)
  assert.match(actionHubPage, /Renewals/)
  assert.match(actionHubPage, /filteredPrepItems/)
})

