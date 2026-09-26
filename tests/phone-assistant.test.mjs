import test from 'node:test'
import assert from 'node:assert/strict'
import { phoneTranscript } from '../src/phone/assistant.ts'

test('the phone shows the whole conversation as plain text, questions and answers in order', () => {
  const long = 'Kelly drives Liv to Ferrin Park at 9:30. '.repeat(12).trim()
  const lines = phoneTranscript([
    { id: 'u1', role: 'user', content: 'who drives Liv saturday' },
    { id: 'a1', role: 'assistant', content: `**Kelly** drives.\n\n- ${long}` },
    { id: 's1', role: 'system', content: 'context' },
    { id: 'u2', role: 'user', content: 'add Jaida watching the kids Saturday 12 to 3' },
    { id: 'a2', role: 'assistant', content: '', toolAction: { tool: 'create_event', args: {}, displayText: 'Add “Jaida watching the kids” · Sat 12–3 PM', status: 'pending' } },
    { id: 'a3', role: 'assistant', content: '', streaming: true },
  ])
  assert.deepEqual(lines.map((l) => [l.id, l.role]), [['u1', 'user'], ['a1', 'assistant'], ['u2', 'user'], ['a2', 'assistant']])
  assert.ok(lines[1].text.startsWith('Kelly drives. '))
  assert.ok(lines[1].text.endsWith('at 9:30.'), 'not clipped on the phone')
  assert.equal(lines[3].text, 'Add “Jaida watching the kids” · Sat 12–3 PM')
})
