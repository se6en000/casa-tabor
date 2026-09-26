import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Bug, Mic } from 'lucide-react'
import { useProfileSession } from '../contexts/useProfileSession'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import { buildBugReport, REPORT_CATEGORIES } from './bugReport'
import WallKeyboard from './WallKeyboard'
import { useAIAssistant } from '../hooks/useAIAssistant'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'
import { answerEventId, bandAnswer, bandState, latestExchange, pendingAction, voiceFinal } from './assistant'
import { readActionResult, requestArgsFor, responseBody } from './assistantActions'

// The assistant band (boards 03b/03c): a dark band from the bottom. It listens,
// shows what it heard large, answers in a sentence or two, points at the wall,
// and asks for a yes before it changes anything. The whole AI backend is the
// existing one (useAIAssistant, execute-ai-action); only the presentation is new.

const ANSWER_IDLE_MS = 60_000

export interface WallAssistantBandProps {
  /** Changes each time the band should (re)start listening: the mic button or the wake word. */
  listenNonce: number
  events: EventWithDetails[]
  family: FamilyMember[]
  onClose: () => void
  /** The calendar item the latest answer is about (the wall outlines it), or null. */
  onPointAt: (eventId: string | null) => void
  onOpenEvent: (eventId: string) => void
}

export default function WallAssistantBand({ listenNonce, events, family, onClose, onPointAt, onOpenEvent }: WallAssistantBandProps) {
  const queryClient = useQueryClient()
  const { messages, loading, send, session, updateMessageToolStatus } = useAIAssistant({ page: 'wall', events, family, onSessionEnd: onClose })
  const [interim, setInterim] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
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
  const seenAt = useRef<Record<string, string>>({})

  // When each message first appeared (messages carry no time of their own).
  useEffect(() => {
    for (const m of messages) if (!seenAt.current[m.id]) seenAt.current[m.id] = new Date().toISOString()
  }, [messages])

  const { question, answer } = latestExchange(messages)
  const pending = pendingAction(messages)
  const pointAt = answerEventId(answer)

  const confirm = useCallback(async () => {
    const message = pending
    const action = message?.toolAction
    if (!message || !action || working) return
    setWorking(true)
    setNote(null)
    updateMessageToolStatus(message.id, 'loading')
    const args = requestArgsFor(action.tool, action.args, events)
    const { data, error } = await supabase.functions.invoke('execute-ai-action', {
      body: {
        tool: action.tool,
        args,
        action_id: message.id,
        session_id: session?.id ?? null,
        correlation_id: `${session?.id ?? 'no-session'}:${message.id}:${Date.now().toString(36)}`,
        lane: 'voice',
        device_id: getAssistantDeviceId(),
        client_trace_source: 'wall-band-confirmation',
        confirmed_by_user: true,
      },
    })
    const result = readActionResult(await responseBody(data, error), args)
    setWorking(false)
    if (result.kind === 'conflict') {
      updateMessageToolStatus(message.id, 'pending', { args: result.args } as never)
      setNote('That clashes with something already on the calendar. Say yes, or tap Yes, to add it anyway.')
      return
    }
    if (result.kind === 'error') {
      updateMessageToolStatus(message.id, 'error', { errorMsg: result.message })
      setNote(result.message)
      return
    }
    updateMessageToolStatus(message.id, 'done', { actionId: result.actionId, resultEventId: result.eventId })
    invalidateAllCalendarQueries(queryClient, String(args.event_id ?? args.id ?? result.eventId ?? ''))
    setNote('Done.')
  }, [pending, working, events, session?.id, updateMessageToolStatus, queryClient])

  const cancel = useCallback(() => {
    if (!pending) return
    updateMessageToolStatus(pending.id, 'cancelled')
    setNote('Okay, nothing changed.')
  }, [pending, updateMessageToolStatus])

  const speech = useSpeechInput({
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
      // Press-to-talk, like the full assistant: the mic turns off after each question.
      stopRef.current()
    },
    onDismiss: onClose,
    onConfirm: () => void confirm(),
    onCancel: cancel,
    hasPendingAction: Boolean(pending),
    autoDismissOnFailure: true,
    onAutoDismiss: () => {
      if (!question && !reportingRef.current) onClose()
    },
  })

  stopRef.current = () => void speech.stop()

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
    stopRef.current()
    setReporting(true)
    setReportState('idle')
  }
  const submitReport = async () => {
    setReportState('sending')
    const report = buildBugReport({
      messages,
      seenAt: seenAt.current,
      sessionId: session?.id ?? null,
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
        messageCount: messages.length,
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
          {state === 'NEEDS A YES' ? 'Say yes or no,\nor tap below' : 'Say the wake word,\nor tap the mic'}
        </div>
      </div>

      {/* Quiet, but always there when things go awry. */}
      <button type="button" aria-label="Report a problem" onClick={openReport} className="absolute right-[40px] top-[36px] flex h-[48px] w-[48px] items-center justify-center rounded-full border border-solid border-wall-ink-2 bg-transparent p-0 text-wall-night-ink-2">
        <Bug size={22} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
        <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-ink-2">{shownQuestion ? 'YOU ASKED' : 'LISTENING'}</div>
        <div className="font-display text-wall-quote font-medium italic">
          {shownQuestion ? `“${shownQuestion}”` : 'Ask about the day, or ask to add something.'}
        </div>
        {answerText && <div className="max-w-[1180px] text-wall-answer">{answerText}</div>}

        {pending?.toolAction && (
          <div className="flex flex-col gap-[16px] rounded-[22px] bg-wall-on-pigment px-[32px] py-[24px] text-wall-ink">
            <div className="flex items-baseline justify-between gap-[24px]">
              <div className="font-display text-wall-date font-semibold">{pending.toolAction.displayText}</div>
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

        <div className="mt-auto flex gap-[14px]">
          {pointAt && events.some((e) => e.id === pointAt) && (
            <button type="button" className={lightPill} onClick={() => onOpenEvent(pointAt)}>
              Open it
            </button>
          )}
          <button type="button" className={pill} onClick={() => { setNote(null); captured.current = ''; void speech.start() }}>
            Ask something else
          </button>
          <button type="button" className={pill} onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </section>
  )
}
