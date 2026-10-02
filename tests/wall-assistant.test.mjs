import test from 'node:test'
import assert from 'node:assert/strict'
import { bandAnswer, latestExchange, pendingAction, answerEventId, bandState } from '../src/wall/assistant.ts'

const msg = (role, content, extra = {}) => ({ id: `${role}-${content.slice(0, 8)}`, role, content, ...extra })

test('answers are shown as plain spoken-style text: no markdown, and cut at a sentence when long', () => {
  assert.equal(bandAnswer('**Leave at 11:56.** You\'re driving Liv.\n\n- 29 min drive\n- Ferrin Park'), "Leave at 11:56. You're driving Liv. 29 min drive. Ferrin Park")
  const long = 'One sentence here. '.repeat(30).trim()
  const cut = bandAnswer(long)
  assert.ok(cut.length <= 300, `was ${cut.length}`)
  assert.ok(cut.endsWith('here.'))
})

test('the band shows the latest question and the answer that followed it', () => {
  const messages = [msg('user', 'first'), msg('assistant', 'one'), msg('user', 'What time do we leave?'), msg('assistant', 'Leave at 11:56.', { streaming: false })]
  assert.deepEqual(latestExchange(messages), { question: 'What time do we leave?', answer: messages[3] })
  assert.deepEqual(latestExchange([msg('user', 'hi')]), { question: 'hi', answer: null })
  assert.deepEqual(latestExchange([]), { question: null, answer: null })
})

test('an action waiting for a yes is found; done or cancelled ones are not', () => {
  const pending = msg('assistant', 'Add it?', { toolAction: { tool: 'create_event', args: {}, displayText: 'Dentist · Emme · Tue 3:30', status: 'pending' } })
  assert.equal(pendingAction([msg('user', 'add'), pending])?.id, pending.id)
  assert.equal(pendingAction([{ ...pending, toolAction: { ...pending.toolAction, status: 'done' } }]), null)
})

test('an answer about an event names it, so the wall can point at it', () => {
  assert.equal(answerEventId(msg('assistant', 'x', { conversationState: { activeEntityType: 'event', activeEventId: 'softball', expectedFollowUp: 'event_follow_up', establishedAt: '' } })), 'softball')
  assert.equal(answerEventId(msg('assistant', 'x', { toolAction: { tool: 'create_event', args: {}, displayText: '', status: 'done', resultEventId: 'new-1' } })), 'new-1')
  assert.equal(answerEventId(msg('assistant', 'x')), null)
})

test('the band says what it is doing', () => {
  assert.equal(bandState({ listening: true, loading: false, answer: null, pending: null }), 'LISTENING')
  assert.equal(bandState({ listening: false, loading: true, answer: null, pending: null }), 'THINKING')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x', { streaming: true }), pending: null }), 'THINKING')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x'), pending: null }), 'ANSWERED')
  assert.equal(bandState({ listening: false, loading: false, answer: msg('assistant', 'x'), pending: msg('assistant', 'y') }), 'NEEDS A YES')
  assert.equal(bandState({ listening: false, loading: false, answer: null, pending: null }), 'READY')
  // The mic stays open while a card waits (P3.13): the band still says what it's waiting for.
  assert.equal(bandState({ listening: true, loading: false, answer: msg('assistant', 'x'), pending: msg('assistant', 'y') }), 'NEEDS A YES')
})

import { requestArgsFor, readActionResult } from '../src/wall/assistantActions.ts'

test('confirming an update sends the event\'s last-changed time, so a stale edit is refused', () => {
  const events = [{ id: 'softball', updated_at: '2026-09-25T19:44:58Z' }]
  assert.deepEqual(requestArgsFor('update_event', { id: 'softball', start: 'x' }, events), { id: 'softball', start: 'x', expected_updated_at: '2026-09-25T19:44:58Z' })
  assert.deepEqual(requestArgsFor('create_event', { title: 'Dentist' }, events), { title: 'Dentist' })
  assert.deepEqual(requestArgsFor('create_event', { title: 'Dentist', calendar_preflight: {} }, events), { title: 'Dentist', calendar_preflight: {}, allow_calendar_conflicts: true })
})

