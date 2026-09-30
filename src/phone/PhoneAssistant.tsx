import { PhonePlanAgree, PhonePlanCard, PhonePlanSaved } from './PhonePlan'
import type { PlanArgs, PlanOpen } from '../wall/plan'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import type { FamilyMember } from '../types'
import { answerDay, cardText, nextStep, voiceFinal, whichOne } from '../wall/assistant'
import { assistantCard, replacedAction } from '../wall/assistantCard'
import type { DayPlan, WallEvent, WallMember } from '../wall/engine/types'
import { pigmentIndexes } from '../wall/score'
import { routeEta, useDriveMinutes, type DriveLookup } from '../wall/useDriveMinutes'
import { buildBugReport } from '../wall/bugReport'
import { useAssistantTurn } from '../wall/useAssistantTurn'
import { phoneTranscript } from './assistant'
import PhoneAssistantView from './PhoneAssistantView'

const canListen = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

/** Say it with live data: the same assistant and the same yes as the wall's band. */
export default function PhoneAssistant({ events, family, members, planDay, onClose, onOpenEvent, onOpenPlace, onOpenDay, opening = null, useTurn = useAssistantTurn, lookupDrive = routeEta }: {
  events: EventWithDetails[]
  family: FamilyMember[]
  /** The family and the Wall's engine for one day: the card is told from them, as on the wall. */
  members: WallMember[]
  planDay: (date: Date, events: WallEvent[]) => DayPlan | null
  onClose: () => void
  onOpenEvent: (id: string) => void
  /** A saved plan's line, opened where it lives (board 12d): a project, To do. */
  onOpenPlace?: (open: PlanOpen) => void
  /** Open a day on Me (Casa's show_day, or an answer about one day). */
  onOpenDay?: (date: Date) => void
  /** Words said first (a project's "Talk to Casa", P3.25). */
  opening?: string | null
  /** The conversation and the drive lookup; the screenshot fixture passes canned ones. */
  useTurn?: typeof useAssistantTurn
  lookupDrive?: DriveLookup
}) {
  const { profile } = useProfileSession()
  const turn = useTurn({ surface: 'phone', events, family })
  const { messages, loading, status, send, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs, undoPlan } = turn
  // The day the answer is about (Jake, 2026-09-29): opened when he asked to see it, else a button.
  const day = answerDay(answer, new Date())
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!day?.open || !onOpenDay || !answer || openedFor.current === answer.id) return
    openedFor.current = answer.id
    onOpenDay(day.date)
  }, [answer, day?.open, day?.date, onOpenDay])
  // Plan it with Casa (P3.25; board 12e): the plan on screen, its Agree sheet, and what it saved.
  const planAction = pending?.toolAction?.tool === 'apply_plan' ? pending.toolAction : null
  const plan = planAction ? (planAction.args as unknown as PlanArgs) : null
  const previousPlan = planAction ? ((replacedAction(messages, pending)?.args as unknown as PlanArgs | undefined)?.items ?? null) : null
  const [agreeOpen, setAgreeOpen] = useState(false)
  const [savedFor, setSavedFor] = useState<string | null>(null)
  const savedMessage = savedFor ? messages.find((m) => m.id === savedFor) ?? null : null
  const openedWith = useRef<string | null>(null)
  useEffect(() => {
    if (!opening || openedWith.current === opening) return
    openedWith.current = opening
    void send(opening)
  }, [opening]) // eslint-disable-line react-hooks/exhaustive-deps
  const planRef = useRef(false)
  planRef.current = Boolean(plan)
  const askedRef = useRef(turn.agreeAsked ?? 0)
  useEffect(() => {
    if ((turn.agreeAsked ?? 0) === askedRef.current) return
    askedRef.current = turn.agreeAsked ?? 0
    setAgreeOpen(true)
  }, [turn.agreeAsked])

  // The same card as the wall's band (boards 06e/06f).
  const action = pending?.toolAction ?? null
  const driveMinutes = useDriveMinutes(action, events, lookupDrive)
  const card = useMemo(
    () => (action ? assistantCard({ tool: action.tool, args: action.args }, replacedAction(messages, pending), { events: events as unknown as WallEvent[], members, planDay, driveMinutes }) : null),
    [action, messages, pending, events, members, planDay, driveMinutes],
  )
  const pigments = useMemo(() => pigmentIndexes(members), [members])
  const which = pending || loading ? null : whichOne(answer, events as never)
  const offer = pending || which || answer?.streaming ? null : nextStep(answer)
  const [interim, setInterim] = useState('')
  const captured = useRef('')
  const heard = useRef('')
  const stopRef = useRef<() => void>(() => {})

  const speech = useSpeechInput({
    onInterim: setInterim,
    onFinalTranscript: (text) => {
      const step = voiceFinal(captured.current, text)
      captured.current = step.captured
      if (step.captured) {
        heard.current = step.captured
        setInterim(step.captured)
      }
      if (!step.toSend) return
      setInterim('')
      setNote(null)
      void send(step.toSend)
      stopRef.current()
    },
    onDismiss: () => stopRef.current(),
    // A plan's spoken yes opens its Agree sheet first (board 12c).
    onConfirm: () => { if (planRef.current) setAgreeOpen(true); else void confirm() },
    onCancel: cancel,
    hasPendingAction: Boolean(pending),
  })
  useEffect(() => {
    stopRef.current = () => void speech.stop()
  })

  const lines = useMemo(() => phoneTranscript(messages), [messages])
  const thinking = loading || Boolean(answer?.streaming)

  return (
    <>
    <PhoneAssistantView
      planSlot={plan ? <PhonePlanCard plan={plan} previous={previousPlan} working={working} onSetUp={() => setAgreeOpen(true)} /> : null}
      lines={lines}
      thinking={thinking}
      status={status ?? null}
      pending={pending?.toolAction?.displayText ? cardText(pending.toolAction.displayText) : null}
      working={working}
      note={note}
      mic={canListen ? {
        listening: speech.listening,
        interim,
        toggle: () => {
          if (speech.listening) return speech.finish()
          captured.current = ''
          void speech.start()
        },
      } : undefined}
      onOpenEvent={pointAt && events.some((e) => e.id === pointAt) ? () => onOpenEvent(pointAt) : undefined}
      openDay={day && onOpenDay ? { label: `Open ${day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`, go: () => onOpenDay(day.date) } : null}
      onSend={(text) => {
        setNote(null)
        void send(text)
      }}
      onConfirm={() => void confirm()}
      onCancel={cancel}
      onReport={async ({ categories, expected, happened }) => {
        const conversation = forReport()
        await sendBugReport(buildBugReport({
          messages: conversation.messages,
          seenAt: conversation.seenAt,
          sessionId: conversation.sessionId,
          heard: heard.current,
          categories,
          expected,
          happened,
          context: {
            surface: 'phone',
            build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
            viewer: profile?.memberName ?? null,
            at: new Date().toISOString(),
            timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            utcOffset: -new Date().getTimezoneOffset(),
            screen: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
            pointAt: pointAt ?? null,
            pendingTool: pending?.toolAction?.tool ?? null,
            loading,
            online: navigator.onLine,
            messageCount: conversation.messages.length,
            previousConversation: conversation.previous,
          },
        }))
      }}
      onClose={() => {
        stopRef.current()
        onClose()
      }}
      card={card}
      which={which}
      offer={offer}
      members={members}
      pigmentOf={(id) => pigments.get(id) ?? null}
      onPickDriver={(name) => setPendingArgs({ driver_name: name })}
    />
    {agreeOpen && plan && pending && (
      <PhonePlanAgree plan={plan} working={working} onBack={() => setAgreeOpen(false)}
        onAgree={(skip) => { setSavedFor(pending.id); setAgreeOpen(false); void confirm({ skip }) }} />
    )}
    {savedMessage?.toolAction?.planResult && (
      <PhonePlanSaved plan={savedMessage.toolAction.args as unknown as PlanArgs} result={savedMessage.toolAction.planResult} working={working}
        onOpen={(open) => { setSavedFor(null); if (open.kind === 'event') onOpenEvent(open.id); else onOpenPlace?.(open) }}
        onUndo={() => void undoPlan?.(savedMessage.id)} onDone={() => setSavedFor(null)} />
    )}
    </>
  )
}
