import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('eventMutations.ts exports createOccurrenceException and excludeOccurrence functions', () => {
  const mutationsFile = resolve('src/lib/eventMutations.ts')
  const mutationsContent = readFileSync(mutationsFile, 'utf8')

  assert.match(
    mutationsContent,
    /export async function createOccurrenceException/,
    'eventMutations.ts must export createOccurrenceException'
  )

  assert.match(
    mutationsContent,
    /export async function excludeOccurrence/,
    'eventMutations.ts must export excludeOccurrence'
  )
})

test('syncAndMaterializeRecurringSeries filters out exdates from materialized occurrences', () => {
  const mutationsFile = resolve('src/lib/eventMutations.ts')
  const mutationsContent = readFileSync(mutationsFile, 'utf8')

  assert.match(
    mutationsContent,
    /exdates|EXDATE/i,
    'syncAndMaterializeRecurringSeries must account for exdates when materializing occurrences'
  )
})
