import assert from 'node:assert/strict'
import test from 'node:test'

import { secureAssistantResult } from '../supabase/functions/_shared/assistant-output-safety.mjs'
import { validateCalendarTemporalProvenance } from '../supabase/functions/_shared/assistant-temporal-evidence.mjs'

test('output safety: does not reject negative statements or clarification questions as unverified writes', () => {
  const clarificationResult = secureAssistantResult(
    {
      type: 'text',
      text: 'What date should I use for "The Plymouth South Beach"? Nothing was added to the calendar.',
    },
    { userRequestedWrite: true },
  )
  assert.equal(clarificationResult.safety_rejection, undefined)
  assert.match(clarificationResult.text, /What date should I use/)

  const mismatchResult = secureAssistantResult(
    {
      type: 'text',
      text: 'I did not create "The Plymouth South Beach" because the proposed date does not match the date range you provided. What exact date should I use?',
    },
    { userRequestedWrite: true },
  )
  assert.equal(mismatchResult.safety_rejection, undefined)
  assert.match(mismatchResult.text, /I did not create/)

  const failedResult = secureAssistantResult(
    {
      type: 'text',
      text: 'I was unable to add that event right now. Please try again.',
    },
    { userRequestedWrite: true },
  )
  assert.equal(failedResult.safety_rejection, undefined)

  // Affirmative unsupported write completion should still be rejected
  const affirmativeResult = secureAssistantResult(
    {
      type: 'text',
      text: "I've added The Plymouth South Beach to your calendar for August 29-30.",
    },
    { userRequestedWrite: true },
  )
  assert.equal(affirmativeResult.safety_rejection, 'unsupported_write_claim')
})

test('temporal provenance: allows image_provenance resolutionKind', () => {
  const provenance = {
    sourceMessageId: 'msg-123',
    sourceText: '(visual attachment)',
    rangeStart: '2026-08-29',
    rangeEnd: '2026-08-30',
    resolutionKind: 'image_provenance',
  }
  const proposed = {
    start: '2026-08-29T15:00:00-04:00',
    end: '2026-08-30T11:00:00-04:00',
  }
  const validation = validateCalendarTemporalProvenance(provenance, proposed, { utcOffset: '-04:00' })
  assert.equal(validation.valid, true)
  assert.equal(validation.reason, null)
})
