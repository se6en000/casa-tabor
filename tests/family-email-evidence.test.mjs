import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  chunkFamilyEvidenceText,
  classifyFamilyEvidenceCandidate,
  redactFamilyEvidenceText,
} from '../supabase/functions/_shared/family-email-evidence.mjs'

const scanner = readFileSync(
  new URL('../supabase/functions/scan-gmail-inbox/index.ts', import.meta.url),
  'utf8',
)

test('informational school guidance is eligible even without a conventional due-date action', () => {
  assert.deepEqual(
    classifyFamilyEvidenceCandidate({
      subject: 'Getting Ready for the First Day of School',
      from: 'Palm Beach Schools <school@example.org>',
      body: 'Students report to their assigned Zero Hour room. Wait for teacher direction before bringing summer assignments.',
    }),
    { eligible: true, category: 'school' },
  )
})

test('approved operational family-service categories are eligible', () => {
  const examples = [
    ['athletics', 'Softball practice location changed', 'Coach update for Saturday'],
    ['appointment', 'Dentist appointment confirmed', 'Your appointment is Tuesday at 3 PM'],
    ['medical', 'Therapy schedule update', 'The Hope Center moved the session'],
    ['forms', 'Permission form instructions', 'Please sign and return the form'],
    ['payment', 'SchoolCash fee due', 'Review the required student fee'],
    ['insurance', 'Insurance renewal notice', 'Coverage renewal requires review'],
    ['utilities', 'FPL service notice', 'Planned power service work'],
    ['order_delivery', 'Your order is out for delivery', 'Delivery is expected today'],
  ]

  for (const [category, subject, body] of examples) {
    assert.equal(classifyFamilyEvidenceCandidate({ subject, body, from: '' }).category, category)
  }
})

test('obvious marketing and donation mail is excluded before indexing', () => {
  for (const subject of [
    '50% off this weekend only',
    'Support our annual donation campaign',
    'Volunteer opportunities newsletter',
  ]) {
    assert.deepEqual(
      classifyFamilyEvidenceCandidate({ subject, body: 'Unsubscribe from promotional emails', from: '' }),
      { eligible: false, category: null },
    )
  }
})

test('persisted evidence redacts credentials and sensitive identifiers', () => {
  const redacted = redactFamilyEvidenceText(
    'Student ID: 12345678\nPIN: 9876\nAccount number 4444333322221111\nBring the signed form Monday.',
  )

  assert.doesNotMatch(redacted, /12345678|9876|4444333322221111/)
  assert.match(redacted, /Student ID: \[REDACTED\]/)
  assert.match(redacted, /PIN: \[REDACTED\]/)
  assert.match(redacted, /Bring the signed form Monday/)
})

test('family evidence chunks are bounded and retain useful overlap', () => {
  const text = Array.from(
    { length: 30 },
    (_, index) => `Instruction ${index + 1}: bring the required item and follow the current school guidance.`,
  ).join('\n')
  const chunks = chunkFamilyEvidenceText(text, { maxChars: 500, overlapChars: 80 })

  assert.ok(chunks.length > 1)
  assert.ok(chunks.every((chunk) => chunk.length <= 500))
  assert.ok(chunks.every((chunk) => chunk.trim() === chunk))
  assert.ok(chunks[1].includes('school guidance'))
})

test('Gmail scanner indexes relevant informational evidence independently of actions and events', () => {
  assert.match(scanner, /classifyFamilyEvidenceCandidate/)
  assert.match(scanner, /redactFamilyEvidenceText/)
  assert.match(scanner, /family_evidence/)
  assert.match(scanner, /persistFamilyEmailEvidence/)
  assert.match(scanner, /\.from\('family_data_documents'\)/)
  assert.match(scanner, /\.from\('family_data_index_queue'\)/)
  assert.match(scanner, /backfill_family_evidence_only/)

  const candidateIndex = scanner.indexOf('const familyEvidenceCandidate')
  const noKeywordsIndex = scanner.indexOf("skipped_reason: 'no keywords'")
  assert.ok(candidateIndex > 0)
  assert.ok(noKeywordsIndex > candidateIndex)
})
