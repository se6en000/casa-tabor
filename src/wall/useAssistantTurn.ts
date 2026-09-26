import { useCallback, useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAIAssistant } from '../hooks/useAIAssistant'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'
import { answerEventId, latestExchange, pendingAction } from './assistant'
import { readActionResult, requestArgsFor, responseBody } from './assistantActions'
import { conversationForReport, type ReportConversation } from './bugReport'

// The last conversation with something in it, kept past its band or sheet closing, so a
// report opened afterwards still carries it.
let lastConversation: ReportConversation | null = null

/**
 * One conversation with the assistant as the Wall's band and the phone both hold it:
 * the existing assistant (useAIAssistant), its latest exchange, the action waiting for a
 * yes, and that yes (or no) through `execute-ai-action`. `surface` labels the traces.
 */
export function useAssistantTurn({ surface, events, family, onSessionEnd }: { surface: 'wall' | 'phone'; events: EventWithDetails[]; family: FamilyMember[]; onSessionEnd?: () => void }) {
  const queryClient = useQueryClient()
  const { messages, loading, send, session, updateMessageToolStatus } = useAIAssistant({ page: surface, events, family, onSessionEnd })
  const [note, setNote] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const seenAt = useRef<Record<string, string>>({})

  // When each message first appeared (messages carry no time of their own), for bug reports.
  useEffect(() => {
    for (const m of messages) if (!seenAt.current[m.id]) seenAt.current[m.id] = new Date().toISOString()
    if (messages.length > 0) lastConversation = { messages, seenAt: { ...seenAt.current }, sessionId: session?.id ?? null }
  }, [messages, session?.id])
  const forReport = useCallback(() => conversationForReport({ messages, seenAt: seenAt.current, sessionId: session?.id ?? null }, lastConversation), [messages, session?.id])

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

  const cancel = useCallback(() => {
    if (!pending) return
    updateMessageToolStatus(pending.id, 'cancelled')
    setNote('Okay, nothing changed.')
  }, [pending, updateMessageToolStatus])

  return { messages, loading, send, session, question, answer, pending, pointAt, confirm, cancel, working, note, setNote, forReport }
}
