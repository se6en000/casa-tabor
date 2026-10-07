import { useEffect, useMemo, useRef, useState } from 'react'
import { Bug, Mic, X } from 'lucide-react'
import { useProfileSession } from '../contexts/useProfileSession'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import { buildBugReport, REPORT_CATEGORIES } from './bugReport'
import WallKeyboard from './WallKeyboard'
import WallDirections from './WallDirections'
import { deviceKeyboardHere } from './keyboardMode'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { earcon } from './earcon'
import { useNavigate } from 'react-router-dom'
import { pageAsked } from './pageAsk'
import { CLOSING_FADE_MS } from './led'
import type { FamilyMember } from '../types'
import { useDragDown } from './useSwipeDown'
import VoiceHalo from './VoiceHalo'
import { inkWords, shownWords, type VoiceLineState } from './voiceLine'
import { answerDay, bandAnswer, bandCompact, bandState, cardText, dismissStep, answerShape, exchanges, firstTime, nextStep, tapOutsideCloses, threadTurns, voiceFinal, whichOne, type BandState } from './assistant'
import { assistantCard, replacedAction } from './assistantCard'
import type { DayPlan, WallEvent, WallMember } from './engine/types'
import { pigmentIndexes } from './score'
import { useAssistantTurn } from './useAssistantTurn'
import { createAssistantTraceContext, emitAssistantTrace } from '../lib/assistantTelemetry'
import { routeEta, useDriveMinutes, type DriveLookup } from './useDriveMinutes'
import WallAssistantCard from './WallAssistantCard'
import { WallPlanAgree, WallPlanDraft, WallPlanSaved } from './WallPlan'
import { withDependents, type PlanArgs, type PlanOpen } from './plan'
import { pigmentStyleFor } from './lanes'
import { asksForTips, isNewTip, noteSaid, tipFor, tipsByTopic } from './tips'
import WallTypeLine, { type WallTypeLineHandle } from './WallTypeLine'
import type { TypedImage } from './typeLine'

// The assistant band (boards 03b/03c): a dark band from the bottom. It listens,
// shows what it heard large, answers in a sentence or two, points at the wall,
// and asks for a yes before it changes anything. The whole AI backend is the
// existing one (useAIAssistant, execute-ai-action); only the presentation is new.

/** A safety net only: once there's a conversation it stays until he agrees or closes it (Jake,
 *  2026-09-29: "it's gotta stay open till we either agree or I dismiss it") — this clears the wall
 *  if everyone walked away. */
const ANSWER_IDLE_MS = 15 * 60_000
/** Quiet this long after a plain answer, and the band slips away (8 s was too short to think in; Jake, 2026-09-26). */
const ANSWERED_SILENCE_MS = 20_000
/** Longer while a card, "which one?" or a question back waits for the person. */
const WAITING_SILENCE_MS = 45_000

/** "Open softball" from "Softball: Huskies @ Wellington Knights"; long titles give their first words. */
const shortTitle = (title: string) => {
  const head = title.split(/[:·(—-]/)[0].trim()
  return head.length <= 24 ? head : head.split(' ').slice(0, 3).join(' ')
}

/** Older lines in the conversation column fade (canvas 24c): the newest full, then a step fainter each. */
const FADE = ['opacity-100', 'opacity-90', 'opacity-80', 'opacity-70', 'opacity-60', 'opacity-50']

/** A long answer scrolls in place (canvas 24c), so the buttons and the typing line stay put. */
/**
 * The conversation so far as one page (canvas 45c): down the middle like reading a book, the newest exchange large at
 * the bottom, each older one smaller and fainter above it, fading out at the top; it opens scrolled to now.
 */
function EarlierPage({ earlier, ask, answer }: { earlier: Array<{ ask: string | null; answer: string | null }>; ask: string | null; answer: string | null }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { const el = ref.current; if (el) el.scrollTop = el.scrollHeight }, [earlier.length])
  return (
    <section aria-label="This conversation" ref={ref} className="flex min-w-0 flex-1 touch-pan-y flex-col gap-[18px] overflow-y-auto pr-[200px] [mask-image:linear-gradient(to_bottom,transparent_0,black_18%)]">
      <div className="min-h-[24px] flex-1" />
      {earlier.map((x, i) => {
        const back = earlier.length - i
        return (
          <div key={i} className={`flex flex-col gap-[4px] ${FADE[Math.min(back + 1, FADE.length - 1)]}`}>
            {x.ask && <div className="font-display text-wall-body italic text-wall-night-ink-2">“{x.ask}”</div>}
            {x.answer && <div className="text-wall-detail text-wall-night-ink-2">{x.answer}</div>}
          </div>
        )
      })}
      {(ask || answer) && <div className="h-px shrink-0 bg-wall-night-rule" />}
      {ask && <div className="font-display text-wall-quote font-medium italic">“{ask}”</div>}
      {answer && <div className="text-wall-answer">{answer}</div>}
    </section>
  )
}

function ScrollingAnswer({ text }: { text: string }) {
  const box = useRef<HTMLDivElement>(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const el = box.current
    if (!el) return
    const check = () => setMore(el.scrollHeight - el.scrollTop - el.clientHeight > 4)
    check()
    el.addEventListener('scroll', check)
    return () => el.removeEventListener('scroll', check)
  }, [text])
  return (
    <div className="flex flex-col gap-[6px]">
      <div ref={box} className="max-h-[240px] max-w-[1180px] touch-pan-y overflow-y-auto text-wall-answer">{text}</div>
      {more && <div className="text-wall-label text-wall-night-ink-2">↓ Scroll for the rest</div>}
    </div>
  )
}

export interface WallAssistantBandProps {
  /**
   * On a computer (canvas 22a): the band opens ready to type, with the line at its foot; the mic waits for a click.
   * Defaults to this browser's keyboard (keyboardMode.ts).
   */
  computer?: boolean
  /** Opened by pasting pictures on the wall (22c): they wait in the line, with any words, until sent. */
  staged?: { text: string; images: TypedImage[]; nonce: number } | null
  /** Changes each time the band should (re)start listening: the mic button or the wake word. */
  listenNonce: number
  events: EventWithDetails[]
  family: FamilyMember[]
  onClose: () => void
  /** The calendar item the latest answer is about (the wall outlines it), or null. */
  onPointAt: (eventId: string | null) => void
  onOpenEvent: (eventId: string) => void
  /** The Wall's people and its engine for one day: the card is told from them. */
  members: WallMember[]
  planDay: (date: Date, events: WallEvent[]) => DayPlan | null
  /** The draft or change waiting for a yes, so the Score behind the band can preview it. */
  onDraft: (event: WallEvent | null) => void
  /** The conversation; the screenshot fixture passes a canned one. */
  useTurn?: typeof useAssistantTurn
  /** Drive minutes to a place, arriving at a time; the fixture passes a fixed one. */
  lookupDrive?: DriveLookup
  /** What the LED strip should show for the band (P3.14), and a card's outcome (saved / not). */
  onLed?: (band: { state: BandState; micOpen: boolean; closing?: boolean }) => void
  /** Whether a conversation is going: the wall then holds its idle timers (a project page stays, no calm). */
  onTalking?: (talking: boolean) => void
  onOutcome?: (kind: 'confirm' | 'cancel') => void
  /** The microphone; the screenshot fixture passes a stand-in its tests can speak through. */
  useSpeech?: typeof useSpeechInput
  /** A saved plan's line, opened where it lives (board 12d): a project, an event, To do. */
  onOpenPlace?: (open: PlanOpen) => void
  /** Open a day on the wall (Casa's show_day, or an answer about one day). */
  onOpenDay?: (date: Date) => void
  /** Opened by the wake word: the small "Listening…" pill until words are heard (bandCompact). */
  viaWake?: boolean
  /** Casa opened the email review ("anything from email?"). */
  onOpenEmail?: () => void
  /** Opened with something to say first (a project's "Talk to Casa about it", P3.25). */
  opening?: { text: string; nonce: number } | null
}