test('the action result: done with the new event, a clash that needs a second yes, or an error', () => {
  assert.deepEqual(readActionResult({ success: true, event_id: 'e1', action_id: 'a1' }, { title: 'x' }), { kind: 'done', eventId: 'e1', actionId: 'a1' })
  assert.deepEqual(
    readActionResult({ code: 'calendar_conflict_confirmation_required', calendar_preflight: { conflicts: [] } }, { title: 'x' }),
    { kind: 'conflict', args: { title: 'x', calendar_preflight: { conflicts: [] }, allow_calendar_conflicts: true } },
  )
  assert.deepEqual(readActionResult({ success: false, error: 'Nope' }, {}), { kind: 'error', message: 'Nope' })
  assert.deepEqual(readActionResult(null, {}), { kind: 'error', message: 'That didn’t work. Nothing was changed.' })
})

import { voiceFinal } from '../src/wall/assistant.ts'

test('the speech hook gives the words, then "__SEND__" to send them; the marker itself is never sent', () => {
  let step = voiceFinal('', 'What time do we leave for softball tomorrow')
  assert.deepEqual(step, { captured: 'What time do we leave for softball tomorrow', toSend: null })
  step = voiceFinal(step.captured, '__SEND__')
  assert.deepEqual(step, { captured: '', toSend: 'What time do we leave for softball tomorrow' })
  assert.deepEqual(voiceFinal('', '__SEND__'), { captured: '', toSend: null })
  assert.deepEqual(voiceFinal('', '   '), { captured: '', toSend: null })
})

test('"Open it" goes to what was just added, not to an event the request only sounded like', () => {
  // Jake, 2026-09-26: "add Emmy watching Owen on Sunday" — Open it opened today's "Jaida Watching Owen and Emme".
  const state = { activeEntityType: 'event', activeEventId: 'jaida-today', expectedFollowUp: 'event_follow_up', establishedAt: '' }
  const create = (status, resultEventId) => msg('assistant', 'Create', { conversationState: state, toolAction: { tool: 'create_event', args: {}, displayText: '', status, resultEventId } })
  assert.equal(answerEventId(create('done', 'emmy-sunday')), 'emmy-sunday')
  assert.equal(answerEventId(create('pending')), null)
  assert.equal(answerEventId(create('cancelled')), null)
})

test('a confirmation card reads as words: no markdown', async () => {
  const { cardText } = await import('../src/wall/assistant.ts')
  assert.equal(cardText('Create: **Emmy is watching Owen** · Sun, Sep 27 · 12 – 1 PM'), 'Create: Emmy is watching Owen · Sun, Sep 27 · 12 – 1 PM')
})

test('the thread keeps the turns before the latest question in view, short and plain', async () => {
  const { threadTurns } = await import('../src/wall/assistant.ts')
  const messages = [
    msg('user', 'Add a dentist appointment for Liv on Tuesday at 3:30'),
    msg('assistant', '**Drafted it.** Where is it?'),
    msg('user', 'It is at Palm Beach Pediatric Dentistry'),
    msg('assistant', 'Added the place.'),
    msg('user', 'Actually make it 4'),
    msg('assistant', 'Moved it to 4.'),
  ]
  assert.deepEqual(threadTurns(messages), [
    { role: 'user', text: 'Add a dentist appointment for Liv on Tuesday at 3:30' },
    { role: 'assistant', text: 'Drafted it. Where is it?' },
    { role: 'user', text: 'It is at Palm Beach Pediatric Dentistry' },
    { role: 'assistant', text: 'Added the place.' },
  ])
  assert.equal(threadTurns(messages, 2).length, 2, 'only the last few')
  assert.deepEqual(threadTurns([msg('user', 'hi')]), [])
})

