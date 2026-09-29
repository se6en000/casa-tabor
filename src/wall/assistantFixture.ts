import { useEffect, useRef, useState } from 'react'
import type { AIMessage } from '../hooks/useAISession'
import { answerEventId, latestExchange, pendingAction, withoutAsides } from './assistant'
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
  // 07e: a question still thinking — the tip line shows under it.
  thinking: () => [user('When’s Carl’s birthday again?')],
}

/** A stand-in for `useAssistantTurn` that plays one scene; sending adds the words to the thread. */
export function fixtureTurn(scene: string): typeof useAssistantTurn {
  return function useFixtureTurn() {
    const [allMessages, setMessages] = useState<AIMessage[]>(() => BAND_SCENES[scene]?.() ?? [])
    const { messages, asidesInARow } = withoutAsides(allMessages)
    // Like the real one: a moment of thinking, then an answer (a question gets a plain reply).
    const [loading, setLoading] = useState(scene === 'thinking')
    const [working, setWorking] = useState(false)
    const { question, answer } = latestExchange(messages)
    const pending = pendingAction(messages)
    const setStatus = (id: string, status: NonNullable<AIMessage['toolAction']>['status'], extra: { args?: Record<string, unknown> } = {}) =>
      setMessages((list) => list.map((m) => (m.id === id && m.toolAction ? { ...m, toolAction: { ...m.toolAction, status, ...extra } } : m)))
    return {
      messages,
      asidesInARow,
      loading,
      send: async (text: string) => {
        setMessages((list) => [...list, user(text)])
        setLoading(true)
        await new Promise((resolve) => setTimeout(resolve, 300))
        // "psst …" plays someone in the room talking, not to Casa (an aside).
        setMessages((list) => [...list, /^psst\b/i.test(text) ? { ...said(''), aside: true } : said(`You said: ${text}.`)])
        setLoading(false)
      },
      session: null,
      question,
      answer,
      pending,
      pointAt: answerEventId(answer),
      confirm: async () => {
        if (!pending) return
        setWorking(true)
        await new Promise((resolve) => setTimeout(resolve, 150))
        setStatus(pending.id, 'done')
        setWorking(false)
      },
      cancel: () => { if (pending) setStatus(pending.id, 'cancelled') },
      working,
      note: null,
      setNote: () => {},
      forReport: () => ({ messages, seenAt: {}, sessionId: null, previous: null }),
      setPendingArgs: (patch: Record<string, unknown>) => {
        if (pending?.toolAction) setStatus(pending.id, 'pending', { args: { ...pending.toolAction.args, ...patch } })
      },
    } as unknown as ReturnType<typeof useAssistantTurn>
  }
}

/**
 * A stand-in microphone for the fixture (`useSpeechInput`'s shape): Playwright speaks through
 * `window.__mic` — `hear(text)` is words mid-sentence, `say(text)` hears a sentence, `quiet()` is silence running out, `yes()` /
 * `no()` answer a card — and `window.__mic.starts` counts how often the band opened the mic.
 */
export function useFixtureSpeech(options: Parameters<typeof import('../hooks/useSpeechInput').useSpeechInput>[0]) {
  const [listening, setListening] = useState(false)
  const latest = useRef(options)
  useEffect(() => { latest.current = options })
  const mic = (window as unknown as { __mic?: Record<string, unknown> }).__mic ??= { starts: 0 }
  mic.say = (text: string) => { latest.current.onFinalTranscript(text); latest.current.onFinalTranscript('__SEND__') }
  // Words heard so far, mid-sentence (what shows live while he speaks).
  mic.hear = (text: string) => latest.current.onInterim(text)
  mic.quiet = () => { setListening(false); latest.current.onAutoDismiss?.('wake_silence') }
  mic.yes = () => latest.current.onConfirm()
  mic.no = () => latest.current.onCancel()
  mic.bye = () => { setListening(false); latest.current.onDismiss() }
  mic.listening = listening
  return {
    listening,
    connecting: false,
    start: async () => { mic.starts = Number(mic.starts) + 1; setListening(true) },
    stop: async () => setListening(false),
    finish: () => setListening(false),
  } as unknown as ReturnType<typeof import('../hooks/useSpeechInput').useSpeechInput>
}
