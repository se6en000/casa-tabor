import assert from 'node:assert/strict'
import test from 'node:test'

import { stripEvidenceCitationMarkers } from '../src/lib/assistantMarkdown.mjs'

test('strips internal evidence IDs without damaging conversational punctuation', () => {
  const text = [
    'Emme goes to school there [evidence_id:1ca7969e-1e06-4bc0-94c7-8e64e234a5d9:8c49ca81-0c34-4eb1-a1a9-251dddf77206].',
    'Rose said “See you tomorrow!” [f36f352a-9e8c-4332-81f1-19bd87adcd91:44af4cdd-e040-42af-a94f-214480a2da3e].',
  ].join('\n')

  assert.equal(
    stripEvidenceCitationMarkers(text),
    'Emme goes to school there.\nRose said “See you tomorrow!”.',
  )
})

test('leaves ordinary markdown links and bracketed prose unchanged', () => {
  const text = 'Review [the appointment](casa://event/evt-1) and bring [both forms].'
  assert.equal(stripEvidenceCitationMarkers(text), text)
})

test('strips legacy internal event ID markers from visible answers', () => {
  const text = 'Dry Clean Jakes Tux [ID:d25f46fb-1104-42d9-89b4-a3a5cca50930] is at 9 PM.'
  assert.equal(stripEvidenceCitationMarkers(text), 'Dry Clean Jakes Tux is at 9 PM.')
})
