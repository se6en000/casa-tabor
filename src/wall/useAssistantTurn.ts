import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { optimisticEvent, withEvent } from '../lib/optimisticEvent'
import { useQueryClient } from '@tanstack/react-query'
import { useAIAssistant } from '../hooks/useAIAssistant'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'
import { answerEventId, latestExchange, pendingAction, withoutAsides } from './assistant'
import { readActionResult, requestArgsFor, responseBody } from './assistantActions'
import { conversationForReport, type ReportConversation } from './bugReport'
import { sendBugReport } from '../lib/remoteVoiceTrace'

// The last conversation with something in it, kept past its band or sheet closing, so a
// report opened afterwards still carries it.
let lastConversation: ReportConversation | null = null
/** A card turned down this soon after it appeared is reported automatically (P3.17). */
const QUICK_CANCEL_MS = 10_000

/**
 * One conversation with the assistant as the Wall's band and the phone both hold it:
 * the existing assistant (useAIAssistant), its latest exchange, the action waiting for a
 * yes, and that yes (or no) through `execute-ai-action`. `surface` labels the traces.
 */
export function useAssistantTurn({ surface, events, family, onSessionEnd }: { surface: 'wall' | 'phone'; events: EventWithDetails[]; family: FamilyMember[]; onSessionEnd?: () => void }) {
  const queryClient = useQueryClient()
  const { messages: allMessages, loading, status, send, session, updateMessageToolStatus } = useAIAssistant({ page: surface, events, family, onSessionEnd })
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const seenAt = useRef<Record<string, string>>({})
  // Words the wall's open mic heard that weren't said to Casa are dropped from what's shown (P3.13).
  const { messages, asidesInARow } = useMemo(() => withoutAsides(allMessages), [allMessages])

  // When each message first appeared (messages carry no time of their own), for bug reports.
  useEffect(() => {
    for (const m of allMessages) if (!seenAt.current[m.id]) seenAt.current[m.id] = new Date().toISOString()
    if (allMessages.length > 0) lastConversation = { messages: allMessages, seenAt: { ...seenAt.current }, sessionId: session?.id ?? null }
  }, [allMessages, session?.id])
  const forReport = useCallback(() => conversationForReport({ messages: allMessages, seenAt: seenAt.current, sessionId: session?.id ?? null }, lastConversation), [allMessages, session?.id])

  const { question, answer } = latestExchange(messages)
  const pending = pendingAction(messages)
  // After a typed or spoken "yes" the server confirmed, what was just saved is what to open ("Open it", on the
  // computer's panel and the phone as on the wall).
  const confirmedCard = answer?.confirmsDraft ? [...messages].reverse().find((m) => m.role === 'assistant' && !m.confirmsDraft && m.toolAction) ?? null : null
  const pointAt = answerEventId(answer) ?? answerEventId(confirmedCard)

  // `extra`: what the plan's Agree card chose (the unticked), sent with the yes.
  const confirm = useCallback(async (extra?: Record<string, unknown>) => {
    const message = pending
    const action = message?.toolAction
    if (!message || !action || working) return
    setWorking(true)
    setNote(null)
    updateMessageToolStatus(message.id, 'loading')
    const args = action.tool === 'apply_plan' ? { ...action.args, ...extra, surface } : requestArgsFor(action.tool, action.args, events)
    const { data, error } = await supabase.functions.invoke('execute-ai-action', {
      body: {
        tool: action.tool,
        args,
        action_id: message.id,
        session_id: session?.id ?? null,
        correlation_id: `${session?.id ?? 'no-session'}:${message.id}:${Date.now().toString(36)}`,
        lane: 'voice',
        device_id: getAssistantDeviceId(),
        client_trace_source: surface === 'wall' ? 'wall-band-confirmation' : 'phone-assistant-confirmation',
        confirmed_by_user: true,
      },
    })
    const result = readActionResult(await responseBody(data, error), args)
    setWorking(false)
    if (result.kind === 'conflict') {
      updateMessageToolStatus(message.id, 'pending', { args: result.args } as never)
      setNote(surface === 'wall' ? 'That clashes with something already on the calendar. Say yes, or tap Yes, to add it anyway.' : 'That clashes with something already on the calendar. Tap Yes to add it anyway.')
      return
    }
    if (result.kind === 'error') {
      updateMessageToolStatus(message.id, 'error', { errorMsg: result.message })
      setNote(result.message)
      return
    }
    updateMessageToolStatus(message.id, 'done', { actionId: result.actionId, resultEventId: result.eventId, ...(result.plan ? { planResult: result.plan, args } : {}) } as never)
    // What was just added shows at once — on the day and behind "Open it" — rather than after the calendar is fetched
    // again while the server is busy with it (optimisticEvent.ts; Kelly's gym add, Oct 2).
    if (action.tool === 'create_event' && result.eventId) {
      const added = optimisticEvent(result.eventId, args, queryClient.getQueryData<Array<{ id: string; name: string; full_name?: string | null }>>(['family-members']) ?? [])
      queryClient.setQueriesData({ predicate: (q) => q.queryKey[0] === 'events' && q.queryKey[1] !== 'week-index' && (q.queryKey[1] !== 'all-reminders' || added?.event_type === 'reminder') }, (old: unknown) => withEvent(old, added))
    }
    invalidateAllCalendarQueries(queryClient, String(args.event_id ?? args.id ?? result.eventId ?? ''))
    // The to-do list and Coming up live beside the calendar: a new to-do or project shows at once.
    void queryClient.invalidateQueries({ queryKey: ['todos'] })
    void queryClient.invalidateQueries({ queryKey: ['coming-up'] })
    if (action.tool === 'apply_plan') void queryClient.invalidateQueries({ queryKey: ['grocery'] })
    // A plan says what it saved on its own card (board 12d), not in a note.
    setNote(action.tool === 'apply_plan' ? null : 'Done.')
  }, [pending, working, events, session?.id, updateMessageToolStatus, queryClient, surface])

  // "Undo this plan" (board 12d): everything the plan made comes off, until the end of the next day.
  const undoPlan = useCallback(async (messageId: string) => {
    const message = allMessages.find((m) => m.id === messageId)
    const planId = message?.toolAction?.planResult?.plan_id
    if (!message?.toolAction || !planId || working) return
    setWorking(true)
    const { data, error } = await supabase.functions.invoke('execute-ai-action', {
      body: { tool: 'undo_plan', args: { plan_id: planId }, session_id: session?.id ?? null, lane: 'voice', device_id: getAssistantDeviceId(), client_trace_source: surface === 'wall' ? 'wall-band-confirmation' : 'phone-assistant-confirmation', confirmed_by_user: true },
    })
    const result = readActionResult(await responseBody(data, error), {})
    setWorking(false)
    if (result.kind !== 'done') { setNote(result.kind === 'error' ? result.message : 'That didn’t undo. Nothing changed.'); return }
    updateMessageToolStatus(message.id, 'done', { planResult: { ...message.toolAction.planResult, undone: true } } as never)
    invalidateAllCalendarQueries(queryClient, '')
    for (const key of ['todos', 'coming-up', 'grocery']) void queryClient.invalidateQueries({ queryKey: [key] })
    setNote('Undone. Nothing from that plan is left.')
  }, [allMessages, working, session?.id, surface, updateMessageToolStatus, queryClient])

  // A yes the server heard ("yes, change it"): save the card on screen, once. A plan's yes opens its
  // Agree card first (board 12c), so the whole list is seen before anything saves.
  const confirmedFor = useRef<string | null>(null)
  const [agreeAsked, setAgreeAsked] = useState(0)
  useEffect(() => {
    if (!answer?.confirmsDraft || !pending || confirmedFor.current === answer.id) return
    confirmedFor.current = answer.id
    if (pending.toolAction?.tool === 'apply_plan') setAgreeAsked((n) => n + 1)
    else void confirm()
  }, [answer?.confirmsDraft, answer?.id, pending, confirm])

  const cancel = useCallback(() => {
    if (!pending) return
    updateMessageToolStatus(pending.id, 'cancelled')
    setNote('Okay, nothing changed.')
    // A card turned down within seconds is often a card that got it wrong (P3.17): filed with
    // the conversation as an automatic report (a weaker signal than a correction — reviewed by pattern).
    const shownAt = Date.parse(seenAt.current[pending.id] ?? '')
    if (Number.isFinite(shownAt) && Date.now() - shownAt < QUICK_CANCEL_MS) {
      void sendBugReport({
        event: 'auto_bug_report',
        detail: `card_cancelled_fast: ${pending.toolAction?.displayText ?? pending.toolAction?.tool ?? ''}`.slice(0, 300),
        sessionId: session?.id,
        page: surface,
        payload: {
          signal: 'card_cancelled_fast',
          page: surface,
          seconds_shown: Math.round((Date.now() - shownAt) / 100) / 10,
          card: pending.toolAction ? { tool: pending.toolAction.tool, args: pending.toolAction.args, shown: pending.toolAction.displayText } : null,
          conversation: allMessages.slice(-10).map((m) => ({ role: m.role, content: m.content.slice(0, 600) })),
        },
      }).catch(() => {})
    }
  }, [pending, updateMessageToolStatus, session?.id, surface, allMessages])

  /** Changes the waiting action in place (a driver picked on the card), without a round trip. */
  const setPendingArgs = useCallback((patch: Record<string, unknown>) => {
    if (!pending?.toolAction) return
    updateMessageToolStatus(pending.id, 'pending', { args: { ...pending.toolAction.args, ...patch } } as never)
  }, [pending, updateMessageToolStatus])

  return { messages, asidesInARow, loading, status, send, session, question, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs, undoPlan, agreeAsked }
}
