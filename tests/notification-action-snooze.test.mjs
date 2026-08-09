import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('../supabase/functions/notification-action/index.ts', import.meta.url),
  'utf8',
)

test('push snooze updates the original reminder instead of creating a new event', () => {
  const start = source.lastIndexOf("if (action === 'snooze')")
  const snoozeBlock = source.slice(
    start,
    source.indexOf("if (action === 'thumbs_down'", start),
  )

  assert.doesNotMatch(snoozeBlock, /\.from\('events'\)\.insert/)
  assert.match(snoozeBlock, /\.from\('events'\)\s*\.update\(/)
})

test('prep-item push snooze uses the canonical snooze RPC', () => {
  assert.match(source, /rpc\('snooze_prep_item'/)
})
