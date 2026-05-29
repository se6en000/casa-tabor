import { useState, useCallback, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import type { EventWithDetails } from './useCalendarEvents'
import type { FamilyMember } from '../types'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageDataUrl?: string   // thumbnail shown in user bubble
  action?: AssistantAction
}

export type AssistantAction =
  | { action: 'create_event'; title: string; start: string; end: string; location: string | null; members: string[]; needs_clarification: string | null }
  | { action: 'update_event'; id: string; changes: Record<string, string>; needs_clarification: string | null }
  | { action: 'delete_event'; id: string; title: string; needs_clarification: string | null }

interface AssistantContext {
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
}

const genId = (): string =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36)

function buildContext(ctx: AssistantContext) {
  const now = new Date()
  // Get local UTC offset in ±HH:MM format (e.g. "-04:00" for EDT)
  const offsetMins = -now.getTimezoneOffset()
  const offsetSign = offsetMins >= 0 ? '+' : '-'
  const offsetAbs = Math.abs(offsetMins)
  const utcOffset = `${offsetSign}${String(Math.floor(offsetAbs / 60)).padStart(2, '0')}:${String(offsetAbs % 60).padStart(2, '0')}`

  return {
    page: ctx.page,
    currentDate: now.toLocaleString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }),
    utcOffset,
    events: ctx.events.map(e => ({
      id: e.id,
      title: e.title,
      start_time: e.start_time,
      end_time: e.end_time,
      location_name: e.location_name ?? null,
      members: e.members.map(m => m.family_member?.name ?? '').filter(Boolean),
      category: e.enrichment?.category ?? null,
    })),
    family: ctx.family.map(f => ({ id: f.id, name: f.name })),
    homeCity: ctx.homeCity,
  }
}

export function useAIAssistant(ctx: AssistantContext) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [loading, setLoading] = useState(false)

  // Keep refs current so `send` never goes stale and never needs to be recreated
  const messagesRef = useRef(messages)
  const ctxRef = useRef(ctx)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { ctxRef.current = ctx })

  const send = useCallback(async (text: string, image?: { dataUrl: string; mimeType: string }) => {
    const userMsg: ChatMessage = {
      id: genId(),
      role: 'user',
      content: text,
      imageDataUrl: image?.dataUrl,
    }
    setMessages(prev => [...prev, userMsg])
    setLoading(true)

    // Strip dataUrl prefix to get raw base64 for the API
    const imagePayload = image
      ? { mimeType: image.mimeType, data: image.dataUrl.replace(/^data:[^;]+;base64,/, '') }
      : undefined

    try {
      const allMsgs = [...messagesRef.current, userMsg].map(m => ({ role: m.role, content: m.content }))
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: { messages: allMsgs, context: buildContext(ctxRef.current), image: imagePayload },
      })
      if (error) throw error

      if (data.type === 'action' || data.type === 'multi_action') {
        const actions: AssistantAction[] = data.type === 'multi_action' ? data.actions : [data.action]
        
        // Find first action that needs clarification
        const needsClarification = actions.find(a => a.needs_clarification)
        if (needsClarification) {
          setMessages(prev => [...prev, {
            id: genId(),
            role: 'assistant',
            content: needsClarification.needs_clarification!,
            action: needsClarification,
          }])
        } else {
          // Queue all actions as separate confirmation cards
          const newMsgs: ChatMessage[] = actions.map(action => {
            const label = action.action === 'create_event'
              ? `Create: **${action.title}**`
              : action.action === 'update_event'
              ? `Update event`
              : `Delete: **${(action as { title: string }).title}**`
            return { id: genId(), role: 'assistant' as const, content: label, action }
          })
          setMessages(prev => [...prev, ...newMsgs])
        }
      } else {
        setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: data.text }])
      }
    } catch (e) {
      setMessages(prev => [...prev, { id: genId(), role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }])
      console.error('[useAIAssistant]', e)
    } finally {
      setLoading(false)
    }
  }, []) // stable — uses refs internally

  const reset = useCallback(() => setMessages([]), [])

  return { messages, loading, send, reset }
}
