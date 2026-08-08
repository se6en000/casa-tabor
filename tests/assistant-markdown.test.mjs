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

test('strips non-UUID evidence handles and raw internal casa links', () => {
  const text = [
    'Owen attends Play Pals [evidence_id: c7236789-bb48-4f36-abe0-4b856e2783f6:7180ab49-2f6c-4b13-9c9b-1a87f35517fc].',
    'Palm Beach Public Elementary School PTO [evidence_id: 80b15f67-3289-4c2f-b79d-bfa5b4bd37f3:2e30519b-bf55-4f6b-b5fd-4c3811d22bb6].',
    'Owen attends Palm Beach Public Elementary School [evidence_id: 80b15f67-3289-4c2f-b79d-bfa5b4bd37f3:2e30519b-bf55-4f6b-b5fd-4c3811d22bb6, f752faee-90f4-43e3-9f97-ce67db358759:355e2eea-b7ae-4a96-9b62-b293b4a9777aa].',
    'Internal token casa://event/evt_abc123 should not be shown.',
  ].join('\n')
  assert.equal(
    stripEvidenceCitationMarkers(text),
    [
      'Owen attends Play Pals.',
      'Palm Beach Public Elementary School PTO.',
      'Owen attends Palm Beach Public Elementary School.',
      'Internal token should not be shown.',
    ].join('\n'),
  )
})
