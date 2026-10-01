import { useEffect, useMemo, useRef, useState } from 'react'
import { Bug, Mic } from 'lucide-react'
import { useProfileSession } from '../contexts/useProfileSession'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import { buildBugReport, REPORT_CATEGORIES } from './bugReport'
import WallKeyboard from './WallKeyboard'
import WallDirections from './WallDirections'
import { deviceKeyboardHere } from './keyboardMode'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import type { FamilyMember } from '../types'
import { useSwipeDown } from './useSwipeDown'
import VoiceHalo from './VoiceHalo'
import { inkWords, shownWords, type VoiceLineState } from './voiceLine'
import { useListenerV2 } from './listenerSwitch'
import { answerDay, bandAnswer, bandCompact, bandState, cardText, dismissStep, firstTime, nextStep, tapOutsideCloses, threadTurns, voiceFinal, whichOne, type BandState } from './assistant'
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
import { noteSaid, tipFor, tipsByTopic } from './tips'
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

/** Room under the conversation for the typing line, by its height (whole classes, so the styles are built). */
const LINE_ROOM = [
  { fits: 150, pb: 'pb-[230px]' },
  { fits: 210, pb: 'pb-[290px]' },
  { fits: 270, pb: 'pb-[350px]' },
  { fits: 330, pb: 'pb-[410px]' },
  { fits: Infinity, pb: 'pb-[470px]' },
]

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
  onLed?: (band: { state: BandState; micOpen: boolean }) => void
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
  const thread = threadTurns(messages)
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
  // The band keeps room for the line as it grows (pictures waiting, more lines typed).
  const [lineHeight, setLineHeight] = useState(0)
  const lineRoom = LINE_ROOM.find((r) => lineHeight <= r.fits) ?? LINE_ROOM[LINE_ROOM.length - 1]
  /** "Say more": the mic where talking is the way in; the line, focused, on a computer that hasn't talked. */
  const talkOrType = () => {
    setNote(null)
    if (!micWanted.current) return typeLine.current?.focus()
    captured.current = ''
    void speech.start()
  }
  const pendingRef = useRef(pending)
  pendingRef.current = pending
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
      void send(step.toSend)
      // The mic pauses while Casa thinks, and opens again when the answer lands (below).
      stopRef.current()
    },
    onDismiss: () => {
      if (!reportingRef.current) onClose()
    },
    // A spoken yes or no to the card: done, and the conversation goes on. A plan's yes opens its
    // Agree card; a yes to the Agree card saves what's ticked.
    onConfirm: () => {
      stopRef.current()
      if (agreeRef.current.plan && !agreeRef.current.open) { openAgree(); return }
      if (agreeRef.current.open) { agree(agreeSkipRef.current); return }
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
      if (planningRef.current && !reportingRef.current) { setRelisten((n) => n + 1); return }
      if (pendingRef.current || reportingRef.current || talkingRef.current) return
      onClose()
    },
  })

  stopRef.current = () => void speech.stop()

  // The band keeps listening (P3.13): once an answer lands (or a yes/no is done), the mic opens
  // again by itself — no wake word for every sentence — until "go away", silence, or gibberish.
  // Two asides in a row (the room is just talking, not to Casa): the mic goes off; the band stays.
  useEffect(() => {
    if (asidesInARow >= 2) stopRef.current()
  }, [asidesInARow])

  const busy = loading || Boolean(answer?.streaming) || working
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) setRelisten((n) => n + 1)
    wasBusy.current = busy
  }, [busy])
  useEffect(() => {
    // Not after two asides in a row: the room is talking, so the mic stays off until he wants it.
    if (relisten === 0 || reportingRef.current || asidesRef.current >= 2 || !micWanted.current) return
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
  // A swipe down closes the band (touch and mouse; useSwipeDown).
  const dismiss = (how: 'tap_outside' | 'swipe_down' | 'escape') => {
    const waiting = Boolean(pending?.toolAction)
    if (dismissStep({ how, waiting, armedAt: closeArmedAt, now: Date.now() }) === 'arm') {
      setCloseArmedAt(Date.now())
      return
    }
    emitAssistantTrace('wall_band_dismissed', voiceTrace.current, { payload: { how, open_ms: Date.now() - openedAt.current, heard_words: messages.some((m) => m.role === 'user'), waiting, via_wake: viaWake } })
    onClose()
  }
  const swipe = useSwipeDown(() => dismiss('swipe_down'))
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

  const state = bandState({ listening: speech.listening || speech.connecting, loading, answer, pending })
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

  // The LED strip (P3.14): what the band is doing, and a card's outcome as a warm or rust swell.
  const micOpen = speech.listening || speech.connecting
  useEffect(() => onLed?.({ state, micOpen }), [state, micOpen, onLed])
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

  // The new listener (canvas row 17), behind the MT menu's switch: one voice line under the words, and the wake
  // word left off the words shown (it sat there, then vanished — one more jump).
  const listenerV2 = useListenerV2()
  const liveText = listenerV2 && interim ? shownWords(interim) : interim
  const shownQuestion = speech.listening && liveText ? liveText : question
  // Timing: when the words are on screen (the bridge logs it beside Deepgram's own times).
  useEffect(() => {
    if (!interim) return
    const frame = requestAnimationFrame(() => speech.mark?.('shown', interim))
    return () => cancelAnimationFrame(frame)
  }, [interim]) // eslint-disable-line react-hooks/exhaustive-deps
  const liveWords = listenerV2 && speech.listening && liveText ? inkWords(liveText, speech.signal?.current.words ?? []) : null
  const quote = (text: string) => (liveWords
    ? <>“{liveWords.map((w, i) => <span key={i} className={w.faded ? 'opacity-40' : undefined}>{i > 0 ? ' ' : ''}{w.text}</span>)}”</>
    : `“${text}”`)
  // Take two of row 17 (Jake: "too busy … do something similar with something smaller, like the mic"): a halo
  // behind the mic that swells with your voice; a few states leave a short note under it.
  const [haloState, setHaloState] = useState<VoiceLineState>('off')
  const voiceHalo = listenerV2 ? (
    <VoiceHalo
      signal={speech.signal}
      micOpen={micOpen}
      bridgeDown={Boolean(speech.bridgeDown)}
      thinking={loading}
      needsYes={state === 'NEEDS A YES'}
      heard={speech.listening ? liveText : ''}
      onState={setHaloState}
    />
  ) : null
  const haloNote = !listenerV2 ? null
    : haloState === 'fuse' ? 'Waiting for the rest —\ntap the mic to send'
      : haloState === 'noise' ? 'It’s loud in here'
        : haloState === 'deaf' ? 'Can’t hear the mic —\ntap to try again'
          : ''
  const answerText = useMemo(() => (answer?.content ? bandAnswer(answer.content) : ''), [answer?.content])
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
          className={`absolute left-0 z-10 flex w-[1920px] flex-col gap-[20px] rounded-t-[32px] bg-wall-ink px-[64px] py-[40px] font-body text-wall-on-pigment ${typing ? 'bottom-[430px] rounded-b-[32px]' : 'bottom-0'}`}
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
            value={typing === 'expected' ? expected : happened}
            onChange={(v) => (typing === 'expected' ? setExpected(v) : setHappened(v))}
            onDone={() => setTyping(null)}
          />
        )}
      </>
    )
  }

  // A questionable trigger barely touches the screen (2026-09-30): the pill, until words are heard.
  if (bandCompact({ viaWake, heard: interim, messages: messages.length, expanded })) {
    return (
      <>
        <button type="button" aria-label="Close Casa" onClick={() => dismiss('tap_outside')} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
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
    {tapOutsideCloses(messages.length) && <button type="button" aria-label="Close Casa" onClick={() => dismiss('tap_outside')} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />}
    <section
      aria-label="Assistant"
      {...swipe}
      className={`absolute bottom-0 left-0 z-30 flex min-h-[430px] w-[1920px] touch-none gap-[56px] rounded-t-[32px] bg-wall-band px-[64px] pt-[44px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60 ${computer ? lineRoom.pb : 'pb-[44px]'}`}
      // Pictures dropped anywhere on the band join the line (22b).
      onDragOver={computer ? (e) => e.preventDefault() : undefined}
      onDrop={computer ? (e) => { e.preventDefault(); void typeLine.current?.addFiles(Array.from(e.dataTransfer.files)) } : undefined}
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
        {listenerV2
          ? <div className="h-[3px] w-full bg-wall-night-brass/70" />
          : state === 'LISTENING'
          ? <div className="h-full w-full animate-[wall-edge-breathe_2.4s_ease-in-out_infinite] bg-wall-night-brass" />
          : state === 'THINKING'
            ? <>
                <div className="h-[3px] w-full bg-wall-night-brass/50" />
                <div className="absolute left-0 top-0 h-full w-[480px] animate-[wall-edge-sweep_1.6s_linear_infinite] rounded-full bg-wall-night-brass" />
              </>
            : <div className="h-[3px] w-full bg-wall-night-brass/70" />}
      </div>
      <div className="flex w-[200px] shrink-0 flex-col items-center gap-[16px]">
        <div data-listener={listenerV2 ? haloState : undefined} className="relative flex h-[132px] w-[132px] items-center justify-center">
          {/* The new listener: a halo behind the mic that swells with your voice (canvas row 17, take two). */}
          {voiceHalo}
          {/* Listening: your turn — a solid brass mic with rings pulsing out. */}
          {state === 'LISTENING' && !listenerV2 && (
            <>
              <span aria-hidden="true" className="absolute inset-0 animate-[wall-listen-ring_2.4s_ease-out_infinite] rounded-full border-[3px] border-solid border-wall-night-brass" />
              <span aria-hidden="true" className="absolute inset-0 animate-[wall-listen-ring_2.4s_ease-out_1.2s_infinite] rounded-full border-[3px] border-solid border-wall-night-brass" />
            </>
          )}
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
        {!(listenerV2 && state === 'LISTENING') && (
          <div className={`font-bold tracking-[0.2em] text-wall-night-brass ${state === 'LISTENING' || state === 'THINKING' ? 'text-wall-heading' : 'text-wall-label'}`}>{state}</div>
        )}
        <div className="whitespace-pre-line text-center text-wall-label text-wall-night-ink-2">
          {state === 'NEEDS A YES'
            ? 'Say yes, or change\nanything on it'
            : state === 'THINKING'
              ? '' // the ring and THINKING say it (Jake, 2026-09-29: "way redundant")
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
      {(thread.length > 0 || card || plan) && (
        <div className="flex w-[520px] shrink-0 flex-col gap-[14px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">THIS CONVERSATION</div>
          <div className="flex flex-col gap-[12px] text-wall-detail leading-[1.35]">
            {thread.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'max-w-[440px] self-end rounded-[18px_18px_6px_18px] bg-wall-on-pigment/12 px-[16px] py-[12px] text-wall-on-pigment' : 'max-w-[440px] text-wall-night-ink-2'}>
                {t.images && t.images.length > 0 && (
                  <span className="mb-[8px] flex gap-[8px]">
                    {t.images.map((src, j) => <img key={j} src={src} alt="" className="h-[40px] w-[56px] rounded-[6px] object-cover" />)}
                  </span>
                )}
                {t.text}
              </div>
            ))}
          </div>
          {(card || plan) && (
            <>
              {!(listenerV2 && !shownQuestion) && <div className="mt-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{shownQuestion ? 'YOU JUST SAID' : 'LISTENING'}</div>}
              {shownQuestion && <div className="font-display text-wall-quote font-medium italic">{listenerV2 ? quote(shownQuestion) : `“${shownQuestion}”`}</div>}
              {answerText && <div className="text-wall-body text-wall-night-ink-2">{answerText}</div>}
            </>
          )}
        </div>
      )}

      {plan ? (
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
        <div className="flex items-center justify-between gap-[24px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">{sayOpen ? 'WHAT CAN I SAY?' : shownQuestion ? (thread.length > 0 ? 'YOU JUST ASKED' : 'YOU ASKED') : !micOn && state !== 'LISTENING' ? 'TYPE OR PASTE' : listenerV2 ? '' : 'LISTENING'}</div>
          <button type="button" aria-pressed={sayOpen} onClick={() => setSayOpen((open) => !open)} className="flex h-[48px] shrink-0 items-center gap-[10px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-on-pigment">
            <span aria-hidden="true" className="flex h-[26px] w-[26px] items-center justify-center rounded-full border-[1.5px] border-solid border-wall-night-brass text-wall-label font-bold text-wall-night-brass">?</span>
            {sayOpen ? 'Close the list' : 'What can I say?'}
          </button>
        </div>
        {sayOpen ? (
          <div className="grid grid-cols-5 gap-[28px]">
            {tipsByTopic().map((g) => (
              <div key={g.topic} className="flex flex-col gap-[10px]">
                <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{g.topic.toUpperCase()}</div>
                {g.tips.map((t) => <div key={t.id} className="text-wall-detail text-wall-night-ink-2">{t.text}</div>)}
              </div>
            ))}
          </div>
        ) : (
        <>
        <div className="font-display text-wall-quote font-medium italic">
          {shownQuestion ? (listenerV2 ? quote(shownQuestion) : `“${shownQuestion}”`) : state === 'LISTENING' ? (listenerV2 ? 'Go ahead.' : 'Go ahead — I’m listening.') : !micOn ? 'Type below, or paste a message or pictures.' : 'Ask about the day, or ask to add something.'}
        </div>
        {answerText && <div className="max-w-[1180px] text-wall-answer">{answerText}</div>}
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
          // One quiet line, no card: the question stays the focus (Jake, 2026-09-27; board 07e).
          <div className="mt-auto max-w-[1180px] text-wall-detail text-wall-night-ink-2/70">Tip: {tip}</div>
        ) : (
        <div className="mt-auto flex gap-[14px]">
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
      {computer && !reporting && (
        <div className="absolute bottom-[36px] left-[320px] right-[64px]">
          <WallTypeLine
            onHeight={setLineHeight}
            key={staged?.nonce ?? 0}
            ref={typeLine}
            busy={busy}
            initialText={staged?.text ?? ''}
            initialImages={staged?.images ?? []}
            onSend={(text, images) => {
              stopRef.current()
              setNote(null)
              void send(text, images.length ? images.map(({ dataUrl, mimeType }) => ({ dataUrl, mimeType })) : undefined)
            }}
          />
        </div>
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
