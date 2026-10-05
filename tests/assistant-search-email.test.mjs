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
