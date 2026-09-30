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

// Plan it with Casa (P3.25; boards 12b–12d): Emme's jellyfish, the second version (a try-on added).
const jellyfish = (withTryOn: boolean) => ({
  id: 'plan',
  title: 'Emme — light-up jellyfish',
  items: [
    { id: 'i1', kind: 'project', title: 'Emme — light-up jellyfish', part_of: 'Halloween costumes', part_of_project_id: 'p-costumes', why: 'Two weekends before Halloween, in case a strand dies.',
      steps: [
        { title: 'Buy the parts', minutes: 30, cost_cents: 4500 },
        { title: 'Build night', minutes: 120, who: 'Jake + Emme', cal_start: '2026-10-17' },
        ...(withTryOn ? [{ title: 'Try it on after dark', minutes: 15, cal_start: '2026-10-25' }] : []),
      ] },
    { id: 'i2', kind: 'tick_step', project_id: 'p-costumes', step_id: 's-ask', title: 'Ask the kids what they want to be', project: 'Halloween costumes', why: 'Emme picked the jellyfish.' },
    { id: 'i3', kind: 'shopping', name: 'Clear dome umbrella' },
    { id: 'i4', kind: 'shopping', name: 'Battery fairy lights, 2 strands' },
    { id: 'i5', kind: 'shopping', name: 'Bubble wrap' },
    { id: 'i6', kind: 'shopping', name: 'Iridescent ribbon' },
    { id: 'i7', kind: 'event', title: 'Trick-or-treat', start: '2026-10-31T18:00:00-04:00', end: '2026-10-31T20:00:00-04:00' },
    { id: 'i8', kind: 'pack', label: 'Spare AA batteries', event_ref: 'i7', event_title: 'Trick-or-treat' },
  ],
})

// Phase 4 (P3.25): Liv's scuba diver replaced by Chucky, and a change to Emme's jellyfish.
const chucky = () => ({
  id: 'plan',
  title: 'Liv is Chucky now',
  items: [
    { id: 'i1', kind: 'close_project', project_id: 'p-scuba', title: 'Liv — scuba diver', reason: 'Changed to Chucky', open_steps: 2 },
    { id: 'i2', kind: 'project', title: 'Liv — Chucky', part_of: 'Halloween costumes', part_of_project_id: 'p-costumes', steps: [{ title: 'Buy denim overalls and a striped shirt', cost_cents: 3500 }, { title: 'Red yarn wig', minutes: 45 }, { title: 'Scar makeup test', cal_start: '2026-10-25' }] },
    { id: 'i3', kind: 'edit_step', project_id: 'p-jelly', step_id: 's-build', project: 'Emme — jellyfish', title: 'Build night', changes: { cal_start: '2026-10-18', who: 'Kelly' } },
    { id: 'i4', kind: 'add_step', project_id: 'p-jelly', project: 'Emme — jellyfish', title: 'Paint the tentacles', after: 'Build night', changes: { minutes: 45 } },
    { id: 'i5', kind: 'remove_step', project_id: 'p-jelly', step_id: 's-fit', project: 'Emme — jellyfish', title: 'Fitting' },
  ],
})

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
  // P3.25 phase 1: a longer think, with the live line of what Casa is looking up.
  'looking-up': () => [user('Let’s talk about the Halloween decorations this year')],
  // Phase 4: a saved project replaced, another changed — one plan.
  'plan-change': () => [
    user('Liv wants to be Chucky now, not a scuba diver. And move Emme’s build night to Sunday, Kelly’s doing it.'),
    said('Here’s the swap, and Emme’s change. The mask you already bought stays on her project.', draft('apply_plan', chucky(), 'Here’s the swap.')),
  ],
  // 12b: the plan beside the conversation, revised in place (the try-on just added).
  plan: () => [
    user('Let’s plan Emme’s Halloween costume.'),
    said('Three builds that stay cool on a warm Halloween night. My pick is the light-up jellyfish.'),
    user('She loved the jellyfish! What do I need, and when do we build it?'),
    said('Here’s the plan. Build it on Saturday the 17th, so there’s a weekend spare if a light strand dies.', draft('apply_plan', jellyfish(false), 'Here’s the plan.', 'cancelled')),
    user('Can we try it on after dark the weekend before?'),
    said('Added a try-on on Sunday the 25th, after dark, to check the lights and the heat.', draft('apply_plan', jellyfish(true), 'Added a try-on on Sunday the 25th.')),
  ],
}

/** A stand-in for `useAssistantTurn` that plays one scene; sending adds the words to the thread. */
export function fixtureTurn(scene: string): typeof useAssistantTurn {
  return function useFixtureTurn() {
    const [allMessages, setMessages] = useState<AIMessage[]>(() => BAND_SCENES[scene]?.() ?? [])
    const { messages, asidesInARow } = withoutAsides(allMessages)
    // Like the real one: a moment of thinking, then an answer (a question gets a plain reply).
    const [loading, setLoading] = useState(scene === 'thinking' || scene === 'looking-up')
    const [working, setWorking] = useState(false)
    const { question, answer } = latestExchange(messages)
    const pending = pendingAction(messages)
    const setStatus = (id: string, status: NonNullable<AIMessage['toolAction']>['status'], extra: { args?: Record<string, unknown> } = {}) =>
      setMessages((list) => list.map((m) => (m.id === id && m.toolAction ? { ...m, toolAction: { ...m.toolAction, status, ...extra } } : m)))
    return {
      messages,
      asidesInARow,
      loading,
      status: loading && scene === 'looking-up' ? 'Searching the web: outdoor Halloween decorations Florida Reddit' : null,
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
      confirm: async (extra?: Record<string, unknown>) => {
        if (!pending) return
        setWorking(true)
        await new Promise((resolve) => setTimeout(resolve, 150))
        // A plan comes back with where each thing landed and its undo deadline (fixed, for the screenshots).
        const plan = pending.toolAction?.tool === 'apply_plan'
          ? { args: { ...pending.toolAction.args, ...extra }, planResult: { plan_id: 'plan-1', undo_until: '2027-01-01T05:00:00Z', links: [
              { id: 'i1', kind: 'project', project_id: 'p-jelly' }, { id: 'i2', kind: 'tick_step', project_id: 'p-costumes' },
              { id: 'i7', kind: 'event', event_id: 'e-trick', start: '2026-10-31T18:00:00-04:00' }, { id: 'i8', kind: 'pack', event_id: 'e-trick' },
            ] } }
          : {}
        setStatus(pending.id, 'done', plan as never)
        setWorking(false)
      },
      undoPlan: async (id: string) => {
        const m = allMessages.find((x) => x.id === id)
        if (m?.toolAction?.planResult) setStatus(id, 'done', { planResult: { ...m.toolAction.planResult, undone: true } } as never)
      },
      agreeAsked: 0,
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
  mic.noise = () => { setListening(false); latest.current.onAutoDismiss?.('speech_without_transcript') }
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
