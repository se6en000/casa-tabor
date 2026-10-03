import { PhonePlanAgree, PhonePlanCard, PhonePlanSaved } from './PhonePlan'
import PhoneEmailReview from './PhoneEmailReview'
import { useEmailOffers } from '../wall/useEmailOffers'
import type { PlanArgs, PlanOpen } from '../wall/plan'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { useSpeechInput } from '../hooks/useSpeechInput'
import { sendBugReport } from '../lib/remoteVoiceTrace'
import type { FamilyMember } from '../types'
import { answerDay, cardText, firstTime, nextStep, voiceFinal, whichOne } from '../wall/assistant'
import { asksForTips } from '../wall/tips'
import { pageAsked } from '../wall/pageAsk'
import { assistantCard, replacedAction } from '../wall/assistantCard'
import type { DayPlan, WallEvent, WallMember } from '../wall/engine/types'
import { pigmentIndexes } from '../wall/score'
import { routeEta, useDriveMinutes, type DriveLookup } from '../wall/useDriveMinutes'
import { buildBugReport } from '../wall/bugReport'
import { useAssistantTurn } from '../wall/useAssistantTurn'
import { phoneTranscript } from './assistant'
import PhoneAssistantView from './PhoneAssistantView'
import type { GlanceProps } from './PhoneView'

const canListen = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

/** Say it with live data: the same assistant and the same yes as the wall's band. */
export default function PhoneAssistant({ events, family, members, planDay, onClose, onOpenEvent, onOpenPlace, onOpenDay, onOpenGroceries, onForm, onScan, glance, useEmail = useEmailOffers, opening = null, useTurn = useAssistantTurn, lookupDrive = routeEta }: {
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
  /** "Show me the grocery list": the Groceries tab. */
  onOpenGroceries?: () => void
  /** The form and Scan, from Casa's own button (canvas 32f). */
  onForm?: () => void
  onScan?: () => void
  /** Held to talk (34e/34f): listening while held, then the answer over the screen. */
  glance?: GlanceProps
  /** What came in by email (a stand-in in the fixture). */
  useEmail?: typeof useEmailOffers
  /** Words said first (a project's "Talk to Casa", P3.25). */
  opening?: string | null
  /** The conversation and the drive lookup; the screenshot fixture passes canned ones. */
  useTurn?: typeof useAssistantTurn
  lookupDrive?: DriveLookup
}) {
  const { profile } = useProfileSession()
  const turn = useTurn({ surface: 'phone', events, family })
  const { messages, loading, status, send, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs, undoPlan } = turn
  // "Anything from email?" (canvas 14c): the review, in the conversation.
  const email = useEmail()
  // The day the answer is about (Jake, 2026-09-29): opened when he asked to see it, else a button.
  const day = answerDay(answer, new Date())
  const openedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!day?.open || !onOpenDay || !answer || openedFor.current === answer.id || !firstTime(`day:${answer.id}`)) return
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
  // "What can I say?" said out loud: the list opens (no button for it).
  const [showList, setShowList] = useState(0)
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
      stopRef.current()
      if (asksForTips(step.toSend)) { setShowList((n) => n + 1); return }
      if (onOpenGroceries && pageAsked(step.toSend) === 'grocery') { onOpenGroceries(); return }
      void send(step.toSend)
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
  // Held to talk (34e): listening from the moment the hold starts; letting go finishes it and what was said is sent.
  // Where the phone can't listen, letting go opens the chat to type it instead.
  const holding = glance?.holding ?? false
  const wasHolding = useRef(false)
  const startRef = useRef(speech.start)
  const finishRef = useRef(speech.finish)
  useEffect(() => { startRef.current = speech.start; finishRef.current = speech.finish })
  const expandRef = useRef(glance?.onExpand)
  useEffect(() => { expandRef.current = glance?.onExpand })
  useEffect(() => {
    if (holding && !wasHolding.current) {
      captured.current = ''
      if (canListen) void startRef.current()
    }
    if (!holding && wasHolding.current) {
      if (canListen) finishRef.current()
      else expandRef.current?.()
    }
    wasHolding.current = holding
  }, [holding])

  const lines = useMemo(() => phoneTranscript(messages), [messages])
  const thinking = loading || Boolean(answer?.streaming)

  return (
    <>
    <PhoneAssistantView
      glance={glance ? { holding, onExpand: glance.onExpand } : undefined}
      onForm={onForm}
      onScan={onScan}
      showList={showList}
      planSlot={plan ? <PhonePlanCard plan={plan} previous={previousPlan} working={working} onSetUp={() => setAgreeOpen(true)} /> : answer?.emailReview && email.data ? <PhoneEmailReview data={email.data} act={email.act} /> : null}
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
      // What Casa just added comes with Open it straight away (33g, Jake: "a link will always be provided"); the event page
      // opens as soon as the new event has loaded.
      onOpenEvent={pointAt ? () => onOpenEvent(pointAt) : undefined}
      directions={answer?.directions ?? null}
      openDay={day && onOpenDay ? { label: `Open ${day.date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`, go: () => onOpenDay(day.date) } : null}
      onSend={(text, images) => {
        if (!images?.length && onOpenGroceries && pageAsked(text) === 'grocery') { onOpenGroceries(); return }
        setNote(null)
        void send(text, images)
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
      onPickPlace={(place) => setPendingArgs({ location: place.name, address: place.address, place_choices: null })}
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
