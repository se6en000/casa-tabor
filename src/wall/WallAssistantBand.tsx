import { useEffect, useMemo, useRef, useState } from 'react'
import { Bug, Mic } from 'lucide-react'
import { useProfileSession } from '../contexts/useProfileSession'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import { buildBugReport, REPORT_CATEGORIES } from './bugReport'
import WallKeyboard from './WallKeyboard'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import type { FamilyMember } from '../types'
import { bandAnswer, bandState, cardText, nextStep, threadTurns, voiceFinal, whichOne, type BandState } from './assistant'
import { assistantCard, replacedAction } from './assistantCard'
import type { DayPlan, WallEvent, WallMember } from './engine/types'
import { pigmentIndexes } from './score'
import { useAssistantTurn } from './useAssistantTurn'
import { createAssistantTraceContext, emitAssistantTrace } from '../lib/assistantTelemetry'
import { routeEta, useDriveMinutes, type DriveLookup } from './useDriveMinutes'
import WallAssistantCard from './WallAssistantCard'
import { pigmentStyleFor } from './lanes'
import { noteSaid, tipFor, tipsByTopic } from './tips'

// The assistant band (boards 03b/03c): a dark band from the bottom. It listens,
// shows what it heard large, answers in a sentence or two, points at the wall,
// and asks for a yes before it changes anything. The whole AI backend is the
// existing one (useAIAssistant, execute-ai-action); only the presentation is new.

const ANSWER_IDLE_MS = 60_000
/** Quiet this long after a plain answer, and the band slips away (8 s was too short to think in; Jake, 2026-09-26). */
const ANSWERED_SILENCE_MS = 20_000
/** Longer while a card, "which one?" or a question back waits for the person. */
const WAITING_SILENCE_MS = 45_000