test('"which one?" offers the server’s candidates as tiles, with the change it keeps', async () => {
  const { whichOne } = await import('../src/wall/assistant.ts')
  const sun = (h, m) => new Date(2026, 8, 27, h, m).toISOString()
  const events = [
    { id: 'emmy', title: 'Emmy is watching Owen', start_time: sun(12, 0), end_time: sun(13, 0), all_day: false, members: [{ family_member_id: 'emme', role: 'primary' }, { family_member_id: 'owen', role: 'attendee' }] },
    { id: 'hf', title: 'HelloFresh delivery', start_time: sun(15, 0), end_time: sun(15, 0), all_day: false, members: [{ family_member_id: 'jake-id', role: 'driver' }] },
  ]
  const answer = msg('assistant', 'There are two things on Sunday. Which one should move to 5:00?', {
    conversationState: {
      activeEntityType: 'calendar_clarification',
      candidateEvents: [{ id: 'emmy', title: 'Emmy is watching Owen', start: sun(12, 0), version: null }, { id: 'hf', title: 'HelloFresh delivery', start: sun(15, 0), version: null }, { id: 'gone', title: 'Gone', start: null, version: null }],
      pendingMutation: { tool: 'update_event', args: { start: sun(17, 0), end: sun(18, 0) } },
      expectedFollowUp: 'calendar_clarification',
      establishedAt: '',
    },
  })
  const which = whichOne(answer, events)
  assert.deepEqual(which.choices.map((c) => [c.id, c.when, c.peopleIds]), [
    ['emmy', 'SUN · 12:00 – 1:00 PM', ['emme', 'owen']],
    ['hf', 'SUN · 3:00 PM', []],
  ])
  assert.equal(which.choices[0].say, 'Emmy is watching Owen')
  assert.equal(which.kept, '→ 5:00 PM')
  const drive = { ...answer, conversationState: { ...answer.conversationState, pendingMutation: { tool: 'update_event', args: { driver_name: 'Kelly' } } } }
  assert.equal(whichOne(drive, events).kept, '→ Kelly drives')
  const del = { ...answer, conversationState: { ...answer.conversationState, pendingMutation: { tool: 'delete_event', args: {} } } }
  assert.equal(whichOne(del, events).kept, '→ remove it')
  assert.equal(whichOne(msg('assistant', 'x'), events), null)
})

test('an answer that offers to do something gets a one-tap yes', async () => {
  const { nextStep } = await import('../src/wall/assistant.ts')
  assert.deepEqual(nextStep(msg('assistant', "Jake's free then. Want me to make him the driver?")), { label: 'Yes, do that', say: 'Yes, do that' })
  assert.deepEqual(nextStep(msg('assistant', 'Should I add it for Tuesday too?')), { label: 'Yes, do that', say: 'Yes, do that' })
  assert.deepEqual(nextStep(msg('assistant', "Kelly's free. Want me to make her the driver? Jake would be off the hook.")), { label: 'Yes, do that', say: 'Yes, do that' }, 'the offer need not be last')
  assert.equal(nextStep(msg('assistant', 'I can do that if you want me to.')), null, 'not a question')
  assert.equal(nextStep(msg('assistant', 'Kelly drives. Leave by 1:28.')), null)
  assert.equal(nextStep(msg('assistant', 'Which one do you mean?')), null, 'a question back is not an offer')
  assert.equal(nextStep(null), null)
})

test('words not said to Casa (asides) are dropped from the conversation, and a run of them is counted', async () => {
  const { withoutAsides } = await import('../src/wall/assistant.ts')
  const m = [
    msg('user', 'what is on sunday'), msg('assistant', 'Skyzone at 9.'),
    msg('user', 'owen get your shoes on'), { ...msg('assistant', ''), id: 'a-aside-1', aside: true },
  ]
  const one = withoutAsides(m)
  assert.deepEqual(one.messages.map((x) => x.content), ['what is on sunday', 'Skyzone at 9.'])
  assert.equal(one.asidesInARow, 1)
  const two = withoutAsides([...m, msg('user', 'honey where are my keys'), { ...msg('assistant', ''), id: 'a-aside-2', aside: true }])
  assert.equal(two.asidesInARow, 2)
  const back = withoutAsides([...m, msg('user', 'and saturday'), msg('assistant', 'Softball.')])
  assert.equal(back.asidesInARow, 0, 'talking to Casa again resets the count')
  assert.equal(back.messages.length, 4)
})

