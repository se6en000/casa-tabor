import { useState } from 'react'
import type { AIMessage } from '../hooks/useAISession'
import { answerEventId, latestExchange, pendingAction } from './assistant'
import type { useAssistantTurn } from './useAssistantTurn'

// Canned conversations for the screenshot fixture (`/__wall-fixture?band=…`), one per
// board in design section 06, on the fixture's Friday Sep 25 – Saturday Sep 26.

const local = (day: number, h: number, m: number) => new Date(2026, 8, day, h, m).toISOString()
let n = 0
const user = (content: string): AIMessage => ({ id: `u${n++}`, role: 'user', content })
const said = (content: string, extra: Partial<AIMessage> = {}): AIMessage => ({ id: `a${n++}`, role: 'assistant', content, ...extra })
const draft = (tool: string, args: Record<string, unknown>, displayText: string, status: 'pending' | 'cancelled' = 'pending') => ({ toolAction: { tool, args, displayText, status } })
const dentist = (start: string, end: string, extra: Record<string, unknown> = {}) => ({ title: 'Dentist', event_type: 'event', start, end, members: ['Liv'], ...extra })

export const BAND_SCENES: Record<string, () => AIMessage[]> = {
  // 06a: a draft that takes follow-ups, revised in place.
  add: () => [
    user('Add a dentist appointment for Liv today at 3:30'),
    said('Drafted it. Where is it?', draft('create_event', dentist(local(25, 15, 30), local(25, 16, 30)), 'Dentist · Liv', 'cancelled')),
    user('It’s at Palm Beach Pediatric Dentistry'),
    said('Added the place. Liv’s at school until 3:30, so it’s straight from pick-up.', draft('create_event', dentist(local(25, 15, 30), local(25, 16, 30), { location: 'Palm Beach Pediatric Dentistry' }), 'Dentist · Liv', 'cancelled')),
    user('Actually make it 4'),
    said('Moved it to 4:00.', draft('create_event', dentist(local(25, 16, 0), local(25, 17, 0), { location: 'Palm Beach Pediatric Dentistry' }), 'Dentist · Liv · Fri 4:00 PM')),
  ],
  // 06b: a change, before → after, previewed on the Score.
  change: () => [
    user('What’s on Saturday?'),
    said('Two games, both at 12:30: softball and baseball.'),
    user('Push the softball back half an hour'),
    said('Moving softball to 1:00.', draft('update_event', { id: 'softball', start: local(26, 13, 0), end: local(26, 15, 0) }, 'Softball → 1:00 PM')),
  ],
  // 06c: which one?, with the change kept.
  which: () => [
    user('Move the game on Saturday to 5'),
    said('There are two games on Saturday. Which one should move to 5:00?', {
      conversationState: {
        activeEntityType: 'calendar_clarification',
        candidateEvents: [
          { id: 'softball', title: 'Softball: Huskies @ RPB Cascade', start: local(26, 12, 30), version: null },
          { id: 'baseball', title: 'Baseball: Huskies @ RPB Cascade', start: local(26, 15, 0), version: null },
        ],
        pendingMutation: { tool: 'update_event', args: { start: local(26, 17, 0), end: local(26, 19, 0) } },
        expectedFollowUp: 'calendar_clarification',
        establishedAt: local(25, 13, 40),
      },
    }),
  ],
  // 06d: an answer that points at the wall and offers the next step.
  answer: () => [
    user('Is anyone driving to softball tomorrow?'),
    said('Yes, Jake drives. Game at 12:30, leave by 11:56.', { conversationState: { activeEntityType: 'event', activeEventId: 'softball', expectedFollowUp: 'event_follow_up', establishedAt: '' } }),
    user('Could Kelly take it instead?'),
    said('Kelly’s free then. Want me to make her the driver for softball? Jake would be off the hook.', { conversationState: { activeEntityType: 'event', activeEventId: 'softball', expectedFollowUp: 'event_follow_up', establishedAt: '' } }),
  ],
}

/** A stand-in for `useAssistantTurn` that plays one scene; sending adds the words to the thread. */
export function fixtureTurn(scene: string): typeof useAssistantTurn {
  return function useFixtureTurn() {
    const [messages, setMessages] = useState<AIMessage[]>(() => BAND_SCENES[scene]?.() ?? [])
    const { question, answer } = latestExchange(messages)
    const pending = pendingAction(messages)
    const setStatus = (id: string, status: NonNullable<AIMessage['toolAction']>['status'], extra: { args?: Record<string, unknown> } = {}) =>
      setMessages((list) => list.map((m) => (m.id === id && m.toolAction ? { ...m, toolAction: { ...m.toolAction, status, ...extra } } : m)))
    return {
      messages,
      loading: false,
      send: async (text: string) => setMessages((list) => [...list, user(text)]),
      session: null,
      question,
      answer,
      pending,
      pointAt: answerEventId(answer),
      confirm: async () => { if (pending) setStatus(pending.id, 'done') },
      cancel: () => { if (pending) setStatus(pending.id, 'cancelled') },
      working: false,
      note: null,
      setNote: () => {},
      forReport: () => ({ messages, seenAt: {}, sessionId: null, previous: null }),
      setPendingArgs: (patch: Record<string, unknown>) => {
        if (pending?.toolAction) setStatus(pending.id, 'pending', { args: { ...pending.toolAction.args, ...patch } })
      },
    } as unknown as ReturnType<typeof useAssistantTurn>
  }
}