/** "Open softball" from "Softball: Huskies @ Wellington Knights"; long titles give their first words. */
const shortTitle = (title: string) => {
  const head = title.split(/[:·(—-]/)[0].trim()
  return head.length <= 24 ? head : head.split(' ').slice(0, 3).join(' ')
}

export interface WallAssistantBandProps {
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
  onOutcome?: (kind: 'confirm' | 'cancel') => void
  /** The microphone; the screenshot fixture passes a stand-in its tests can speak through. */
  useSpeech?: typeof useSpeechInput
}

export default function WallAssistantBand({ listenNonce, events, family, onClose, onPointAt, onOpenEvent, members, planDay, onDraft, useTurn = useAssistantTurn, lookupDrive = routeEta, useSpeech = useSpeechInput, onLed, onOutcome }: WallAssistantBandProps) {
  const { messages, asidesInARow = 0, loading, send, question, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs } = useTurn({ surface: 'wall', events, family, onSessionEnd: onClose })

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
  const pendingRef = useRef(pending)
  pendingRef.current = pending
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
    // A spoken yes or no to the card: done, and the conversation goes on.
    onConfirm: () => {
      stopRef.current()
      void confirm()
    },
    onCancel: () => {
      stopRef.current()
      cancel()
      setRelisten((n) => n + 1)
    },
    hasPendingAction: Boolean(pending),
    autoDismissOnFailure: true,
    // Quiet for a while, or gibberish twice: the band slips away — but a card waiting for a
    // yes stays on screen (the mic just closes), so it can still be tapped.
    silenceDismissMs: waitingOnYou ? WAITING_SILENCE_MS : ANSWERED_SILENCE_MS,
    onAutoDismiss: () => {
      if (pendingRef.current || reportingRef.current) return
      onClose()
    },
  })

  stopRef.current = () => void speech.stop()

  // The band keeps listening (P3.13): once an answer lands (or a yes/no is done), the mic opens
  // again by itself — no wake word for every sentence — until "go away", silence, or gibberish.
  // Two asides in a row (the room is just talking, not to Casa): the band quietly slips away.
  useEffect(() => {
    if (asidesInARow >= 2 && !pendingRef.current && !reportingRef.current) onClose()
  }, [asidesInARow, onClose])

  const busy = loading || Boolean(answer?.streaming) || working
  const wasBusy = useRef(false)
  useEffect(() => {
    if (wasBusy.current && !busy) setRelisten((n) => n + 1)
    wasBusy.current = busy
  }, [busy])
  useEffect(() => {
    if (relisten === 0 || reportingRef.current) return
    captured.current = ''
    void speech.start()
  }, [relisten]) // eslint-disable-line react-hooks/exhaustive-deps

  // Start listening on open, and again each time the mic or wake word asks.
  useEffect(() => {
    lastTouch.current = Date.now()
    setInterim('')
    captured.current = ''
    void speech.start()
  }, [listenNonce]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => void speech.stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => onPointAt(pointAt), [pointAt, onPointAt])
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

  const shownQuestion = speech.listening && interim ? interim : question
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

  return (
    <section
      aria-label="Assistant"
      className="absolute bottom-0 left-0 z-10 flex min-h-[430px] w-[1920px] gap-[56px] rounded-t-[32px] bg-wall-ink px-[64px] py-[44px] font-body text-wall-on-pigment"
      onClick={(event) => {
        event.stopPropagation()
        lastTouch.current = Date.now()
      }}
    >
      <div className="flex w-[200px] shrink-0 flex-col items-center gap-[16px]">
        <button
          type="button"
          aria-label={speech.listening ? 'Stop listening' : 'Talk'}
          onClick={() => { if (speech.listening) speech.finish(); else { captured.current = ''; void speech.start() } }}
          className={`flex h-[132px] w-[132px] items-center justify-center rounded-full border-2 border-solid border-wall-night-brass bg-transparent p-0 text-wall-night-brass ${speech.listening ? 'ring-[14px] ring-wall-night-brass/25' : ''}`}
        >
          <Mic size={44} strokeWidth={1.6} />
        </button>
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{state}</div>
        <div className="whitespace-pre-line text-center text-wall-label text-wall-night-ink-2">
          {state === 'NEEDS A YES'
            ? 'Say yes, or change\nanything on it'
            : state === 'LISTENING' && question
              ? 'Keep talking, or\nsay “that’s all”'
              : 'Say the wake word,\nor tap the mic'}
        </div>
      </div>

      {/* Quiet, but always there when things go awry. */}
      <button type="button" aria-label="Report a problem" onClick={openReport} className="absolute right-[40px] top-[36px] flex h-[48px] w-[48px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-night-ink-2">
        <Bug size={22} />
      </button>
      {(thread.length > 0 || card) && (
        <div className="flex w-[520px] shrink-0 flex-col gap-[14px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">THIS CONVERSATION</div>
          <div className="flex flex-col gap-[12px] text-wall-detail leading-[1.35]">
            {thread.map((t, i) => (
              <div key={i} className={t.role === 'user' ? 'max-w-[440px] self-end rounded-[18px_18px_6px_18px] bg-wall-night-stone px-[16px] py-[12px] text-wall-on-pigment' : 'max-w-[440px] text-wall-night-ink-2'}>
                {t.text}
              </div>
            ))}
          </div>
          {card && (
            <>
              <div className="mt-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{shownQuestion ? 'YOU JUST SAID' : 'LISTENING'}</div>
              {shownQuestion && <div className="font-display text-wall-quote font-medium italic">“{shownQuestion}”</div>}
              {answerText && <div className="text-wall-body text-wall-night-ink-2">{answerText}</div>}
            </>
          )}
        </div>
      )}

      {card ? (
        <div className="flex min-w-0 flex-1 flex-col gap-[14px] pr-[64px]">
          <WallAssistantCard
            card={card}
            members={members}
            pigmentOf={(id) => pigments.get(id) ?? null}
            working={working}
            onYes={() => void confirm()}
            onChange={() => { setNote(null); captured.current = ''; void speech.start() }}
            onNo={cancel}
            onPickDriver={card.kind === 'change' ? (name) => setPendingArgs({ driver_name: name }) : undefined}
          />
          {note && <div className="text-wall-body text-wall-night-brass">{note}</div>}
        </div>
      ) : (
      <div className="flex min-w-0 flex-1 flex-col gap-[18px] pr-[64px]">
        <div className="flex items-center justify-between gap-[24px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">{sayOpen ? 'WHAT CAN I SAY?' : shownQuestion ? (thread.length > 0 ? 'YOU JUST ASKED' : 'YOU ASKED') : 'LISTENING'}</div>
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
          {shownQuestion ? `“${shownQuestion}”` : 'Ask about the day, or ask to add something.'}
        </div>
        {answerText && <div className="max-w-[1180px] text-wall-answer">{answerText}</div>}

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
              <div className="font-display text-wall-date font-semibold">{cardText(pending.toolAction.displayText)}</div>
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

        {tip ? (
          <div className="mt-auto flex max-w-[1180px] flex-col gap-[8px] rounded-[20px] border border-solid border-wall-night-brass/35 bg-wall-night-brass/10 px-[26px] py-[22px]">
            <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">WHILE CASA THINKS · A TIP</div>
            <div className="text-wall-body leading-[1.35]">{tip}</div>
          </div>
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
          <button type="button" className={pill} onClick={() => { setNote(null); captured.current = ''; void speech.start() }}>
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
    </section>
  )
}
