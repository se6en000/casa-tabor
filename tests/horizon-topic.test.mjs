import test from 'node:test'
import assert from 'node:assert/strict'
import { horizonTopic, outcomeText, setHorizonTopic } from '../src/wall/horizonTopic.ts'

// Ahead (canvas 63B; Jake, Oct 7): a talk about one line marks it handled when it makes something.
test('the topic lasts a quarter of an hour, then a save is about something else', () => {
  setHorizonTopic({ key: 'b:heather', title: 'Heather’s Birthday', date: '2026-10-08' }, 1_000)
  assert.equal(horizonTopic(1_000 + 14 * 60_000).key, 'b:heather')
  assert.equal(horizonTopic(1_000 + 16 * 60_000), null)
  setHorizonTopic(null)
  assert.equal(horizonTopic(), null)
})

test('what was made, in a line for the timeline', () => {
  assert.match(outcomeText('create_event', { title: 'Text Heather happy birthday', event_type: 'reminder', start: '2026-10-08T09:00:00-04:00' }), /^Reminder: Text Heather happy birthday · Thu Oct 8, 9 AM$/)
  assert.equal(outcomeText('add_todo', { title: 'Get crazy hair supplies', due: '2026-10-16' }), 'To-do: Get crazy hair supplies · Fri Oct 16')
  assert.equal(outcomeText('add_prep_item', { labels: ['Pick good shirts', 'Kelly up early for hair'] }), 'Get & pack: Pick good shirts · Kelly up early for hair')
  assert.equal(outcomeText('plan_project', { title: 'Halloween decorations' }), 'Plan: Halloween decorations')
})