// Canvas 24c–d (Jake, 2026-10-01: "show what was said"; the earlier turns on the right, "like reading a book").
test('the conversation column: the latest six, newest strongest; the rest behind "↑ N earlier"; opened, all of it', async () => {
  const { historyView, HISTORY_SHOWN } = await import('../src/wall/assistant.ts')
  const turns = Array.from({ length: 8 }, (_, i) => `t${i}`)
  const closed = historyView(turns, false)
  assert.equal(closed.earlier, 2)
  assert.deepEqual(closed.shown.map((s) => s.turn), ['t2', 't3', 't4', 't5', 't6', 't7'])
  assert.deepEqual(closed.shown.map((s) => s.fade), [5, 4, 3, 2, 1, 0])
  assert.equal(HISTORY_SHOWN, 6)
  const open = historyView(turns, true)
  assert.equal(open.earlier, 0)
  assert.equal(open.shown.length, 8)
  assert.equal(historyView(['a'], false).earlier, 0)
})

// Canvas 25b (Jake, 2026-10-01): the card for "snacks for the softball game" stayed up, waiting for a yes, under the
// answer to his next question ("no, what food could I make with those ingredients"). Only the latest answer's card waits.
test('a card waits only while it is the latest answer; moving on lets it go', async () => {
  const { pendingAction } = await import('../src/wall/assistant.ts')
  const card = { id: 'a1', role: 'assistant', content: 'Add watermelon and grapes?', toolAction: { tool: 'add_prep_item', args: {}, displayText: 'x', status: 'pending' } }
  const ask = { id: 'u1', role: 'user', content: 'snacks for the game: a watermelon and some grapes' }
  assert.equal(pendingAction([ask, card])?.id, 'a1')
  assert.equal(pendingAction([ask, card, { id: 'u2', role: 'user', content: 'no, what food could I make with those' }])?.id, 'a1', 'still up while Casa answers')
  assert.equal(pendingAction([ask, card, { id: 'u2', role: 'user', content: 'no, what food could I make with those' }, { id: 'a2', role: 'assistant', content: 'Fruit skewers…' }]), null)
})

// Canvas 25a (Jake, 2026-10-01: "I don't love it" — snack ideas came as one long paragraph): a short lead, the list as tiles.
test('an answer with shape: a lead line, then options as tiles (name and one line)', async () => {
  const { answerShape } = await import('../src/wall/assistant.ts')
  const shaped = answerShape('Three easy ones for a hot afternoon game:\n- **Fruit skewers**: watermelon cubes and grapes on sticks.\n- Mint-lime fruit salad — watermelon, halved grapes, lime and mint.\n- Frozen grape cups: grapes frozen overnight.\nWant one on the game’s list?')
  assert.equal(shaped.lead, 'Three easy ones for a hot afternoon game:')
  assert.deepEqual(shaped.items.map((i) => i.title), ['Fruit skewers', 'Mint-lime fruit salad', 'Frozen grape cups'])
  assert.equal(shaped.items[1].detail, 'watermelon, halved grapes, lime and mint.')
  assert.equal(shaped.tail, 'Want one on the game’s list?')
  const plain = answerShape('Yes, Kelly has Gym at 7:30 PM.')
  assert.deepEqual([plain.lead, plain.items.length], ['Yes, Kelly has Gym at 7:30 PM.', 0])
  assert.equal(answerShape('Only one:\n- Fruit skewers: easy').items.length, 0)
})

// Jake, 2026-10-01 (computer panel): "book it for friday" → the card → typed "yes add it" → nothing saved, nothing to
// open. The server's reply to a typed yes only confirms the card; it isn't moving on.
test('a typed yes: the reply that confirms the card keeps it waiting, so it saves', async () => {
  const { pendingAction } = await import('../src/wall/assistant.ts')
  const card = { id: 'a1', role: 'assistant', content: 'Create: Search for electricians', toolAction: { tool: 'create_event', args: {}, displayText: 'x', status: 'pending' } }
  const yes = { id: 'u2', role: 'user', content: 'yes add it' }
  const confirming = { id: 'a2', role: 'assistant', content: '', confirmsDraft: true }
  assert.equal(pendingAction([card, yes, confirming])?.id, 'a1')
  assert.equal(pendingAction([card, yes, confirming, { id: 'u3', role: 'user', content: 'what else?' }, { id: 'a3', role: 'assistant', content: 'Nothing.' }]), null)
})