export default function WallAssistantBand({ listenNonce, events, family, onClose, onPointAt, onOpenEvent, members, planDay, onDraft, useTurn = useAssistantTurn, lookupDrive = routeEta, useSpeech = useSpeechInput, onLed, onOutcome, onOpenPlace, onOpenDay, onOpenEmail, viaWake = false, opening = null, onTalking, computer = deviceKeyboardHere(), staged = null }: WallAssistantBandProps) {
  const { messages, asidesInARow = 0, loading, status = null, send, question, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs, undoPlan, agreeAsked = 0 } = useTurn({ surface: 'wall', events, family, onSessionEnd: onClose })

  // The card: the action waiting for a yes, told from the wall's engine (boards 06a/06b).
  const action = pending?.toolAction ?? null
  // A new place (an add's, or a change's) needs its drive looked up for leave-by.
  const driveMinutes = useDriveMinutes(action, events, lookupDrive)
  const card = useMemo(
    () => (action ? assistantCard({ tool: action.tool, args: action.args }, replacedAction(messages, pending), { events: events as unknown as WallEvent[], members, planDay, driveMinutes }) : null),
    [action, messages, pending, events, members, planDay, driveMinutes],
  )
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  // Reported when the draft itself changes, not each time the card is rebuilt.
  const draftKey = card ? JSON.stringify(card.event) : ''
  const draftRef = useRef<WallEvent | null>(null)
  draftRef.current = card?.event ?? null
  useEffect(() => onDraft(draftRef.current), [draftKey, onDraft])
  useEffect(() => () => onDraft(null), [onDraft])
  const which = pending ? null : whichOne(answer, events as never)
  const offer = pending || which ? null : nextStep(answer?.streaming ? null : answer)
  // The whole conversation, as said (canvas 24c–d); the column shows the latest few until "↑ N earlier".
  const thread = threadTurns(messages, 60, 1200)
  const [earlierOpen, setEarlierOpen] = useState(false)
  useEffect(() => setEarlierOpen(false), [thread.length])
  // The spotlight (canvas 45b, Jake Oct 5): only the latest on the band; what came before behind "N earlier".
  const earlier = exchanges(thread)
  // Plan it with Casa (P3.25; boards 12b–12d): the plan on screen, its Agree card, and what it saved.
  const planAction = pending?.toolAction?.tool === 'apply_plan' ? pending.toolAction : null
  const plan = planAction ? (planAction.args as unknown as PlanArgs) : null
  const previousPlan = planAction ? ((replacedAction(messages, pending)?.args as unknown as PlanArgs | undefined)?.items ?? null) : null
  const [agreeOpen, setAgreeOpen] = useState(false)
  const [agreeSkip, setAgreeSkip] = useState<string[]>([])
  const [savedFor, setSavedFor] = useState<string | null>(null)
  const savedMessage = savedFor ? messages.find((m) => m.id === savedFor) ?? null : null
  const savedPlan = savedMessage?.toolAction?.planResult ? { plan: savedMessage.toolAction.args as unknown as PlanArgs, result: savedMessage.toolAction.planResult } : null
  const agreeRef = useRef({ open: false, plan: false })
  const agreeSkipRef = useRef<string[]>([])
  agreeSkipRef.current = agreeSkip
  agreeRef.current = { open: agreeOpen, plan: Boolean(plan) }
  const openAgree = () => { setAgreeSkip([]); setAgreeOpen(true) }
  const agree = (skip: string[]) => {
    if (!pending) return
    setSavedFor(pending.id)
    setAgreeOpen(false)
    void confirm({ skip: withDependents(plan?.items ?? [], skip) })
  }
  // "Set it up" said aloud (the server heard a yes): the Agree card, never a save without it.
  const askedRef = useRef(agreeAsked)
  useEffect(() => {
    if (agreeAsked === askedRef.current) return
    askedRef.current = agreeAsked
    openAgree()
  }, [agreeAsked])
  const [interim, setInterim] = useState('')
  const lastTouch = useRef(Date.now())
  const captured = useRef('')
  const stopRef = useRef<() => void>(() => {})

  // ── Bug report (the bug icon): pauses the conversation, asks what went wrong, and sends
  // the whole conversation with it (bugReport.ts). Fields fill by the wall keyboard or by voice.
  const { profile } = useProfileSession()
  const [reporting, setReporting] = useState(false)
  const reportingRef = useRef(false)
  reportingRef.current = reporting
  const [categories, setCategories] = useState<string[]>([])
  const [expected, setExpected] = useState('')
  const [happened, setHappened] = useState('')
  const [typing, setTyping] = useState<'expected' | 'happened' | null>(null)
  const [reportState, setReportState] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle')
  const dictateRef = useRef<'expected' | 'happened' | null>(null)
  const heardRef = useRef('')

  const [relisten, setRelisten] = useState(0)
  // On a computer the mic waits until it's clicked (canvas 22a); from then on it behaves as on the wall.
  const micWanted = useRef(!computer)
  const [micOn, setMicOn] = useState(!computer)
  const typeLine = useRef<WallTypeLineHandle>(null)
  /** "Say more": the mic where talking is the way in; the line, focused, on a computer that hasn't talked. */
  const talkOrType = () => {
    setNote(null)
    if (!micWanted.current) return typeLine.current?.focus()
    captured.current = ''
    void speech.start()
  }
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  // A yes is saving (Jake, Oct 3: "if I confirm a card there seems to be a 4 second hold where she pauses listening"): the
  // mic stays open through the save, and a sentence said meanwhile waits here until it's saved (so "move it to five"
  // finds what was just saved), then goes.
  const workingRef = useRef(false)
  // "Show me the grocery list" (Jake, Oct 3): the page opens at once; the words never go to Casa.
  const navigate = useNavigate()
  const openPage = (said: string) => {
    if (pageAsked(said) !== 'grocery') return false
    stopRef.current()
    onClose()
    navigate('/wall/grocery')
    return true
  }
  const thinkingRef = useRef(false)
  const holdRef = useRef<() => void>(() => {})
  // The follow-up window (Jake, Oct 3: "the fading light part when the listening window is closing"): when it opened,
  // and the light fading over its last seconds.
  const [windowFrom, setWindowFrom] = useState(0)
  const [closingFor, setClosingFor] = useState(0)
  const sessionOpen = useRef(false)
  useEffect(() => { workingRef.current = working }, [working])
  const heldWhileSaving = useRef<string | null>(null)
  // A conversation has started: from here only he closes the band (quiet or noise just turn the mic off).
  const talkingRef = useRef(false)
  talkingRef.current = messages.length > 0
  const asidesRef = useRef(0)
  asidesRef.current = asidesInARow
  // Planning (a plan on screen, or the planning model answering): the mic keeps listening throughout
  // (Jake, 2026-09-29: "it should keep listening the whole time").
  const planningRef = useRef(false)
  planningRef.current = pending?.toolAction?.tool === 'apply_plan' || messages.some((m) => m.planning)
  // Something is waiting on the person: a card, "which one?", or a question back.
  const waitingOnYou = Boolean(pending) || Boolean(which) || /\?\s*$/.test(answer?.content ?? '')

  // Why the mic did what it did (a session that ended, a sentence held for the rest), in the
  // same trace table as the old drawer's, so "it went away while I was thinking" can be traced.
  const voiceTrace = useRef(createAssistantTraceContext({ page: 'wall', lane: 'voice', source: 'wall_band' }))
  const speech = useSpeech({
    onTrace: (event, payload) => emitAssistantTrace(event, voiceTrace.current, { payload: { ...payload, silence_window_ms: waitingOnYou ? WAITING_SILENCE_MS : ANSWERED_SILENCE_MS } }),
    onInterim: (text) => {
      // Casa is thinking: the mic is held (nothing heard now counts), so nothing shows as heard either.
      if (thinkingRef.current) return
      lastTouch.current = Date.now()
      setInterim(text)
    },
    onFinalTranscript: (text) => {
      lastTouch.current = Date.now()
      const step = voiceFinal(captured.current, text)
      captured.current = step.captured
      if (step.captured) heardRef.current = step.captured
      // Dictating into the bug report: the words fill the field, nothing goes to the assistant.
      if (dictateRef.current) {
        const field = dictateRef.current
        if (step.captured) (field === 'expected' ? setExpected : setHappened)(step.captured)
        if (step.toSend) {
          ;(field === 'expected' ? setExpected : setHappened)(step.toSend)
          dictateRef.current = null
          captured.current = ''
          stopRef.current()
        }
        return
      }
      if (step.captured) setInterim(step.captured)
      if (!step.toSend) return
      setInterim('')
      setNote(null)
      // "What can I say?" (Jake, Oct 3: "If I say that then please show me the screen but I dont need a button"): the
      // list, at once, without asking Casa; the mic stays open.
      if (asksForTips(step.toSend)) { setSayOpen(true); return }
      if (openPage(step.toSend)) return
      if (workingRef.current) {
        heldWhileSaving.current = [heldWhileSaving.current, step.toSend].filter(Boolean).join(' ')
        return
      }
      void send(step.toSend)
      // While Casa thinks the mic stays connected but held — nothing heard counts, as with Alexa and Google — so the
      // follow-up window opens the moment the answer lands (Jake, Oct 3), with no reconnecting.
      holdRef.current()
    },
    onDismiss: () => {
      if (!reportingRef.current) onClose()
    },
    // A spoken yes or no to the card: done, and the conversation goes on. A plan's yes opens its
    // Agree card; a yes to the Agree card saves what's ticked.
    onConfirm: () => {
      if (agreeRef.current.plan && !agreeRef.current.open) { stopRef.current(); openAgree(); return }
      if (agreeRef.current.open) { stopRef.current(); agree(agreeSkipRef.current); return }
      // The mic stays open while it saves: no pause, and no reconnecting afterwards.
      void confirm()
    },
    onCancel: () => {
      stopRef.current()
      cancel()
      setRelisten((n) => n + 1)
    },
    hasPendingAction: Boolean(pending),
    autoDismissOnFailure: true,
    // Quiet for a while, or gibberish twice: the mic closes. With nothing said yet (a wake word
    // heard by mistake) the band slips away; once there's a conversation, or a card waiting for a
    // yes, it stays on screen — he carries on with the mic or the wake word, or closes it.
    silenceDismissMs: waitingOnYou ? WAITING_SILENCE_MS : ANSWERED_SILENCE_MS,
    onAutoDismiss: () => {
      // The follow-up window closed: the closing sound (the light has already faded).
      if (sessionOpen.current) { sessionOpen.current = false; earcon('close') }
      if (planningRef.current && !reportingRef.current) { setRelisten((n) => n + 1); return }
      if (pendingRef.current || reportingRef.current || talkingRef.current) return
      onClose()
    },
  })

  stopRef.current = () => void speech.stop()
  useEffect(() => { holdRef.current = () => speech.hold?.() })

  // The band keeps listening (P3.13): once an answer lands (or a yes/no is done), the mic opens
  // again by itself — no wake word for every sentence — until "go away", silence, or gibberish.
  // Two asides in a row (the room is just talking, not to Casa): the mic goes off; the band stays.
  useEffect(() => {
    if (asidesInARow >= 2) stopRef.current()
  }, [asidesInARow])

  const thinking = loading || Boolean(answer?.streaming)
  useEffect(() => {
    thinkingRef.current = thinking
    if (thinking) holdRef.current()
  }, [thinking])
  const busy = thinking || working
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) {
      // Said while the yes was saving: sent now that it's saved.
      const held = heldWhileSaving.current
      heldWhileSaving.current = null
      if (held) { holdRef.current(); void send(held) }
      // The answer landed: a fresh follow-up window, at once (the mic never disconnected).
      // Traced with the mic's phase (Oct 7: "a listening pause between her last question and capturing my response"),
      // so the next real conversation shows which way it went and how long until it listens again.
      else if (speech.listening || speech.connecting) {
        emitAssistantTrace('band_answer_landed', voiceTrace.current, { payload: { phase: speech.phase, path: 'rearm' } })
        speech.rearm?.(); window.setTimeout(() => setWindowFrom(Date.now()), 0)
      } else {
        emitAssistantTrace('band_answer_landed', voiceTrace.current, { payload: { phase: speech.phase, path: 'restart' } })
        window.setTimeout(() => setRelisten((n) => n + 1), 0)
      }
    }
    wasBusy.current = busy
  }, [busy]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    // Not after two asides in a row: the room is talking, so the mic stays off until he wants it.
    if (relisten === 0 || reportingRef.current || asidesRef.current >= 2 || !micWanted.current) return
    // Still open (it stayed open through a save): nothing to reopen.
    if (speech.listening || speech.connecting) return
    captured.current = ''
    void speech.start()
  }, [relisten]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start listening on open, and again each time the mic or wake word asks.
  useEffect(() => {
    lastTouch.current = Date.now()
    setInterim('')
    captured.current = ''
    if (micWanted.current) void speech.start()
  }, [listenNonce]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void speech.stop(), []) // eslint-disable-line react-hooks/exhaustive-deps
  // Opened from a project ("Talk to Casa about it"): its words go first; the mic opens after the answer.
  const openedWith = useRef<number | null>(null)
  useEffect(() => {
    if (!opening || openedWith.current === opening.nonce) return
    openedWith.current = opening.nonce
    stopRef.current()
    void send(opening.text)
  }, [opening]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onPointAt(pointAt), [pointAt, onPointAt])
  // Dismissing without the small button (Jake, 2026-09-30: "if the AI gets tripped … I need a non voice way to
  // quickly dismiss it"): a tap outside, a swipe down, Esc. Each is logged — how, how long it was open, whether
  // any words were heard — so false wake-word trips can be learned from.
  const openedAt = useRef(Date.now())
  const [closeArmedAt, setCloseArmedAt] = useState(0)
  // The pill tapped open (a wake-word open with nothing heard yet).
  const [expanded, setExpanded] = useState(false)
  // A swipe down closes the band (touch and mouse; useDragDown), and so does a tap on its pull tab.
  const dismiss = (how: 'tap_outside' | 'swipe_down' | 'tab' | 'escape') => {
    const waiting = Boolean(pending?.toolAction)
    if (dismissStep({ how, waiting, armedAt: closeArmedAt, now: Date.now() }) === 'arm') {
      setCloseArmedAt(Date.now())
      return
    }
    emitAssistantTrace('wall_band_dismissed', voiceTrace.current, { payload: { how, open_ms: Date.now() - openedAt.current, heard_words: messages.some((m) => m.role === 'user'), waiting, via_wake: viaWake } })
    onClose()
  }
  const { handlers: swipe, dragY } = useDragDown(() => dismiss('swipe_down'))
  useEffect(() => {
    if (!closeArmedAt) return
    const timer = window.setTimeout(() => setCloseArmedAt(0), 4000)
    return () => window.clearTimeout(timer)
  }, [closeArmedAt])
  const dismissRef = useRef(dismiss)
  dismissRef.current = dismiss
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Escape' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA'))) return
      dismissRef.current('escape')
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  // The day the answer is about (Jake, 2026-09-29: "Can you open this day for me"): opened when he
  // asked to see it, else offered as a button.
  const day = answerDay(answer, new Date())
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (answer?.emailReview && onOpenEmail && firstTime(`email:${answer.id}`)) onOpenEmail()
  }, [answer?.id, answer?.emailReview, onOpenEmail])
  useEffect(() => {
    if (!day?.open || !onOpenDay || !answer || openedFor.current === answer.id || !firstTime(`day:${answer.id}`)) return
    openedFor.current = answer.id
    onOpenDay(day.date)
  }, [answer, day?.open, day?.date, onOpenDay])
  useEffect(() => () => onPointAt(null), [onPointAt])

  // The light is the truth (Jake, Oct 3: "if it looks like its listening it actually is"): listening only while the mic
  // really hears and Casa isn't thinking; connecting says "One moment…".
  const live = speech.listening && !thinking
  const state = bandState({ listening: live, loading, answer, pending })
  // Every change of what the band shows, with the mic's phase — to see a gap between an answer and LISTENING.
  useEffect(() => {
    emitAssistantTrace('band_state', voiceTrace.current, { payload: { state, phase: speech.phase } })
  }, [state, speech.phase]) // eslint-disable-line react-hooks/exhaustive-deps
  // Tips while Casa thinks (board 07e): one per question, steady while it thinks; each question
  // asked is counted so a tip retires once that ability is known. "What can I say?" lists them all.
  const [sayOpen, setSayOpen] = useState(false)
  const noted = useRef<string | null>(null)
  useEffect(() => {
    if (!question || noted.current === question) return
    noted.current = question
    noteSaid(question)
    setSayOpen(false)
  }, [question])
  const tip = useMemo(() => (state === 'THINKING' ? tipFor(question ?? null, messages.length) : null), [state, question, messages.length])
  // The quiet line while the mic waits: two seconds of quiet in a window, then one example (each window a different one).
  const [idleFor, setIdleFor] = useState(0)
  useEffect(() => {
    if (!live || interim || !windowFrom) return
    const t = window.setTimeout(() => setIdleFor(windowFrom), 2000)
    return () => window.clearTimeout(t)
  }, [live, interim, windowFrom])
  // Each window a different one, in turn (steady, so a screenshot is the same each time); the screenshot fixture shows it
  // only where a test asks (`?idleTip=1`), since it comes after two seconds of real time.
  const idleTipAllowed = import.meta.env.VITE_VISUAL_TEST_MODE !== 'true' || new URLSearchParams(window.location.search).get('idleTip') === '1'
  const idleTip = idleTipAllowed && live && !interim && !sayOpen && windowFrom > 0 && idleFor === windowFrom ? tipFor(null, messages.length + (windowFrom ? 1 : 0)) : null

  // The LED strip (P3.14): what the band is doing, and a card's outcome as a warm or rust swell.
  const micOpen = live
  const silenceMs = waitingOnYou ? WAITING_SILENCE_MS : ANSWERED_SILENCE_MS
  // A window opens each time the mic goes live; the first of a conversation chimes (as Alexa does at the wake word).
  const wasLive = useRef(false)
  useEffect(() => {
    if (live && !wasLive.current) {
      const t = window.setTimeout(() => setWindowFrom(Date.now()), 0)
      if (!sessionOpen.current) { sessionOpen.current = true; earcon('open') }
      wasLive.current = live
      return () => window.clearTimeout(t)
    }
    wasLive.current = live
  }, [live])
  useEffect(() => {
    if (!live || interim || !windowFrom) return
    const t = window.setTimeout(() => setClosingFor(windowFrom), Math.max(0, windowFrom + silenceMs - CLOSING_FADE_MS - Date.now()))
    return () => window.clearTimeout(t)
  }, [live, interim, windowFrom, silenceMs])
  const closing = live && !interim && windowFrom > 0 && closingFor === windowFrom
  useEffect(() => onLed?.({ state, micOpen, closing }), [state, micOpen, closing, onLed])
  const talking = messages.length > 0
  useEffect(() => { onTalking?.(talking) }, [talking, onTalking])
  useEffect(() => () => onTalking?.(false), [onTalking])
  const lastPending = useRef<string | null>(null)
  useEffect(() => {
    if (pending) {
      lastPending.current = pending.id
      return
    }
    const id = lastPending.current
    lastPending.current = null
    const status = id ? messages.find((m) => m.id === id)?.toolAction?.status : null
    if (status === 'done') onOutcome?.('confirm')
    else if (status === 'cancelled' || status === 'error') onOutcome?.('cancel')
  }, [pending, messages, onOutcome])

  // Slides away a minute after the answer if nobody carries on.
  useEffect(() => {
    if (state !== 'ANSWERED') return
    const timer = window.setInterval(() => {
      // Never while a bug report is being written (typing on the wall keyboard doesn't count as a touch here).
      if (Date.now() - lastTouch.current > ANSWER_IDLE_MS && !reportingRef.current) onClose()
    }, 5_000)
    return () => window.clearInterval(timer)
  }, [state, onClose])

  // The listener (canvas row 17; Jake, Oct 6: "i like it its good and decided" — the switch is gone): the wake word
  // left off the words shown (it sat there, then vanished — one more jump).
  const liveText = interim ? shownWords(interim) : interim
  const shownQuestion = speech.listening && liveText ? liveText : question
  // Timing: when the words are on screen (the bridge logs it beside Deepgram's own times).
  useEffect(() => {
    if (!interim) return
    const frame = requestAnimationFrame(() => speech.mark?.('shown', interim))
    return () => cancelAnimationFrame(frame)
  }, [interim]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveWords = speech.listening && liveText ? inkWords(liveText, speech.signal?.current.words ?? []) : null
  const quote = (text: string) => (liveWords
    ? <>“{liveWords.map((w, i) => <span key={i} className={w.faded ? 'opacity-40' : undefined}>{i > 0 ? ' ' : ''}{w.text}</span>)}”</>
    : `“${text}”`)
  // Take two of row 17 (Jake: "too busy … do something similar with something smaller, like the mic"): a halo
  // behind the mic that swells with your voice; a few states leave a short note under it.
  const [haloState, setHaloState] = useState<VoiceLineState>('off')
  const voiceHalo = (
    <VoiceHalo
      signal={speech.signal}
      micOpen={micOpen}
      closingSince={closing ? windowFrom + silenceMs - CLOSING_FADE_MS : null}
      bridgeDown={Boolean(speech.bridgeDown)}
      thinking={loading}
      needsYes={state === 'NEEDS A YES'}
      heard={speech.listening ? liveText : ''}
      onState={setHaloState}
    />
  )
  const haloNote = haloState === 'fuse' ? 'Waiting for the rest —\ntap the mic to send'
      // No "It's loud in here" (Jake, Oct 5: it showed "when it's pretty quiet" — a fan or the room is enough to set it off).
        : haloState === 'deaf' ? 'Can’t hear the mic —\ntap to try again'
          // Nothing for the halo to say: the usual line under the mic ("Keep talking, or …", "Go ahead").
          : null
  const answerText = useMemo(() => (answer?.content ? bandAnswer(answer.content, 1500) : ''), [answer?.content])
  // A list in the answer shows as tiles under a short lead (canvas 25a).
  const shape = useMemo(() => (answer?.content ? answerShape(answer.content) : null), [answer?.content])
  // An earlier line opened in full (each is cut to two lines; canvas 25a).
  // The panel on a computer (canvas 25c): its conversation keeps the newest in view.
  const panelScroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = panelScroll.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages.length, loading, pending?.id, interim])
  const pill = 'h-[56px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[28px] text-wall-detail font-semibold text-wall-on-pigment'
  const lightPill = 'h-[56px] rounded-full border-0 bg-wall-on-pigment px-[28px] text-wall-detail font-semibold text-wall-ink'

  const openReport = () => {
    lastTouch.current = Date.now()
    // Before stopping the mic: stopping with no question asked is the band's "close" path.
    reportingRef.current = true
    setReporting(true)
    stopRef.current()
    setReportState('idle')
  }
  const submitReport = async () => {
    setReportState('sending')
    const conversation = forReport()
    const report = buildBugReport({
      messages: conversation.messages,
      seenAt: conversation.seenAt,
      sessionId: conversation.sessionId,
      heard: heardRef.current,
      categories,
      expected,
      happened,
      context: {
        surface: 'wall',
        build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
        viewer: profile?.memberName ?? null,
        at: new Date().toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        utcOffset: -new Date().getTimezoneOffset(),
        screen: `${window.innerWidth}x${window.innerHeight}`,
        bandState: state,
        pointAt: pointAt ?? null,
        pendingTool: pending?.toolAction?.tool ?? null,
        loading,
        online: navigator.onLine,
        messageCount: conversation.messages.length,
        previousConversation: conversation.previous,
      },
    })
    try {
      await sendBugReport(report)
      setReportState('sent')
      window.setTimeout(() => {
        setReporting(false)
        setCategories([])
        setExpected('')
        setHappened('')
      }, 2500)
    } catch {
      setReportState('failed')
    }
  }
  const dictate = (field: 'expected' | 'happened') => {
    setTyping(null)
    dictateRef.current = field
    captured.current = ''
    void speech.start()
  }

  if (reporting) {
    const field = (key: 'expected' | 'happened', label: string, value: string) => (
      <div className="flex flex-col gap-[8px]">
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">{label}</div>
        <div className="flex items-center gap-[12px]">
          <button
            type="button"
            onClick={() => { dictateRef.current = null; setTyping(key) }}
            className={`flex h-[64px] min-w-0 flex-1 items-center rounded-[16px] border border-solid bg-transparent px-[22px] text-left text-wall-body text-wall-on-pigment ${typing === key || dictateRef.current === key ? 'border-wall-night-brass' : 'border-wall-ink-2'}`}
          >
            <span className="truncate">{value || (dictateRef.current === key ? 'Listening…' : 'Tap to type')}</span>
          </button>
          <button type="button" aria-label={`Say it: ${label.toLowerCase()}`} onClick={() => dictate(key)} className="flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full border-2 border-solid border-wall-night-brass bg-transparent p-0 text-wall-night-brass">
            <Mic size={26} />
          </button>
        </div>
      </div>
    )
    return (
      <>
        <section
          aria-label="Report a problem"
          className={`absolute left-0 z-10 flex w-[1920px] flex-col gap-[20px] rounded-t-[32px] bg-wall-ink px-[64px] py-[40px] font-body text-wall-on-pigment ${typing && !computer ? 'bottom-[430px] rounded-b-[32px]' : 'bottom-0'}`}
          onClick={(event) => {
            event.stopPropagation()
            lastTouch.current = Date.now()
          }}
        >
          <div className="flex items-baseline justify-between">
            <div className="font-display text-wall-quote font-medium italic">What went wrong?</div>
            <div className="text-wall-label text-wall-night-ink-2">The whole conversation goes with it, with the time.</div>
          </div>
          <div className="flex flex-wrap gap-[10px]">
            {REPORT_CATEGORIES.map((c) => {
              const on = categories.includes(c)
              return (
                <button key={c} type="button" aria-pressed={on} onClick={() => setCategories((list) => (on ? list.filter((x) => x !== c) : [...list, c]))} className={`h-[52px] rounded-full px-[22px] text-wall-detail font-semibold ${on ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-on-pigment'}`}>
                  {c}
                </button>
              )
            })}
          </div>
          {!typing || typing === 'expected' ? field('expected', 'WHAT DID YOU EXPECT?', expected) : null}
          {!typing || typing === 'happened' ? field('happened', 'WHAT HAPPENED INSTEAD?', happened) : null}
          <div className="flex items-center gap-[14px]">
            <button type="button" disabled={reportState === 'sending' || reportState === 'sent'} onClick={() => void submitReport()} className="h-[56px] rounded-full border-0 bg-wall-on-pigment px-[28px] text-wall-detail font-semibold text-wall-ink">
              {reportState === 'sending' ? 'Sending…' : reportState === 'sent' ? 'Sent' : 'Send report'}
            </button>
            <button type="button" onClick={() => { setReporting(false); setTyping(null); dictateRef.current = null }} className="h-[56px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[28px] text-wall-detail font-semibold text-wall-on-pigment">
              Back to the conversation
            </button>
            {reportState === 'sent' && <span className="text-wall-body text-wall-night-brass">Thank you — sent with the whole conversation.</span>}
            {reportState === 'failed' && <span className="text-wall-body text-wall-night-rust">That didn’t send. Try again in a moment.</span>}
          </div>
        </section>
        {typing && (
          <WallKeyboard
            key={typing}
            value={typing === 'expected' ? expected : happened}
            onChange={(v) => (typing === 'expected' ? setExpected(v) : setHappened(v))}
            onDone={() => setTyping(null)}
          />
        )}
      </>
    )
  }

  // On a computer, Casa is a panel down the right, beside the day (canvas 25c–d; Jake, 2026-10-01: "on the desktop as a
  // panel"): one conversation, newest at the bottom; type, paste or drop pictures, or click the mic.
  if (computer) {
    const convo = messages.filter((m) => m.content.trim() || m.imageDataUrls?.length)
    const lastAnswerId = [...convo].reverse().find((m) => m.role === 'assistant')?.id
    // Quiet, warm and brass (Jake, Oct 3: "seems a bit square and not restoration hardware subtle elegant"): outlined
    // pills, the first in brass.
    const smallPill = 'h-[46px] rounded-full border border-solid border-wall-night-ink-2/40 bg-transparent px-[20px] text-wall-detail font-medium text-wall-night-ink'
    const smallLight = 'h-[46px] rounded-full border border-solid border-wall-night-brass/70 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-night-brass'
    return (
      <>
        <section
          aria-label="Assistant"
          onClick={(event) => { event.stopPropagation(); lastTouch.current = Date.now() }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void typeLine.current?.addFiles(Array.from(e.dataTransfer.files)) }}
          className="absolute bottom-[24px] right-[24px] top-[24px] z-30 flex w-[620px] flex-col overflow-hidden rounded-[28px] border border-solid border-wall-night-brass/20 bg-wall-band font-body text-wall-on-pigment shadow-[0_24px_70px] shadow-wall-night-ground/50"
        >
          <div className="flex items-center gap-[16px] px-[32px] pb-[20px] pt-[28px]">
            <button
              type="button"
              aria-label={speech.listening ? 'Stop listening' : 'Talk'}
              onClick={() => { micWanted.current = true; setMicOn(true); if (speech.listening) speech.finish(); else { captured.current = ''; void speech.start() } }}
              className={`flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-night-brass/70 p-0 ${state === 'LISTENING' ? 'bg-wall-night-brass text-wall-ink' : 'bg-transparent text-wall-night-brass'}`}
            >
              <Mic size={21} />
            </button>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-display text-wall-date font-semibold leading-none">Ask</span>
              <span className="mt-[6px] truncate text-wall-label font-semibold uppercase tracking-[0.18em] text-wall-night-brass/80">
                {state === 'LISTENING' ? 'Listening' : state === 'THINKING' ? (status ?? 'Thinking') : state === 'NEEDS A YES' ? 'Needs a yes' : 'Type, or talk'}
              </span>
            </span>
            <button type="button" aria-label="Report a problem" onClick={openReport} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-night-ink-2/70"><Bug size={19} /></button>
            <button type="button" aria-label="Close the conversation" onClick={onClose} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border border-solid border-wall-night-ink-2/30 bg-transparent p-0 text-wall-night-ink"><X size={19} /></button>
          </div>
          <div aria-hidden="true" className="mx-[32px] h-px bg-wall-night-brass/20" />
          <div ref={panelScroll} className="flex min-h-0 flex-1 touch-pan-y flex-col gap-[18px] overflow-y-auto px-[32px] py-[26px] text-wall-body leading-[1.45]">
            <div className="mt-auto" />
            {sayOpen ? (
              // "What can I say?" (said or typed): the list, here too; a tap closes it.
              <button type="button" aria-label="What can I say — tap to close" onClick={() => setSayOpen(false)} className="flex flex-col gap-[18px] border-0 bg-transparent p-0 text-left">
                <span className="text-wall-label font-semibold uppercase tracking-[0.18em] text-wall-night-ink-2/70">What can I say · say it any way you like</span>
                {tipsByTopic().map((g) => (
                  <span key={g.topic} className="flex flex-col gap-[6px]">
                    <span className="text-wall-label font-bold uppercase tracking-[0.18em] text-wall-night-brass">{g.topic}</span>
                    {g.tips.map((t) => (
                      <span key={t.id} className="text-wall-detail text-wall-night-ink-2">
                        {t.text}
                        {isNewTip(t) && <span className="ml-[8px] text-wall-label font-bold tracking-[0.14em] text-wall-night-brass">NEW</span>}
                      </span>
                    ))}
                  </span>
                ))}
              </button>
            ) : null}
            {!sayOpen && convo.length === 0 && !interim && (
              <div className="flex flex-col gap-[10px]">
                <span className="font-display text-wall-date italic text-wall-night-ink">Ask about the day, or tell me what’s changed.</span>
                <span className="text-wall-detail text-wall-night-ink-2/70">Tip: {tipFor(null, 0)}</span>
              </div>
            )}
            {!sayOpen && convo.map((m) => {
              if (m.role === 'user') {
                // What you said, as the band shows it: in your words, in italic serif, on the right — no bubble.
                return (
                  <div key={m.id} className="flex max-w-[500px] flex-col items-end gap-[8px] self-end text-right">
                    {m.imageDataUrls && m.imageDataUrls.length > 0 && (
                      <span className="flex flex-wrap justify-end gap-[8px]">{m.imageDataUrls.map((src, j) => <img key={j} src={src} alt="" className="h-[64px] w-[88px] rounded-[10px] object-cover" />)}</span>
                    )}
                    {m.content.trim() && <span className="font-display text-wall-date italic leading-[1.2] text-wall-night-ink">“{m.content.trim()}”</span>}
                  </div>
                )
              }
              const shaped = m.id === lastAnswerId ? answerShape(m.content) : null
              if (shaped && shaped.items.length > 0) {
                return (
                  <div key={m.id} className="flex flex-col gap-[10px]">
                    {shaped.lead && <div>{shaped.lead}</div>}
                    {shaped.items.map((item) => (
                      <div key={item.title} className="flex flex-col gap-[4px] rounded-[18px] border border-solid border-wall-night-brass/25 bg-wall-on-pigment/[0.04] px-[20px] py-[16px] text-wall-night-ink">
                        <span className="font-display text-wall-heading font-semibold leading-tight">{item.title}</span>
                        {item.detail && <span className="text-wall-detail text-wall-night-ink-2">{item.detail}</span>}
                      </div>
                    ))}
                    {shaped.tail && <div className="text-wall-night-ink-2">{shaped.tail}</div>}
                  </div>
                )
              }
              return <div key={m.id} className={m.id === lastAnswerId ? 'text-wall-on-pigment' : 'text-wall-detail text-wall-night-ink-2/80'}>{bandAnswer(m.content, 2000)}</div>
            })}
            {speech.listening && liveText && <div className="max-w-[500px] self-end text-right font-display text-wall-date italic leading-[1.2] text-wall-night-ink-2">“{liveText}”</div>}
            {loading && <div className="text-wall-night-ink-2">{status ?? 'Thinking…'}</div>}
            {plan ? (
              <WallPlanDraft plan={plan} previous={previousPlan} working={working} onSetUp={openAgree} onKeepTalking={talkOrType} />
            ) : card ? (
              <WallAssistantCard
                card={card}
                members={members}
                pigmentOf={(id) => pigments.get(id) ?? null}
                working={working}
                onYes={() => void confirm()}
                onChange={talkOrType}
                onNo={cancel}
                onPickDriver={card.kind === 'change' ? (name) => setPendingArgs({ driver_name: name }) : undefined}
              />
            ) : pending?.toolAction ? (
              <div className="flex flex-col gap-[12px] rounded-[18px] bg-wall-on-pigment px-[20px] py-[18px] text-wall-ink">
                <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">DRAFT · NOT SAVED YET</div>
                <div className="whitespace-pre-line font-display text-wall-heading font-semibold">{cardText(pending.toolAction.displayText)}</div>
                <div className="flex gap-[10px]">
                  <button type="button" disabled={working} onClick={() => void confirm()} className="h-[48px] rounded-full border-0 bg-wall-ink px-[22px] text-wall-detail font-semibold text-wall-on-pigment">{working ? 'Saving…' : 'Yes, do it'}</button>
                  <button type="button" disabled={working} onClick={cancel} className="h-[48px] rounded-full border border-solid border-wall-rule bg-transparent px-[22px] text-wall-detail font-semibold text-wall-ink">No</button>
                </div>
              </div>
            ) : null}
            {which && (
              <div className="flex flex-col gap-[10px]">
                {which.choices.slice(0, 3).map((c) => (
                  <button key={c.id} type="button" disabled={loading} onClick={() => { setNote(null); void send(c.say) }} className="flex flex-col gap-[4px] rounded-[16px] border-0 bg-wall-on-pigment px-[18px] py-[14px] text-left text-wall-ink">
                    <span className="text-wall-label font-bold tracking-[0.12em] text-wall-ink-2">{c.when}</span>
                    <span className="font-display text-wall-heading font-semibold leading-tight">{c.title}</span>
                  </button>
                ))}
                <button type="button" className={`${smallPill} self-start`} onClick={() => void send('Never mind')}>Neither — never mind</button>
              </div>
            )}
            {note && <div className="text-wall-night-brass">{note}</div>}
            {!pending && !which && !loading && (offer || (pointAt && events.some((e) => e.id === pointAt)) || (day && onOpenDay)) && (
              <div className="flex flex-wrap gap-[10px]">
                {offer && <button type="button" className={smallLight} disabled={loading} onClick={() => { setNote(null); void send(offer.say) }}>{offer.label}</button>}
                {pointAt && events.some((e) => e.id === pointAt) && <button type="button" className={offer ? smallPill : smallLight} onClick={() => onOpenEvent(pointAt)}>Open {shortTitle(events.find((e) => e.id === pointAt)?.title ?? '') || 'it'}</button>}
                {day && onOpenDay && <button type="button" className={smallPill} onClick={() => onOpenDay(day.date)}>Open {day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</button>}
              </div>
            )}
            {answer?.directions && <WallDirections route={answer.directions} computer />}
          </div>
          <div aria-hidden="true" className="mx-[32px] h-px bg-wall-night-brass/20" />
          <div className="px-[28px] pb-[26px] pt-[18px]">
            <WallTypeLine
              quiet
              key={staged?.nonce ?? 0}
              ref={typeLine}
              charsPerLine={36}
              placeholder="Type, or paste"
              busy={busy}
              initialText={staged?.text ?? ''}
              initialImages={staged?.images ?? []}
              onSend={(text, images) => {
                if (!images.length && asksForTips(text)) { setSayOpen(true); return }
                if (!images.length && openPage(text)) return
                stopRef.current()
                setNote(null)
                void send(text, images.length ? images.map(({ dataUrl, mimeType }) => ({ dataUrl, mimeType })) : undefined)
              }}
            />
          </div>
        </section>
        {agreeOpen && plan && (
          <WallPlanAgree plan={plan} skip={agreeSkip} working={working}
            onToggle={(id) => setAgreeSkip((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
            onAgree={() => agree(agreeSkip)} onBack={() => setAgreeOpen(false)} />
        )}
        {savedPlan && (
          <WallPlanSaved plan={savedPlan.plan} result={savedPlan.result} working={working}
            onOpen={onOpenPlace && ((open) => { setSavedFor(null); onOpenPlace(open) })}
            onUndo={() => void undoPlan?.(savedFor!)} onDone={() => setSavedFor(null)} />
        )}
      </>
    )
  }

  // A questionable trigger barely touches the screen (2026-09-30): the pill, until words are heard.
  if (bandCompact({ viaWake, heard: interim, messages: messages.length, expanded })) {
    return (
      <>
        <button type="button" aria-label="Close the conversation" onClick={() => dismiss('tap_outside')} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
        <section aria-label="Assistant" className="absolute bottom-[36px] left-1/2 z-30 flex -translate-x-1/2 items-center gap-[18px] rounded-full bg-wall-band py-[12px] pl-[14px] pr-[14px] font-body text-wall-on-pigment shadow-[0_12px_36px] shadow-wall-night-ground/50">
          <span aria-hidden="true" className="flex h-[64px] w-[64px] items-center justify-center rounded-full border-2 border-solid border-wall-night-brass text-wall-night-brass"><Mic size={28} /></span>
          <span className="text-wall-body font-semibold">Listening…</span>
          <button type="button" onClick={() => setExpanded(true)} className="h-[56px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-detail font-semibold text-wall-on-pigment">Open</button>
          <button type="button" onClick={() => dismiss('tap_outside')} className="h-[56px] rounded-full border-0 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-night-ink-2">Not now</button>
        </section>
      </>
    )
  }

  return (
    <>
    {/* Before anything's said, anywhere outside the band closes it (an accidental wake). Once there's a
        conversation, a tap reaches the screen underneath — he works on the project while talking. */}
    {tapOutsideCloses(messages.length) && <button type="button" aria-label="Close the conversation" onClick={() => dismiss('tap_outside')} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />}
    <section
      aria-label="Assistant"
      {...swipe}
      className={`absolute bottom-0 left-0 z-30 flex min-h-[430px] w-[1920px] touch-none gap-[56px] rounded-t-[32px] bg-wall-band px-[64px] pt-[44px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60 pb-[44px] ${dragY ? '' : 'transition-transform duration-200 ease-out'}`}
      // It follows the hand down, and springs back if let go early (canvas 37a-3).
      style={dragY ? { transform: `translateY(${dragY}px)` } : undefined}
      onClick={(event) => {
        event.stopPropagation()
        lastTouch.current = Date.now()
      }}
    >
      {closeArmedAt > 0 && (
        <div role="status" className="absolute left-1/2 top-[-64px] -translate-x-1/2 whitespace-nowrap rounded-full bg-wall-ink px-[24px] py-[10px] text-wall-detail font-semibold text-wall-on-pigment">
          Tap again to close — the card isn’t saved.
        </div>
      )}
      {/* The top edge: always a brass line, so the band never blends into the calendar; it
          breathes while Casa listens and a light sweeps across it while Casa thinks. */}
      <div aria-hidden="true" className="pointer-events-none absolute left-[32px] right-[32px] top-0 h-[6px] overflow-hidden rounded-b-full">
        <div className="h-[3px] w-full bg-wall-night-brass/70" />
      </div>
      {/* The pull tab (canvas 37a-3; Jake, Oct 3: "a 'tab' on it so it makes sense that you can close it by dragging" —
          "more of a pull down vs pull up"): hanging from the brass edge, the chevron pointing the way it goes. Pull it
          (or anywhere on the band) down to close; a tap on it closes too. */}
      <button
        type="button"
        aria-label="Close the conversation — or pull down"
        onClick={(event) => { event.stopPropagation(); dismiss('tab') }}
        // The grabber (canvas 43a, Jake Oct 5: the tab was "too big and kind of attention getting"): a short soft brass
        // bar like the top of an iPhone sheet; the touch area stays 140 × 44.
        className="absolute left-1/2 top-0 flex h-[44px] w-[140px] -translate-x-1/2 cursor-grab items-start justify-center border-0 bg-transparent p-0 pt-[10px] active:cursor-grabbing"
      >
        <span aria-hidden="true" className="block h-[5px] w-[72px] rounded-full bg-wall-night-brass/50" />
      </button>
      <div className="flex w-[200px] shrink-0 flex-col items-center gap-[16px]">
        <div data-listener={haloState} className="relative flex h-[132px] w-[132px] items-center justify-center">
          {/* The new listener: a halo behind the mic that swells with your voice (canvas row 17, take two). */}
          {voiceHalo}
          {/* Thinking: Casa's turn — an open ring with a brass arc going round it. */}
          {state === 'THINKING' && (
            <span aria-hidden="true" className="absolute -inset-[14px] animate-[wall-think-spin_1.2s_linear_infinite] rounded-full border-[4px] border-solid border-transparent border-t-wall-night-brass border-r-wall-night-brass" />
          )}
          <button
            type="button"
            aria-label={speech.listening ? 'Stop listening' : 'Talk'}
            onClick={() => { micWanted.current = true; setMicOn(true); if (speech.listening) speech.finish(); else { captured.current = ''; void speech.start() } }}
            className={`relative flex h-[132px] w-[132px] items-center justify-center rounded-full border-2 border-solid p-0 ${haloState === 'deaf' ? 'border-wall-night-rust bg-transparent text-wall-night-rust' : state === 'LISTENING' ? 'border-wall-night-brass bg-wall-night-brass text-wall-ink' : 'border-wall-night-brass bg-transparent text-wall-night-brass'}`}
          >
            <Mic size={44} strokeWidth={state === 'LISTENING' ? 2 : 1.6} />
          </button>
        </div>
        {state !== 'LISTENING' && (
          <div className={`font-bold tracking-[0.2em] text-wall-night-brass ${state === 'THINKING' ? 'text-wall-heading' : 'text-wall-label'}`}>{state}</div>
        )}
        <div className="whitespace-pre-line text-center text-wall-label text-wall-night-ink-2">
          {state === 'NEEDS A YES'
            ? 'Say yes, or change\nanything on it'
            : state === 'THINKING'
              ? (tip ? `Try: ${tip}` : '') // the ring and THINKING say it; a tip, if any, sits here — the one place for tips (Jake, Oct 5)
              : state === 'LISTENING' && idleTip
                ? `Try: ${idleTip}` // the quiet example, under the mic (Jake, Oct 5: "put the tips there")
              : state === 'LISTENING' && haloNote != null
                ? haloNote // the halo says the rest (canvas row 17)
              : state === 'LISTENING' && question
                ? 'Keep talking, or\nsay “that’s all”'
                : state === 'LISTENING'
                  ? 'Go ahead'
                  : !micOn
                    ? 'Type, or click\nthe mic to talk'
                    : 'Say the wake word,\nor tap the mic'}
        </div>
      </div>

      {/* Quiet, but always there when things go awry. */}
      <button type="button" aria-label="Report a problem" onClick={openReport} className="absolute right-[40px] top-[36px] flex h-[48px] w-[48px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-night-ink-2">
        <Bug size={22} />
      </button>
      {/* "N earlier" (45b): the conversation so far, as a page (45c). */}
      {earlier.length > 0 && (
        <button type="button" onClick={() => setEarlierOpen((o) => !o)} className="absolute right-[104px] top-[36px] z-10 flex h-[48px] items-center gap-[10px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-night-ink-2">
          {earlierOpen ? 'Back to now' : <>{earlier.length} earlier <span className="text-wall-night-brass">›</span></>}
        </button>
      )}
      {(card || plan) && !earlierOpen && (
        // With a card in the middle, what was just said sits on the right.
        <div className="order-last flex w-[520px] shrink-0 flex-col gap-[14px] pt-[64px]">
          {shownQuestion && <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">YOU JUST SAID</div>}
          {shownQuestion && <div className="font-display text-wall-quote font-medium italic">{quote(shownQuestion)}</div>}
          {answerText && <div className="text-wall-body text-wall-night-ink-2">{answerText}</div>}
        </div>
      )}

      {earlierOpen ? (
        <EarlierPage earlier={earlier} ask={shownQuestion} answer={answerText} />
      ) : plan ? (
        <div className="flex min-w-0 flex-1 flex-col gap-[14px] pr-[64px]">
          <WallPlanDraft plan={plan} previous={previousPlan} working={working}
            onSetUp={openAgree}
            onKeepTalking={talkOrType} />
          {note && <div className="text-wall-body text-wall-night-brass">{note}</div>}
        </div>
      ) : card ? (
        <div className="flex min-w-0 flex-1 flex-col gap-[14px] pr-[64px]">
          <WallAssistantCard
            card={card}
            members={members}
            pigmentOf={(id) => pigments.get(id) ?? null}
            working={working}
            onYes={() => void confirm()}
            onChange={talkOrType}
            onNo={cancel}
            onPickDriver={card.kind === 'change' ? (name) => setPendingArgs({ driver_name: name }) : undefined}
          />
          {note && <div className="text-wall-body text-wall-night-brass">{note}</div>}
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] pr-[64px]">
        {/* No button for the list (Jake, Oct 3): saying "what can I say?" opens it; a tap, or the next question, closes it. */}
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">{sayOpen ? 'WHAT CAN I SAY? · SAY IT ANY WAY YOU LIKE · TAP TO CLOSE' : shownQuestion ? (thread.length > 0 ? 'YOU JUST ASKED' : 'YOU ASKED') : !micOn && state !== 'LISTENING' ? 'TYPE OR PASTE' : ''}</div>
        {sayOpen ? (
          <button type="button" aria-label="What can I say — tap to close" onClick={() => setSayOpen(false)} className="grid grid-cols-5 gap-x-[28px] gap-y-[22px] border-0 bg-transparent p-0 text-left">
            {tipsByTopic().map((g) => (
              <span key={g.topic} className="flex flex-col gap-[8px]">
                <span className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{g.topic.toUpperCase()}</span>
                {g.tips.map((t) => (
                  <span key={t.id} className="text-wall-detail text-wall-night-ink-2">
                    {t.text}
                    {isNewTip(t) && <span className="ml-[8px] text-wall-label font-bold tracking-[0.14em] text-wall-night-brass">NEW</span>}
                  </span>
                ))}
              </span>
            ))}
          </button>
        ) : (
        <>
        <div className="font-display text-wall-quote font-medium italic">
          {shownQuestion ? quote(shownQuestion) : state === 'LISTENING' ? 'Go ahead.' : speech.connecting && !thinking ? 'One moment…' : !micOn ? 'Type below, or paste a message or pictures.' : 'Say “Alexa”, or tap the mic.'}
        </div>
        {shape && shape.items.length > 0 ? (
          <div className="flex flex-col gap-[16px]">
            {shape.lead && <div className="max-w-[1180px] text-wall-answer">{shape.lead}</div>}
            <div className={`grid gap-[18px] ${shape.items.length === 4 ? 'grid-cols-4' : shape.items.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
              {shape.items.map((item) => (
                <div key={item.title} className="flex flex-col gap-[8px] rounded-[20px] bg-wall-on-pigment px-[22px] py-[20px] text-wall-ink">
                  <span className="font-display text-wall-heading font-bold leading-tight">{item.title}</span>
                  {item.detail && <span className="line-clamp-3 text-wall-detail text-wall-ink-2">{item.detail}</span>}
                </div>
              ))}
            </div>
            {shape.tail && <div className="text-wall-body text-wall-night-ink-2">{shape.tail}</div>}
          </div>
        ) : answerText && <ScrollingAnswer text={answerText} />}
        {answer?.directions && <WallDirections route={answer.directions} computer={deviceKeyboardHere()} />}

        {which && (
          <div className="flex flex-col gap-[16px]">
            <div className="flex gap-[24px]">
              {which.choices.slice(0, 3).map((c) => (
                <button key={c.id} type="button" disabled={loading} onClick={() => { setNote(null); void send(c.say) }} className="flex min-w-0 flex-1 flex-col gap-[12px] rounded-[22px] border-0 bg-wall-on-pigment px-[28px] py-[24px] text-left text-wall-ink">
                  <span className="text-wall-detail font-bold tracking-[0.12em] text-wall-ink-2">{c.when}</span>
                  <span className="line-clamp-2 font-display text-wall-date font-semibold leading-none">{c.title}</span>
                  {c.peopleIds.length > 0 && (
                    <span className="flex gap-[8px]">
                      {c.peopleIds.map((id) => {
                        const m = members.find((x) => x.id === id)
                        return <span key={id} className={`flex h-[36px] w-[36px] items-center justify-center rounded-full font-display text-wall-detail font-bold text-wall-on-pigment ${pigmentStyleFor(pigments.get(id) ?? 0).solid}`}>{m?.name.charAt(0) ?? '?'}</span>
                      })}
                    </span>
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-[16px]">
              {which.kept && <span className="rounded-full bg-wall-night-brass/15 px-[18px] py-[10px] text-wall-detail font-semibold text-wall-night-brass">Your change is kept: {which.kept}</span>}
              <button type="button" className={pill} onClick={() => void send('Never mind')}>Neither — never mind</button>
            </div>
          </div>
        )}

        {pending?.toolAction && (
          <div className="flex flex-col gap-[16px] rounded-[22px] bg-wall-on-pigment px-[32px] py-[24px] text-wall-ink">
            <div className="flex items-baseline justify-between gap-[24px]">
              <div className="whitespace-pre-line font-display text-wall-date font-semibold">{cardText(pending.toolAction.displayText)}</div>
              <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">DRAFT · NOT SAVED YET</div>
            </div>
            <div className="flex gap-[14px]">
              <button type="button" disabled={working} onClick={() => void confirm()} className="h-[56px] rounded-full border-0 bg-wall-ink px-[28px] text-wall-detail font-semibold text-wall-on-pigment">
                {working ? 'Saving…' : 'Yes, do it'}
              </button>
              <button type="button" disabled={working} onClick={cancel} className="h-[56px] rounded-full border border-solid border-wall-rule bg-transparent px-[28px] text-wall-detail font-semibold text-wall-ink">
                No
              </button>
            </div>
          </div>
        )}
        {note && <div className="text-wall-body text-wall-night-brass">{note}</div>}

        {status && state === 'THINKING' ? (
          // What Casa is doing on a longer think (P3.25 phase 1): in place of the tip.
          <div className="mt-auto max-w-[1180px] truncate text-wall-detail text-wall-night-ink-2/70">{status}</div>
        ) : tip ? (
          // Thinking: the tip is under the mic (Jake, Oct 5: "we only need one place for the tips").
          null
        ) : (
        <div className="mt-auto flex flex-col gap-[12px]">
        {/* While the mic waits for you (Jake, Oct 3: "any tips.. should be VERY subtle"): one quiet example, after a moment
            of quiet, gone as you speak; a different one each time. */}
        <div className="flex gap-[14px]">
          {offer && (
            <button type="button" className={lightPill} disabled={loading} onClick={() => { setNote(null); void send(offer.say) }}>
              {offer.label}
            </button>
          )}
          {pointAt && events.some((e) => e.id === pointAt) && (
            <button type="button" className={offer ? pill : lightPill} onClick={() => onOpenEvent(pointAt)}>
              Open {shortTitle(events.find((e) => e.id === pointAt)?.title ?? '') || 'it'}
            </button>
          )}
          {day && onOpenDay && (
            <button type="button" className={offer || pointAt ? pill : lightPill} onClick={() => onOpenDay(day.date)}>
              Open {day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </button>
          )}
          <button type="button" className={pill} onClick={talkOrType}>
            Ask something else
          </button>
          <button type="button" className={pill} onClick={onClose}>
            Done
          </button>
        </div>
        </div>
        )}
        </>
        )}
      </div>
      )}
      {agreeOpen && plan && (
        <WallPlanAgree plan={plan} skip={agreeSkip} working={working}
          onToggle={(id) => setAgreeSkip((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))}
          onAgree={() => agree(agreeSkip)} onBack={() => setAgreeOpen(false)} />
      )}
      {savedPlan && (
        <WallPlanSaved plan={savedPlan.plan} result={savedPlan.result} working={working}
          onOpen={onOpenPlace && ((open) => { setSavedFor(null); onOpenPlace(open) })}
          onUndo={() => void undoPlan?.(savedFor!)} onDone={() => setSavedFor(null)} />
      )}
    </section>
    </>
  )
}
