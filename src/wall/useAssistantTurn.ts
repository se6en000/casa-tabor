import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
  const { messages: allMessages, loading, send, session, updateMessageToolStatus } = useAIAssistant({ page: surface, events, family, onSessionEnd })
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
    updateMessageToolStatus(message.id, 'done', { actionId: result.actionId, resultEventId: result.eventId })
    invalidateAllCalendarQueries(queryClient, String(args.event_id ?? args.id ?? result.eventId ?? ''))
    setNote('Done.')
  }, [pending, working, events, session?.id, updateMessageToolStatus, queryClient, surface])

  // A yes the server heard ("yes, change it"): save the card on screen, once.
  const confirmedFor = useRef<string | null>(null)
  useEffect(() => {
    if (!answer?.confirmsDraft || !pending || confirmedFor.current === answer.id) return
    confirmedFor.current = answer.id
    void confirm()
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

  return { messages, asidesInARow, loading, send, session, question, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport, setPendingArgs }
}
