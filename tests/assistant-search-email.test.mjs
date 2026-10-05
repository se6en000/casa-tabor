import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { emailSearchWords, rankEmails, READ_TOOLS, fullAiTools } from '../supabase/functions/_shared/assistant-full-ai.mjs'

// Jake, Oct 5: "when I ask Alexa she doesn't seem to be able to find it when I ask her to search my email" — the
// neighborhood association's meeting reminder. The assistant can now search all the mail the reader has seen.
test('the words worth searching for', () => {
  assert.deepEqual(emailSearchWords('search my email for the neighborhood association meeting'), ['neighborhood', 'association', 'meeting'])
  assert.deepEqual(emailSearchWords('did HPSPNA send anything?'), ['hpspna'])
})

test('best matches first, then the newest; nothing that matches no word', () => {
  const rows = [
    { subject: 'The Park Press Vol. 5', from_email: 'HPSPNA', gist: null, email_body: 'newsletter', received_at: '2026-09-12' },
    { subject: 'TOMORROW! HPSPNA Meeting Reminder', from_email: 'Historic Prospect & Southland Park Neighborhood Association', gist: 'HPSPNA Neighborhood Meeting on Oct 6 at 5:30 PM', email_body: '', received_at: '2026-10-05' },
    { subject: 'Your order shipped', from_email: 'Amazon', gist: null, email_body: '', received_at: '2026-10-05' },
  ]
  assert.deepEqual(rankEmails(rows, ['hpspna', 'meeting']).map((r) => r.subject), ['TOMORROW! HPSPNA Meeting Reminder', 'The Park Press Vol. 5'])
})

test('a read tool the assistant has, which offers a card for something to go to', () => {
  assert.ok(READ_TOOLS.has('search_email'))
  const tool = fullAiTools({ planning: false }).find((t) => t.name === 'search_email')
  assert.match(tool.description, /offer it as its card \(create_event/)
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /from\('gmail_processed_messages'\)\.select\('gmail_message_id, subject, from_email, received_at, email_body, family_member_id'\)\.gte\('received_at', since\)/)
})

// The same evening's bug report (5:49 PM): on the wall, "Did anything come in from the Neighborhood Association?" and
// "Can you search my email for neighborhood association meeting?" never reached the email search — the quick reader
// took them as calendar questions and answered from the calendar ("I cannot search your email"). A turn about the mail
// goes on to the full assistant.
import { aboutMail, readTurnResolution } from '../supabase/functions/_shared/assistant-turn-context.mjs'
test('a turn about the mail is never answered from the calendar', () => {
  for (const said of ['Did anything come in from the Neighborhood Association?', 'Can you search my email for neighborhood association meeting?', 'did the school send anything about the field trip?', 'have we heard from Kim?', 'anything in the inbox?'])
    assert.equal(aboutMail(said), true, said)
  for (const said of ['what time is softball?', 'who is driving Liv tomorrow?', 'when does Kelly get in?'])
    assert.equal(aboutMail(said), false, said)
  const r = readTurnResolution({ act: 'question', answerable: true, standalone: 'Did anything come in from the Neighborhood Association?', search: { words: 'neighborhood' } }, { heard: 'Did anything come in from the Neighborhood Association?' })
  assert.equal(r.act, 'other')
  assert.equal(r.answerable, false)
  assert.equal(r.search, null)
})

// Jake's bug report, Oct 5 (1:10 PM): "Mark Gray Gym sneakers as done" — "I wasn't able to", three times; the assistant
// had no way to tick a to-do. Now a card, as every change is, that marks it done when he says yes.
import { fullAiCard } from '../supabase/functions/_shared/assistant-full-ai.mjs'
test('a to-do is marked done by its card', () => {
  const ctx = { events: [], todos: [{ id: 't1', title: 'Grey Gym Sneakers', due: '2026-09-16', time: '6:45 AM', late: true }], utcOffset: '-04:00', now: new Date('2026-10-05T13:00:00-04:00') }
  assert.deepEqual(fullAiCard({ name: 'finish_todo', args: { id: 't1' } }, ctx), { tool: 'complete_reminder', args: { id: 't1', title: 'Grey Gym Sneakers' } })
  assert.deepEqual(fullAiCard({ name: 'finish_todo', args: { id: 'nope' } }, ctx), { error: "I don't see that on the to-do list." })
})

// Live, Oct 5: "Mark Gray Jim sneakers as done." came back as the words "finish_todo(id='a36823aa-…')".
import { writtenCall } from '../supabase/functions/_shared/assistant-full-ai.mjs'
test('a tool call written out as words is taken as the call', () => {
  assert.deepEqual(writtenCall("finish_todo(id='a36823aa-8ae1-4954-8675-f79bdcc32823')", ['finish_todo', 'search_email']), { name: 'finish_todo', args: { id: 'a36823aa-8ae1-4954-8675-f79bdcc32823' } })
  assert.deepEqual(writtenCall('search_email(query="neighborhood association", days=30)', ['finish_todo', 'search_email']), { name: 'search_email', args: { query: 'neighborhood association', days: 30 } })
  assert.equal(writtenCall('Sure, I marked it done.', ['finish_todo']), null)
  assert.equal(writtenCall("rm_rf(path='/')", ['finish_todo']), null, 'only the tools offered')
})

test('a to-do with a wrong id is found by its name, when only one fits', () => {
  const ctx = { events: [], todos: [{ id: 't1', title: 'Grey Gym Sneakers' }, { id: 't2', title: 'Replace tire sensor' }], utcOffset: '-04:00', now: new Date('2026-10-05T13:00:00-04:00') }
  assert.deepEqual(fullAiCard({ name: 'finish_todo', args: { id: 'a3682', title: 'Grey Gym Sneakers' } }, ctx).args, { id: 't1', title: 'Grey Gym Sneakers' })
  assert.equal(fullAiCard({ name: 'finish_todo', args: { id: 'x', title: 'laundry' } }, ctx).error, "I don't see that on the to-do list.")
})

test('a card found in the mail is never swapped for a calendar answer', () => {
  const server = readFileSync(new URL('../supabase/functions/ai-assistant/index.ts', import.meta.url), 'utf8')
  assert.match(server, /if \(turnResolution\?\.isQuestion && proposesChange && !aboutMail\(latestUserText\)\)/)
})
