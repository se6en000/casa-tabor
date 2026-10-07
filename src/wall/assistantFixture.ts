import type { VoiceSignal } from './voiceLine'
import type { EmailOffer, EmailReviewData } from './emailReview'
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
  // Not sure which place (Jake, Oct 2: "Go for which one"): the card asks before the yes.
  'which-place': () => [
    user('Kelly to Amped Fitness tomorrow at 9'),
    said('Drafted it. Which Amped Fitness?', draft('create_event', { title: 'Amped Fitness', event_type: 'event', start: local(26, 9, 0), end: local(26, 10, 0), members: ['Kelly'], location: 'Amped Fitness', place_choices: [
      { name: 'Amped Fitness Signature', address: '2771 S Dixie Hwy, West Palm Beach, FL 33405' },
      { name: 'Amped Fitness', address: '3101 PGA Blvd, Palm Beach Gardens, FL 33410' },
    ] }, 'Amped Fitness · Kelly')),
  ],
  // 06b: a change, before → after, previewed on the Score.
  change: () => [
    user('What’s on Saturday?'),
    said('Two games, both at 12:30: softball and baseball.'),
    user('Push the softball back half an hour'),
    said('Moving softball to 1:00.', draft('update_event', { id: 'softball', start: local(26, 13, 0), end: local(26, 15, 0) }, 'Softball → 1:00 PM')),
  ],
  // Adding to something already there, line by line (Jake, Oct 7: "what will actually be added … a confidence thing").
  prep: () => [
    user('For softball tomorrow, add sunscreen, the folding chairs and a cooler with ice'),
    said('Adding three to its get & pack.', draft('add_prep_item', { event_id: 'softball', event_title: 'Softball: Huskies @ RPB Cascade', labels: ['Sunscreen', 'The folding chairs', 'A cooler with ice'], label: 'Sunscreen · The folding chairs · A cooler with ice' }, 'Add to Softball · get & pack: Sunscreen · The folding chairs · A cooler with ice')),
  ],
  'notes-add': () => [
    user('Add to the softball notes: gate opens at 11:45, and park on the grass lot by Field 1'),
    said('Adding that under its notes.', draft('update_event', { id: 'softball', notes_add: ['Gate opens at 11:45', 'Park on the grass lot by Field 1'] }, 'Update Softball')),
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
  // Canvas 25a/c: an answer with a list — tiles under a short lead, on the wall and in the panel.
  snacks: () => [
    user('how about saturday'),
    said('Saturday, October 3: Jake goes to the Green Market at 9:00. At 2:00, Jake, Kelly and Liv have the Huskies game at Olympia Park.'),
    user('what food could I make with a watermelon and some grapes?'),
    said('Three easy ones for a hot afternoon game:\n- Fruit skewers: watermelon cubes and grapes on sticks, easy to grab.\n- Mint-lime fruit salad: watermelon, halved grapes, lime juice and torn mint.\n- Frozen grape cups: grapes frozen overnight, watermelon wedges on the side.'),
  ],
  // Canvas 24c–d: a longer conversation — the latest six turns on the right, the rest behind "↑ 4 earlier".
  long: () => [
    user('What’s on tomorrow?'),
    said('Tomorrow, Saturday: Baseball and Softball at Ferrin Park at 12:30, and Kelly’s birthday.'),
    user('who’s driving Liv?'),
    said('Jake drives both games, leaving at 11:56.'),
    user('ok and Sunday?'),
    said('Nothing planned on Sunday.'),
    user('yea I gotta do that. what else?'),
    said('Today, Friday, September 25, Kelly has Work until 6:30 PM.'),
    user('is anything pressing?'),
    said('Yes, Giselle picks up Emme and Owen at 2:00.'),
    user('nothing on todos or reminders?'),
    said('Two reminders today: Jake has "Pick up Photobook for Liv", and the trash goes out to the street at 8:00. On your to-do list: renew the car registration (due Oct 5), book Owen’s haircut, and three steps on the Halloween project — buy the scuba fins, finish Emme’s jellyfish tentacles, and order the ghost sheet. Kelly’s birthday is tomorrow, so the card and the cake are on the list too, and the photobook pickup closes at 6.'),
  ],
  // Any day (Jake, 2026-09-29): an answer about one far day offers to open it; asked to open it, it opens.
  'open-day': () => [
    user('Show me the events on October 17th'),
    said('Saturday, October 17: Emme’s build night, 6 to 8 PM.', { showDay: { date: '2026-10-17', open: false } }),
  ],
  'open-day-now': () => [
    user('Can you open October 17th for me'),
    said('Here’s Saturday, October 17.', { showDay: { date: '2026-10-17', open: true } }),
  ],
  // Directions (canvas 13c/13d): "Navigate to Alice's house" — the route on the screen.
  directions: () => [
    user('Navigate to Alice’s house'),
    said('Alice’s house is 8255 West Lake Drive in Lake Clark Shores — about 12 minutes from here right now.', { directions: { name: 'Alice', address: '8255 West Lake Drive, Lake Clark Shores, FL 33406', phone: '(561) 555-0101', maps: 'https://www.google.com/maps/dir/?api=1&destination=8255%20West%20Lake%20Drive%2C%20Lake%20Clark%20Shores%2C%20FL%2033406' } }),
  ],
  // A wake-word open with nothing said yet: the small pill (2026-09-30).
  wake: () => [],
  // Casa reads the email (canvas 14c): "Anything from email?" opens the review.
  email: () => [
    user('Anything from email?'),
    said('Three things came in. First, Owen’s teacher.', { emailReview: true }),
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
      send: async (text: string, images?: { dataUrl: string; mimeType: string } | Array<{ dataUrl: string; mimeType: string }>) => {
        // What was sent, for the tests (canvas row 22: typed words and pasted pictures).
        const pics = images ? (Array.isArray(images) ? images : [images]) : []
        const w = window as unknown as { __casaSent?: Array<{ text: string; images: number }> }
        w.__casaSent = [...(w.__casaSent ?? []), { text, images: pics.length }]
        setMessages((list) => [...list, { ...user(text), ...(pics.length ? { imageDataUrls: pics.map((p) => p.dataUrl) } : {}) }])
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
      pointAt: answerEventId(answer) ?? answerEventId(pending ? null : [...allMessages].reverse().find((m) => m.toolAction?.status === 'done') ?? null),
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
          : pending.toolAction?.tool === 'create_event' ? { resultEventId: 'casa-added' } : {}
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
  // `__mic.slow = true`: starting takes a moment (the bridge connecting), until `__mic.ready()`.
  const [connecting, setConnecting] = useState(false)
  const latest = useRef(options)
  useEffect(() => { latest.current = options })
  const mic = (window as unknown as { __mic?: Record<string, unknown> }).__mic ??= { starts: 0 }
  // What the voice line reads (canvas row 17): the room's level, when words last came, a held sentence.
  const signal = useRef<VoiceSignal>({ level: 0, lastWordAt: 0, heldSince: 0, confidence: null, words: [], speechAt: 0 })
  // Held while Casa thinks (`hold`, as the real hook): what's said then doesn't count.
  mic.say = (text: string) => { if (mic.held) return; latest.current.onFinalTranscript(text); latest.current.onFinalTranscript('__SEND__') }
  // Words heard so far, mid-sentence (what shows live while he speaks), with Deepgram's per-word confidence if given.
  mic.hear = (text: string, words?: Array<{ word: string; confidence: number }>, confidence?: number) => {
    Object.assign(signal.current, { lastWordAt: Date.now(), words: words ?? [], confidence: confidence ?? null })
    if (mic.held) return
    latest.current.onInterim(text)
  }
  mic.level = (level: number) => { signal.current.level = level }
  // A voice starting (Deepgram's speech start) at this level, before any words.
  mic.speak = (level: number) => { Object.assign(signal.current, { level, speechAt: Date.now() }) }
  mic.hold = () => { signal.current.heldSince = Date.now() }
  mic.quiet = () => { setListening(false); latest.current.onAutoDismiss?.('wake_silence') }
  mic.noise = () => { setListening(false); latest.current.onAutoDismiss?.('speech_without_transcript') }
  mic.yes = () => latest.current.onConfirm()
  mic.no = () => latest.current.onCancel()
  mic.bye = () => { setListening(false); latest.current.onDismiss() }
  mic.listening = listening
  mic.ready = () => { setConnecting(false); setListening(true) }
  return {
    listening,
    signal,
    bridgeDown: false,
    connecting,
    start: async () => { mic.starts = Number(mic.starts) + 1; if (mic.slow) setConnecting(true); else setListening(true) },
    stop: async () => setListening(false),
    finish: () => { mic.finished = Number(mic.finished ?? 0) + 1; setListening(false) },
    hold: () => { mic.held = true },
    rearm: () => { mic.held = false; mic.rearms = Number(mic.rearms ?? 0) + 1 },
  } as unknown as ReturnType<typeof import('../hooks/useSpeechInput').useSpeechInput>
}

// `?email=1` (canvas row 14): three emails waiting and three it skipped, from the shadow run of 2026-09-30.
export const EMAIL_FIXTURE: EmailReviewData = {
  count: 3,
  offers: [
    { id: 'em-slip', from: 'Rosangela Paine', subject: 'K updates- Permission S.- 9.28.26', received_at: '2026-09-28T13:00:00Z', open: 'https://mail.google.com/mail/#all/em-slip', decision: 'offer', reason: 'Owen’s class needs permission slips signed.', quote: 'Please check your child’s communicator folder for permission slips to sign and return.', offers: [{ kind: 'todo', title: 'Sign Owen’s permission slips (communicator folder)' }], person: null },
    { id: 'em-fee', from: 'SchoolCash Online', subject: 'SchoolCash Online: Item payment reminder', received_at: '2026-09-30T12:00:00Z', open: 'https://mail.google.com/mail/#all/em-fee', decision: 'offer', reason: 'Liv’s $15 debate tournament fee is due Friday.', quote: 'DEBATE CLUB - PBMSFL Tournament #1 $15.00 Oct/02/2026', offers: [{ kind: 'reminder', title: 'Pay $15 for Liv’s debate tournament', date: '2026-10-02' }], person: null },
    { id: 'em-aba', from: 'Towhid Nishat', subject: 'HCBC Collaboration', received_at: '2026-09-29T15:00:00Z', open: 'https://mail.google.com/mail/#all/em-aba', decision: 'person', reason: 'Owen’s ABA therapist asked for your thoughts.', quote: 'I would really value your perspective on what you have been noticing at home.', offers: [], person: { who: 'Towhid Nishat', wants: 'Your thoughts on Owen’s progress at home' } },
  ],
  skipped: [
    { id: 'sk-vet', from: 'West Palm Animal Clinic', subject: 'invoice for Gilbert', received_at: '2026-09-29T12:00:00Z', open: 'x', reason: 'a paid receipt, $0 due' },
    { id: 'sk-att', from: 'AT&T', subject: 'rate plan changes', received_at: '2026-09-29T12:00:00Z', open: 'x', reason: 'a plan change; the bill is on autopay' },
    { id: 'sk-5k', from: 'Palm Beach Public PTO', subject: 'Heroes 5K/Walk', received_at: '2026-09-25T12:00:00Z', open: 'x', reason: 'an optional fundraiser sent to every family' },
  ],
}

// Keep me posted (canvas row 15): Sally Rozanski's three emails of the last week, as the live reader wrote them
// (2026-09-30), and her Showcase email before she was kept — "That one mattered" brings it back as an offer.
const sally = (id: string, day: string, gist: string, tag: string | null, can_add: boolean) => ({ id, from: 'Sally Rozanski', subject: null, received_at: `${day}T14:00:00Z`, open: `https://mail.google.com/mail/#all/${id}`, gist, tag, can_add, kept_by: 'Sally Rozanski', sender: 'sally.rozanski@palmbeachschools.org', decision: can_add ? 'offer' : 'none', reason: null, quote: null, offers: [], person: null })
export const SHOWCASE_OFFER: EmailOffer = { id: 'sk-show', from: 'Sally Rozanski', subject: 'Showcase of Schools 10/6 & Choice Applications', received_at: '2026-09-27T22:01:00Z', open: 'https://mail.google.com/mail/#all/sk-show', decision: 'offer', reason: 'The Showcase of Schools is Oct 6; choice applications close Dec 4.', quote: 'The Showcase of Schools is being held at the South Florida Fairgrounds on Tuesday, October 6, 2026 | from 4 - 8 p.m.', offers: [{ kind: 'event', title: 'Showcase of Schools', date: '2026-10-06', start: '16:00', place: 'South Florida Fairgrounds' }, { kind: 'reminder', title: 'Choice applications close', date: '2026-12-04' }], person: null }
export const EMAIL_SCENES: Record<string, EmailReviewData> = {
  '1': EMAIL_FIXTURE,
  posted: {
    count: 3, offers: [], skipped: [], text_on_wall: true,
    posted: [
      sally('ps-thriller', '2026-09-28', 'Bak Thriller tickets sold out over the weekend', 'News', false),
      sally('ps-show', '2026-09-27', 'Showcase of Schools on Oct 6; Choice Applications open Oct 8 and close Dec 4', 'An event', true),
      sally('ps-yearbook', '2026-09-26', 'Bak 8th grade yearbooks and yearbook ads are available for purchase online', 'An ad', false),
    ],
  },
  // Opened from the count (in life, also by asking "anything from email?").
  ask: {
    count: 2, offers: [], posted: [], text_on_wall: true,
    skipped: [
      { id: 'sk-show', from: 'Sally Rozanski', subject: 'Showcase of Schools 10/6 & choice applications', received_at: '2026-09-27T22:01:00Z', open: 'x', reason: 'news sent to every eighth-grade family' },
      { id: 'sk-quiet', from: 'Mrs. Paine', subject: 'spelling list for next week', received_at: '2026-09-29T12:00:00Z', open: 'x', reason: 'You said Not needed to one like it from Rosangela Paine on Sep 30' },
    ],
  },
  textoff: { ...EMAIL_FIXTURE, text_on_wall: false },
  // Already on the calendar (Jake, Oct 3: PTO's Crazy Hair Day — "can it tell me that … and tell me what it is").
  already: {
    count: 1, posted: [], skipped: [], text_on_wall: true,
    offers: [{ id: 'em-hair', from: 'Sally Rozanski', subject: "Save the Date: PTO's Spirit Day 10/30 - Crazy Hair Day", received_at: '2026-10-02T22:01:06Z', open: 'x', decision: 'offer', reason: 'Crazy Hair Day for Emme and Owen on Oct 30.', quote: null,
      offers: [{ kind: 'event', title: "PTO's Crazy Hair Day", date: '2026-10-30', place: 'Palm Beach Public', people: ['Emme', 'Owen'], existing: { event_id: 'ev-hair', title: "PTO's Crazy Hair Day", adds: { place: 'Palm Beach Public' } } }], person: null }],
  },
}

/** The email scene a fixture page asked for (`?email=1|posted|ask|textoff|already`). */
export function emailScene(): EmailReviewData {
  return EMAIL_SCENES[new URLSearchParams(window.location.search).get('email') ?? '1'] ?? EMAIL_FIXTURE
}

/** A stand-in for the review's answers: recorded on window.__emailAnswers; "That one mattered" on the
 * Showcase brings it back as an offer, as the live reader did. */
export async function fixtureEmailAct(id: string, what: string) {
  const w = window as unknown as { __emailAnswers?: string[] }
  w.__emailAnswers = [...(w.__emailAnswers ?? []), `${id}:${what}`]
  return { ok: true, note: id === 'em-hair' && what === 'add' ? 'Updated PTO’s Crazy Hair Day.' : undefined, offer: id === 'sk-show' && (what === 'keep_posted' || what === 'mattered') ? SHOWCASE_OFFER : null }
}

/** A stand-in for useEmailOffers: the fixture's emails; answers are recorded on window.__emailAnswers. */
export function fixtureEmail() {
  return { data: emailScene(), act: fixtureEmailAct }
}

/** A stand-in for useEmailSettings (Settings › Email, canvas 15e): changes are recorded on window.__emailSettings. */
export function fixtureEmailSettings() {
  return {
    data: {
      keep: [
        { id: 'k1', kind: 'sender' as const, label: 'Sally Rozanski', source: 'mattered', created_at: '2026-09-30T19:00:00Z' },
        { id: 'k2', kind: 'topic' as const, label: 'Anything about Owen’s therapy', source: 'voice', created_at: '2026-09-30T19:05:00Z' },
      ],
      quiet: [{ id: 'q1', from: 'Rosangela Paine', kind: 'todo', since: '2026-09-30T13:00:00Z', skipped: 1 }],
      text_on_wall: true,
    },
    change: async (body: Record<string, unknown>) => {
      const w = window as unknown as { __emailSettings?: Array<Record<string, unknown>> }
      w.__emailSettings = [...(w.__emailSettings ?? []), body]
      return { ok: true }
    },
  }
}
