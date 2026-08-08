import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, Keyboard, RotateCcw, MessagesSquare, Plus, Square, CalendarDays, ShoppingCart, ChefHat, Pencil, AlertTriangle, Clock3, Utensils, Bell, UserPlus, MapPin, Mail, Activity } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { useAIAssistant, type AIMessage } from '../../hooks/useAIAssistant'
import {
  useSpeechInput,
  IS_SAFE_MODE,
  type VoiceTranscriptRevision,
} from '../../hooks/useSpeechInput'
import { useLedStrip } from '../../hooks/useLedStrip'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'
import BounceScroll from '../shared/BounceScroll'
import MarkdownContent from '../shared/MarkdownContent'
import { Button, Card, Heading, IconButton, LiveTranscript, Text } from '../ui'
import { formatTextForMarkdown, stripEvidenceCitationMarkers } from '../../lib/assistantMarkdown.mjs'
import { createAssistantTraceContext, emitAssistantTrace, getAssistantDeviceId } from '../../lib/assistantTelemetry'
import { classifyPendingConfirmation } from '../../lib/assistantConfirmation.mjs'
import { conversationStateAfterCalendarAction } from '../../lib/assistantConversationState.mjs'
import { linkAssistantEventMentions, parseAssistantEventHref } from '../../lib/assistantEventLinks'
import { buildCreatePreviewCopy, buildDeleteManyPreviewCopy, buildDeletePreviewCopy, buildUpdatePreviewCopy } from '../../utils/aiConfirmPreview'

const LOW_CONFIDENCE_CONFIRM_PHRASES = /\b(yes|yeah|yep|ok|okay|use it|that one|correct|right|go ahead)\b/i
const LOW_CONFIDENCE_REJECT_PHRASES = /\b(no|nope|try again|wrong|not that|cancel)\b/i

const NO_ACTIVITY_AUTO_CLOSE_MS = 30_000
const CONVERSATION_MODE_KEY = 'casa_ai_conversation_mode'

type PendingVoiceAction = {
  messageId: string
  state: 'pending' | 'executing'
  confirm: () => Promise<boolean>
  cancel: () => Promise<boolean>
}



interface Props {
  open: boolean
  onClose: () => void
  anchor?: { right: number; top: number }
  page: string
  launchContext?: {
    launchId: string
    prompt?: string
    autoSend?: boolean
    source?: string
    page?: string
    agent?: 'general' | 'chef'
    traceId?: string
    wakeAt?: number
  }
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  onSleepCommand?: () => void
  focusedEvent?: EventWithDetails
  onOpenEventDetails?: (event: EventWithDetails) => void
}

const SLEEP_PHRASES = /\b(sleep|goodnight|good night|art mode|screen saver|screensaver|night mode)\b/i

export default function AIChatDrawer({
  open,
  onClose,
  anchor,
  page,
  launchContext,
  events,
  family,
  homeCity,
  onSleepCommand,
  focusedEvent,
  onOpenEventDetails,
}: Props) {
  const [input, setInput] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceTranscriptRevision>({
    committed: '',
    interim: '',
    isFinal: false,
  })
  const interimRef = useRef('')
  const idleAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadUserInteractionRef = useRef(false)
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [conversationMode, setConversationMode] = useState<boolean>(() => {
    // Conversational by default: opening the assistant starts listening and
    // re-arms between turns until dismissed. Users can opt into press-to-talk
    // via the Convo toggle (persisted).
    try {
      const stored = localStorage.getItem(CONVERSATION_MODE_KEY)
      return stored === null ? true : stored === '1'
    } catch { return true }
  })
  const conversationModeRef = useRef(conversationMode)
  useEffect(() => {
    conversationModeRef.current = conversationMode
    try { localStorage.setItem(CONVERSATION_MODE_KEY, conversationMode ? '1' : '0') } catch { /* ignore */ }
  }, [conversationMode])
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { messages, loading, send, reset, session, sessionLoading, startFresh, primeMessages, appendSyntheticMessage, updateMessageToolStatus } = useAIAssistant({
    page,
    assistantMode: launchContext?.agent ?? 'general',
    events,
    family,
    homeCity,
    focusedEvent,
    onSessionEnd: onClose,
  })

  const led = useLedStrip()

  const proactiveNudge = useMemo(
    () => (open ? deriveProactiveNudge(events, new Date()) : null),
    [open, events],
  )

  useEffect(() => {
    if (!open) return

    const root = document.documentElement
    const body = document.body
    const appMain = document.querySelector<HTMLElement>('.app-shell-main')
    const previous = {
      rootOverflow: root.style.overflow,
      rootOverscroll: root.style.overscrollBehavior,
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      appMainTouchAction: appMain?.style.touchAction ?? '',
      appMainOverscroll: appMain?.style.overscrollBehavior ?? '',
    }

    root.style.overflow = 'hidden'
    root.style.overscrollBehavior = 'none'
    body.style.overflow = 'hidden'
    body.style.overscrollBehavior = 'none'
    if (appMain) {
      appMain.style.touchAction = 'none'
      appMain.style.overscrollBehavior = 'none'
    }

    return () => {
      root.style.overflow = previous.rootOverflow
      root.style.overscrollBehavior = previous.rootOverscroll
      body.style.overflow = previous.bodyOverflow
      body.style.overscrollBehavior = previous.bodyOverscroll
      if (appMain) {
        appMain.style.touchAction = previous.appMainTouchAction
        appMain.style.overscrollBehavior = previous.appMainOverscroll
      }
    }
  }, [open])

  const dynamicSuggestions = useMemo(
    () => buildDynamicSuggestions(page, events, new Date()),
    [page, events],
  )
  const eventById = useMemo(
    () => new Map(events.map((event) => [event.id, event])),
    [events],
  )

  const pendingVoiceActionRef = useRef<PendingVoiceAction | null>(null)
  const pendingLowConfidenceRef = useRef<{ transcript: string; confidence: number } | null>(null)
  // Ref to speech.stop — avoids circular dependency when calling stop inside useSpeechInput callbacks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechStopRef = useRef<() => void>(() => {})
  const latestVoiceConfidenceRef = useRef<number | null>(null)
  const appliedLaunchRef = useRef<string | null>(null)
  const firedChefGreetRef = useRef<string | null>(null)
  const activeTraceRef = useRef<ReturnType<typeof createAssistantTraceContext> | null>(null)
  const queuedVoiceTurnsRef = useRef<Array<{ text: string; confidence?: number | null }>>([])

  const registerPendingVoiceAction = useCallback((
    messageId: string,
    handlers: Pick<PendingVoiceAction, 'confirm' | 'cancel'> | null,
  ) => {
    if (handlers) {
      pendingVoiceActionRef.current = { messageId, state: 'pending', ...handlers }
      return
    }
    if (pendingVoiceActionRef.current?.messageId === messageId) {
      pendingVoiceActionRef.current = null
    }
  }, [])

  const clearIdleAutoCloseTimer = useCallback(() => {
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current)
      idleAutoCloseTimerRef.current = null
    }
  }, [])

  const handleOpenEventDetails = useCallback((eventId: string) => {
    const event = eventById.get(eventId)
    if (!event) return
    onClose()
    onOpenEventDetails?.(event)
  }, [eventById, onClose, onOpenEventDetails])

  const markUserInteraction = useCallback(() => {
    hadUserInteractionRef.current = true
    clearIdleAutoCloseTimer()
  }, [clearIdleAutoCloseTimer])

  const clearVoiceTranscript = useCallback(() => {
    setVoiceTranscript({ committed: '', interim: '', isFinal: false })
  }, [])

  const activePendingToolMessage = [...messages]
    .reverse()
    .find(message => message.toolAction?.status === 'pending')
  const hasPendingToolAction = Boolean(activePendingToolMessage)
  const activePendingToolMessageId = activePendingToolMessage?.id

  const dispatchPendingConfirmation = useCallback((text: string) => {
    const intent = classifyPendingConfirmation(text)
    const pending = pendingVoiceActionRef.current
    if (!intent || !pending || pending.state !== 'pending') return false

    pending.state = 'executing'
    appendSyntheticMessage({
      id: crypto.randomUUID(),
      role: 'user',
      content: text.trim(),
    })
    void Promise.resolve(intent === 'confirm' ? pending.confirm() : pending.cancel())
    return true
  }, [appendSyntheticMessage])

  const sendTraced = useCallback((
    text: string,
    image?: { dataUrl: string; mimeType: string },
    fromVoice = false,
  ) => {
    const baseTrace = activeTraceRef.current ?? createAssistantTraceContext({
      page,
      lane: fromVoice ? 'voice' : 'text',
      source: launchContext?.source ?? 'assistant_drawer',
    })
    activeTraceRef.current = baseTrace
    return send(text, image, createAssistantTraceContext({
      traceId: baseTrace.traceId,
      turnId: crypto.randomUUID(),
      page,
      lane: fromVoice ? 'voice' : 'text',
      source: launchContext?.source ?? 'assistant_drawer',
    }))
  }, [send, page, launchContext?.source])

  const sendCurrentInput = useCallback((text: string, opts?: { fromVoice?: boolean; confidence?: number | null }) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (dispatchPendingConfirmation(trimmed)) {
      setInput('')
      interimRef.current = ''
      clearVoiceTranscript()
      if (textareaRef.current) textareaRef.current.value = ''
      return
    }
    if (loading) {
      if (opts?.fromVoice) {
        queuedVoiceTurnsRef.current.push({ text: trimmed, confidence: opts.confidence })
        const trace = activeTraceRef.current
        if (trace) {
          emitAssistantTrace('voice_turn_queued', trace, {
            payload: {
              word_count: trimmed.split(/\s+/).length,
              queue_depth: queuedVoiceTurnsRef.current.length,
            },
          })
        }
      }
      return
    }
    if (pendingLowConfidenceRef.current) {
      const pending = pendingLowConfidenceRef.current
      if (LOW_CONFIDENCE_CONFIRM_PHRASES.test(trimmed)) {
        pendingLowConfidenceRef.current = null
        appendSyntheticMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `Great — using “${pending.transcript}.”`,
        })
        setInput('')
        interimRef.current = ''
        clearVoiceTranscript()
        if (textareaRef.current) textareaRef.current.value = ''
        void sendTraced(pending.transcript, undefined, true)
        return
      }
      if (LOW_CONFIDENCE_REJECT_PHRASES.test(trimmed)) {
        pendingLowConfidenceRef.current = null
        setInput('')
        interimRef.current = ''
        clearVoiceTranscript()
        if (textareaRef.current) textareaRef.current.value = ''
        appendSyntheticMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: "No problem — please say it again.",
        })
        return
      }
      pendingLowConfidenceRef.current = null
    } else if (opts?.fromVoice) {
      const confidence = opts.confidence
      const isLowConfidenceShortVoice = typeof confidence === 'number' && confidence < 0.75 && trimmed.length < 10
      if (isLowConfidenceShortVoice) {
        pendingLowConfidenceRef.current = { transcript: trimmed, confidence }
        setInput('')
        interimRef.current = ''
        clearVoiceTranscript()
        if (textareaRef.current) textareaRef.current.value = ''
        appendSyntheticMessage({
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I heard “${trimmed}” with low confidence (${Math.round(confidence * 100)}%). Say “yes” to use it, say “no” to retry, or just say the corrected phrase.`,
        })
        return
      }
    }
    if (opts?.fromVoice) {
      // Show the full captured text in the input box so the user can verify what was heard.
      // React batches setInput(text)+setInput('') in the same tick → text never renders.
      // By setting input to trimmed first and deferring the clear, we guarantee at least
      // one paint with the full transcript visible before it dissolves.
      setInput(trimmed)
      if (textareaRef.current) textareaRef.current.value = trimmed
      void sendTraced(trimmed, undefined, true)
      setTimeout(() => {
        setInput('')
        interimRef.current = ''
        clearVoiceTranscript()
        if (textareaRef.current) textareaRef.current.value = ''
      }, 800)
    } else {
      setInput('')
      interimRef.current = ''
      clearVoiceTranscript()
      if (textareaRef.current) textareaRef.current.value = ''
      void sendTraced(trimmed)
    }
  }, [loading, sendTraced, appendSyntheticMessage, clearVoiceTranscript, dispatchPendingConfirmation])

  useEffect(() => {
    if (loading || queuedVoiceTurnsRef.current.length === 0) return
    const queued = queuedVoiceTurnsRef.current.shift()
    if (!queued) return
    const trace = activeTraceRef.current
    if (trace) {
      emitAssistantTrace('voice_turn_dequeued', trace, {
        payload: {
          word_count: queued.text.split(/\s+/).length,
          queue_depth: queuedVoiceTurnsRef.current.length,
        },
      })
    }
    const timer = setTimeout(() => {
      sendCurrentInput(queued.text, { fromVoice: true, confidence: queued.confidence })
    }, 0)
    return () => clearTimeout(timer)
  }, [loading, sendCurrentInput])

  const quickSaveRecipeSuggestion = useCallback(async (recipeMessage: string) => {
    if (loading) return
    markUserInteraction()
    const recipeExcerpt = recipeMessage.trim().slice(0, 3500)
    const prompt = [
      'Save the recipe you just suggested to my Recipe Library for 2 servings.',
      'Use your previous recipe details as the source of truth.',
      'Include complete ingredients with quantities/units and full numbered cooking steps.',
      'If you can find a suitable photo, include it; otherwise save without one.',
      recipeExcerpt ? `\nRecipe draft:\n${recipeExcerpt}` : '',
    ].join('\n')
    await sendTraced(prompt)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['cook-page-recipes'] }),
      qc.invalidateQueries({ queryKey: ['recipe-library'] }),
    ])
  }, [loading, markUserInteraction, qc, sendTraced])

  useEffect(() => {
    if (!open) {
      activeTraceRef.current = null
      pendingVoiceActionRef.current = null
      queuedVoiceTurnsRef.current = []
      return
    }
    const trace = createAssistantTraceContext({
      traceId: launchContext?.traceId ?? launchContext?.launchId,
      page,
      lane: launchContext?.source === 'wake_word' ? 'voice' : 'text',
      source: launchContext?.source ?? 'assistant_drawer',
      startedAt: launchContext?.wakeAt,
    })
    activeTraceRef.current = trace
    if (launchContext?.wakeAt) {
      emitAssistantTrace('wake_detected', trace, {
        at: new Date(launchContext.wakeAt).toISOString(),
        elapsedMs: 0,
      })
    }
    emitAssistantTrace('drawer_opened', trace, {
      payload: {
        wake_to_drawer_ms: launchContext?.wakeAt ? Date.now() - launchContext.wakeAt : null,
      },
    })
  }, [open, launchContext?.launchId, launchContext?.traceId, launchContext?.wakeAt, launchContext?.source, page])

  const speech = useSpeechInput({
    onTrace: (event, payload) => {
      const trace = activeTraceRef.current
      if (trace) {
        const utteranceId = typeof payload?.utterance_id === 'string' ? payload.utterance_id : undefined
        const asrTrace = utteranceId
          ? createAssistantTraceContext({
              traceId: trace.traceId,
              turnId: utteranceId,
              page,
              lane: 'voice',
              source: launchContext?.source ?? 'assistant_drawer',
              startedAt: trace.startedAt,
            })
          : trace
        emitAssistantTrace(event, asrTrace, { payload })
      }
    },
    onIncomplete: (fragment) => {
      appendSyntheticMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `I only caught “${fragment}…” Please finish the thought.`,
      })
    },
    onInterim: (interim, revision) => {
      if (interim.trim()) markUserInteraction()
      interimRef.current = interim
      setInput(interim)
      setVoiceTranscript(revision ?? {
        committed: '',
        interim,
        isFinal: false,
      })
    },
    onFinalTranscript: (text, meta) => {
      latestVoiceConfidenceRef.current = meta?.confidence ?? null
      if (text === '__SEND__') {
        const msg = interimRef.current || (textareaRef.current?.value ?? '')
        // Check for sleep command before sending to AI
        if (SLEEP_PHRASES.test(msg)) {
          onSleepCommand?.()
          setTimeout(onClose, 300)
          return
        }
        sendCurrentInput(msg, { fromVoice: true, confidence: latestVoiceConfidenceRef.current })
        // Don't clear interimRef here — sendCurrentInput (voice path) defers the clear
        // so the full captured text stays visible in the input for ~800ms.
        latestVoiceConfidenceRef.current = null
        // Press-to-talk (default): stop the mic after each voice message so the user
        // must tap again to speak. Conversation mode: keep the mic armed so the
        // assistant loop continues hands-free (input is auto-suppressed while the
        // AI is thinking, then re-armed when it finishes).
        if (!conversationModeRef.current) speechStopRef.current()
      } else {
        if (text.trim()) markUserInteraction()
        interimRef.current = text
        setInput(text)
        setVoiceTranscript({ committed: text, interim: '', isFinal: true })
      }
    },
    onDismiss: () => {
      markUserInteraction()
      void speechStopRef.current()
      // Verbal goodbye — clear session immediately so next open starts fresh
      startFresh()
      setTimeout(onClose, 400)
    },
    onAutoDismiss: () => {
      // A failed wake session is not user activity or a conversation to resume.
      startFresh()
      onClose()
    },
    autoDismissOnFailure: launchContext?.source === 'wake_word',
    onConfirm: () => {
      markUserInteraction()
      led.confirm()
      const pending = pendingVoiceActionRef.current
      const trace = activeTraceRef.current
      if (!pending || pending.state !== 'pending') {
        if (trace) {
          emitAssistantTrace('confirmation_ignored', trace, {
            detail: pending?.state === 'executing' ? 'Action is already executing' : 'No pending action',
            payload: { message_id: pending?.messageId ?? null },
          })
        }
        return
      }
      pending.state = 'executing'
      void Promise.resolve(pending.confirm())
    },
    onCancel:  () => {
      markUserInteraction()
      led.cancel()
      const pending = pendingVoiceActionRef.current
      const trace = activeTraceRef.current
      if (!pending || pending.state !== 'pending') {
        if (trace) {
          emitAssistantTrace('confirmation_ignored', trace, {
            detail: pending?.state === 'executing' ? 'Action is already executing' : 'No pending action',
            payload: { message_id: pending?.messageId ?? null },
          })
        }
        return
      }
      pending.state = 'executing'
      void Promise.resolve(pending.cancel())
    },
    hasPendingAction: hasPendingToolAction,
  })

  useEffect(() => {
    return () => {
      led.off()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    return () => {
      clearIdleAutoCloseTimer()
    }
  }, [clearIdleAutoCloseTimer])

  // Keep speechStopRef current so the onFinalTranscript callback can stop the mic
  // without creating a circular dependency on the speech object.
  useEffect(() => { speechStopRef.current = speech.stop }, [speech.stop])

  useEffect(() => {
    if (open) {
      hadUserInteractionRef.current = false
      setNudgeDismissed(false)
      clearIdleAutoCloseTimer()
      idleAutoCloseTimerRef.current = setTimeout(() => {
        if (!hadUserInteractionRef.current) {
          startFresh()
          onClose()
        }
      }, NO_ACTIVITY_AUTO_CLOSE_MS)
      if (IS_SAFE_MODE) return
      // Launch intent controls the initial mode: wake word is voice-first;
      // manual opens remain text-first even when conversation mode is enabled.
      if (launchContext?.source === 'wake_word' && !launchContext?.prompt) {
        speech.start()
      }
      // Focus textarea slightly after animation settles (UI only, doesn't affect mic)
      setTimeout(() => textareaRef.current?.focus(), 300)
    } else {
      clearIdleAutoCloseTimer()
      speech.stop()
      led.off()
      reset()
      setInput('')
      interimRef.current = ''
      clearVoiceTranscript()
      pendingLowConfidenceRef.current = null
      latestVoiceConfidenceRef.current = null
      setAttachedImage(null)
      setAttachmentMenuOpen(false)
      freshStartedRef.current = null  // allow fresh start next time this event is opened
      firedChefGreetRef.current = null
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !launchContext?.launchId) return
    if (appliedLaunchRef.current === launchContext.launchId) return
    appliedLaunchRef.current = launchContext.launchId
    const prompt = launchContext.prompt?.trim() ?? ''
    if (!prompt) return
    markUserInteraction()
    setInput(prompt)
    interimRef.current = prompt
    setTimeout(() => textareaRef.current?.focus(), 50)
    if (launchContext.autoSend) {
      setTimeout(() => sendCurrentInput(prompt), 0)
    }
  }, [open, launchContext?.launchId, launchContext?.prompt, launchContext?.autoSend, markUserInteraction, sendCurrentInput])

  const buildCorrelationId = useCallback((suffix: string) => {
    const sessionPart = session?.id ?? 'no-session'
    return `${sessionPart}:${suffix}:${Date.now().toString(36)}`
  }, [session?.id])

  // When in event-edit mode, always start a fresh session so old conversations don't bleed in.
  const firedEventGreetRef = useRef<string | null>(null)
  const freshStartedRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !focusedEvent) return
    if (freshStartedRef.current === focusedEvent.id) return
    freshStartedRef.current = focusedEvent.id
    firedEventGreetRef.current = null  // reset so greet fires after fresh start
    startFresh()
  }, [open, focusedEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Once session is fresh (no messages), inject a deterministic event summary greeting
  // so the user immediately sees what event the AI has loaded — no API round-trip needed.
  useEffect(() => {
    if (!open || !focusedEvent || loading) return
    if (firedEventGreetRef.current === focusedEvent.id) return
    if (sessionLoading) return
    if (messages.length > 0) { firedEventGreetRef.current = focusedEvent.id; return }
    firedEventGreetRef.current = focusedEvent.id

    const ev = focusedEvent
    const memberNames = ev.members.map(m => m.family_member?.name).filter(Boolean).join(', ')
    const start = new Date(ev.start_time)
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    const timeStr = ev.all_day ? 'All day' : start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

    const missing: string[] = []
    if (!ev.location_name) missing.push('Location')
    if (!memberNames) missing.push('Attendees')
    if (!ev.enrichment?.category) missing.push('Category')
    if (!ev.description && !ev.enrichment?.prep_notes) missing.push('Notes')

    let content = `I'm ready to edit **${ev.title}** ✏️\n\n`
    content += `📅 ${dateStr} at ${timeStr}\n`
    if (ev.location_name) content += `📍 ${ev.location_name}\n`
    if (memberNames) content += `👥 ${memberNames}\n`
    if (ev.enrichment?.category) content += `🏷️ ${ev.enrichment.category}\n`
    if (missing.length > 0) {
      content += `\n⚠️ Missing: ${missing.join(', ')} — want me to help fill those in?\n`
    } else {
      content += `\nEverything looks filled in!`
    }
    content += `\n\nWhat would you like to change or add?`

    primeMessages([{ id: crypto.randomUUID(), role: 'assistant', content }])
  }, [open, focusedEvent?.id, sessionLoading, messages.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || focusedEvent || loading) return
    if (launchContext?.agent !== 'chef') return
    if (sessionLoading) return
    if (messages.length > 0) return
    if (firedChefGreetRef.current === launchContext.launchId) return
    firedChefGreetRef.current = launchContext.launchId
    primeMessages([{
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "Chef Agent online 👨‍🍳\n\nI can help you plan weeknight meals, optimize for budget/speed, build overlap-friendly grocery lists, and adapt dinners based on what's in your pantry.\n\nTry: “Plan 4 quick dinners under 30 minutes” or “Use what we already have and keep cost low.”",
    }])
  }, [open, focusedEvent, loading, launchContext?.agent, launchContext?.launchId, sessionLoading, messages.length, primeMessages])

  // While AI is thinking, suppress new voice input (don't stop the mic — avoids fade/blue flicker)
  useEffect(() => {
    if (loading) {
      speech.suppress()
    } else {
      speech.unsuppress()
      // WebSpeech naturally ends after each utterance — restart it if it went idle while AI was thinking
      if (open) setTimeout(() => speech.ensureRunning(), 300)
    }
  }, [loading]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  // LED state machine — keep deterministic phase sync so LEDs can't get stuck.
  useEffect(() => {
    if (!open) {
      led.off()
      return
    }
    if (loading || speech.phase === 'processing') {
      led.processing()      // amber while AI is thinking
      return
    }
    if (speech.listening || speech.connecting) {
      led.listening()       // blue when mic is active
      return
    }
    led.off()               // idle/typing mode keeps LEDs calm
  }, [loading, open, speech.connecting, speech.listening, speech.phase]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
    // When STT is actively streaming interim text, always scroll to the
    // bottom of the textarea so the latest captured words are visible.
    if (speech.listening || speech.connecting) {
      el.scrollTop = el.scrollHeight
    }
  }, [input, speech.listening, speech.connecting])

  const readImageFile = useCallback((file: File | Blob): Promise<{ dataUrl: string; mimeType: string }> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve({ dataUrl: reader.result as string, mimeType: file.type || 'image/png' })
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }, [])

  const handlePaste = useCallback(async (e: React.ClipboardEvent) => {
    const items = Array.from(e.clipboardData.items)
    const imageItem = items.find(i => i.type.startsWith('image/'))
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (blob) {
        markUserInteraction()
        setAttachedImage(await readImageFile(blob))
      }
    }
  }, [readImageFile, markUserInteraction])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      markUserInteraction()
      setAttachedImage(await readImageFile(file))
    }
    e.target.value = ''
  }, [readImageFile, markUserInteraction])

  const handleSend = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = (textareaRef.current?.value ?? input).trim()
    const img = attachedImage
    if ((!text && !img) || loading) return
    markUserInteraction()
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    setAttachedImage(null)
    if (!img && dispatchPendingConfirmation(text)) return
    void sendTraced(text || '(see attached image)', img ?? undefined)
  }, [input, attachedImage, loading, sendTraced, markUserInteraction, dispatchPendingConfirmation])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleInputChange = useCallback((value: string) => {
    if (value.trim()) markUserInteraction()
    if (value.trim() && (speech.listening || speech.connecting)) {
      speech.stop()
    }
    clearVoiceTranscript()
    setInput(value)
  }, [markUserInteraction, speech.connecting, speech.listening, speech.stop, clearVoiceTranscript])

  const handleKeyboardToggle = useCallback(() => {
    markUserInteraction()
    document.dispatchEvent(new CustomEvent('touch-keyboard:control', {
      detail: {
        target: textareaRef.current,
        toggle: true,
      },
    }))
  }, [markUserInteraction])

  const handleTypeInstead = useCallback(() => {
    markUserInteraction()
    void speech.stop()
    setTimeout(() => {
      textareaRef.current?.focus()
      if (document.documentElement.dataset.density === 'kiosk') {
        document.dispatchEvent(new CustomEvent('touch-keyboard:control', {
          detail: { target: textareaRef.current, open: true },
        }))
      }
    }, 80)
  }, [markUserInteraction, speech.stop])

  // Conversation mode: hands-free loop that keeps the mic armed between turns.
  // Enabling it immediately starts listening; disabling stops the mic.
  const handleConversationToggle = useCallback(() => {
    markUserInteraction()
    setConversationMode(prev => {
      const next = !prev
      if (next) {
        if (speech.supported && !speech.listening && !speech.connecting) speech.start()
      } else {
        speech.stop()
      }
      return next
    })
  }, [markUserInteraction, speech])

  const hasSession = !sessionLoading && !!session && session.messages.length > 0
  const voiceLevel = Math.max(0, Math.min(1, speech.volume / 100))
  const isVoiceActive = speech.listening && voiceLevel > 0.12
  const hasTypedInput = input.trim().length > 0 && !loading && !speech.listening
  const voiceComposerActive = speech.listening || speech.connecting || speech.phase === 'processing'
  const voiceDisplayPhase = loading ? 'processing' : speech.phase
  const aiPresence: 'off' | 'idle' | 'listening' | 'voice_active' | 'processing' | 'typing' =
    !open
      ? 'off'
      : loading || speech.phase === 'processing'
        ? 'processing'
        : hasTypedInput
          ? 'typing'
          : isVoiceActive
            ? 'voice_active'
            : speech.listening || speech.connecting
              ? 'listening'
              : 'idle'
  const presenceStyle = { ['--voice-level' as '--voice-level']: String(voiceLevel) } as React.CSSProperties

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-scrim max-sm:bg-black/40 sm:bg-transparent"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={cn(
              'fixed z-popover bg-casa-surface flex flex-col transition-shadow',
              'max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:w-full max-sm:shadow-modal',
              'sm:rounded-2xl sm:w-[760px] sm:shadow-[0_8px_40px_rgba(0,0,0,0.22)] sm:border sm:border-casa-border',
              loading && 'ai-thinking',
            )}
            data-panel-overlay
            data-touch-keyboard="ignore"
            style={{
              ...(window.innerWidth < 640 ? {
                maxHeight: '88vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
              } : {
                height: '72vh',
                right: anchor ? Math.max(8, anchor.right) : 16,
                top: anchor ? anchor.top + 6 : 56,
              })
            }}
            onClick={e => e.stopPropagation()}
            onPaste={handlePaste}
          >
            {/* Drag handle — mobile only */}
            <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
              <div className="w-9 h-1 bg-casa-divider rounded-full" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-casa-border">
              <div className="flex items-center gap-2.5">
                <div className={cn(
                  'w-7 h-7 rounded-full bg-casa-gold/10 flex items-center justify-center transition-all',
                  loading && 'bg-casa-gold/20',
                )}>
                  <Sparkles size={15} className={cn('text-casa-gold', loading && 'animate-pulse')} />
                </div>
                <p className="font-display text-heading text-casa-navy">
                  Casa Tabor AI
                  {loading && <span className="text-casa-gold text-caption font-normal ml-2">thinking…</span>}
                  {!loading && speech.listening && (
                    <span className="text-red-500 text-caption font-normal ml-2 flex items-center gap-1 inline-flex">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
                      listening
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {speech.supported && (
                  <Button variant="ghost"
                    type="button"
                    onClick={handleConversationToggle}
                    aria-pressed={conversationMode}
                    title={conversationMode
                      ? 'Conversation mode ON — mic stays on for hands-free back-and-forth. Tap to turn off.'
                      : 'Conversation mode OFF — tap to talk hands-free (mic re-arms after each reply).'}
                    className={cn(
                      'h-7 px-2 flex items-center gap-1 rounded-full text-caption font-medium transition-colors',
                      conversationMode
                        ? 'bg-casa-gold text-white'
                        : 'text-casa-muted hover:text-casa-navy hover:bg-casa-divider',
                    )}
                  >
                    <MessagesSquare size={13} />
                    {conversationMode && <span>Convo</span>}
                  </Button>
                )}
                {hasSession && (
                  <Button variant="ghost"
                    type="button"
                    onClick={startFresh}
                    title="New conversation"
                    className="size-control flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-button hover:bg-casa-divider outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
                    aria-label="New conversation"
                  >
                    <RotateCcw size={14} />
                  </Button>
                )}
                <Button variant="ghost"
                  type="button"
                  onClick={onClose}
                  className="size-control flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-button hover:bg-casa-divider outline-none transition-colors focus-visible:ring-2 focus-visible:ring-casa-gold"
                  aria-label="Close assistant"
                >
                  <X size={18} />
                </Button>
              </div>
            </div>

            {/* Messages */}
            <BounceScroll nativeScroll className="flex-1 min-h-0" innerClassName="px-4 py-4 space-y-3">
              {/* Session resume banner */}
              {hasSession && messages.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-casa-gold/8 border border-casa-gold/20 text-caption text-casa-muted">
                  <Sparkles size={11} className="text-casa-gold flex-shrink-0" />
                  <span>Resuming previous conversation</span>
                  <Button variant="ghost"
                    type="button"
                    onClick={startFresh}
                    className="ml-auto text-casa-gold font-semibold hover:underline"
                  >
                    New chat
                  </Button>
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Sparkles size={28} className="text-casa-gold opacity-60" />
                  <p className="text-body-sm font-semibold text-casa-navy">What can I help with?</p>
                  {proactiveNudge && !nudgeDismissed && (
                    <div className="w-full flex items-start gap-2 px-3 py-2.5 rounded-2xl bg-casa-gold/8 border border-casa-gold/25 text-left">
                      <Sparkles size={13} className="text-casa-gold flex-shrink-0 mt-0.5" />
                      <Button variant="ghost"
                        type="button"
                        onClick={() => { markUserInteraction(); sendCurrentInput(proactiveNudge.prompt) }}
                        className="flex-1 text-caption text-casa-navy leading-snug hover:underline"
                      >
                        {proactiveNudge.text}
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setNudgeDismissed(true)}
                        aria-label="Dismiss"
                        className="flex-shrink-0 text-casa-muted hover:text-casa-navy"
                      >
                        <X size={13} />
                      </Button>
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {dynamicSuggestions.map(s => (
                      <Button variant="ghost"
                        key={s}
                        onClick={() => { markUserInteraction(); setInput(s); textareaRef.current?.focus() }}
                        className="px-3 py-1.5 rounded-full border border-casa-border text-caption text-casa-muted hover:bg-casa-bg hover:text-casa-navy transition-colors"
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, messageIndex) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isActivePending={msg.id === activePendingToolMessageId}
                  events={events}
                  onOpenEventDetails={handleOpenEventDetails}
                  enableQuickSaveRecipe={page === 'cook' || launchContext?.agent === 'chef'}
                  editSeed={messages.slice(0, messageIndex).findLast((message) => message.role === 'user')?.content ?? ''}
                  onQuickSaveRecipe={quickSaveRecipeSuggestion}
                  onConfirmToolAction={async (messageId, tool, args) => {
                    updateMessageToolStatus(messageId, 'loading')
                    const actionTrace = activeTraceRef.current
                    const actionCorrelationId = buildCorrelationId(messageId)
                    if (actionTrace) {
                      emitAssistantTrace('confirmation_accepted', actionTrace, {
                        detail: 'Confirmation accepted',
                        payload: { message_id: messageId, tool },
                      })
                      emitAssistantTrace('action_execute_started', actionTrace, {
                        detail: tool,
                        payload: { message_id: messageId, tool, action_correlation_id: actionCorrelationId },
                      })
                    }
                    try {
                      const matchedEvent = tool === 'update_event'
                        ? events.find((event) => event.id === String(args.id ?? ''))
                        : undefined
                      const requestArgs = tool === 'update_event' && matchedEvent
                        ? { ...args, expected_updated_at: matchedEvent.updated_at }
                        : args
                      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
                        body: {
                          tool,
                          args: requestArgs,
                          action_id: messageId,
                          session_id: session?.id ?? null,
                          correlation_id: actionCorrelationId,
                          trace_id: actionTrace?.traceId ?? null,
                          turn_id: actionTrace?.turnId ?? null,
                          lane: actionTrace?.lane ?? 'llm',
                          device_id: getAssistantDeviceId(),
                          client_trace_present: Boolean(actionTrace),
                          client_build: typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'unknown',
                          client_trace_source: actionTrace?.source ?? 'ai-drawer-confirmation',
                        },
                      })
                      if (error) throw error
                      if (data?.success === false) throw new Error(data.error ?? 'Action failed')
                      updateMessageToolStatus(messageId, 'done', {
                        actionId: data?.action_id,
                        resultEventId: data?.event_id,
                        conversationState: conversationStateAfterCalendarAction(
                          tool,
                          requestArgs,
                          data,
                          new Date(),
                          msg.conversationState,
                        ),
                        syncWarning: data?.duplicate ? data?.message : data?.sync_warning,
                        syncStatus: data?.sync_status === 'queued' ? 'queued' : data?.sync_status === 'failed' ? 'failed' : 'synced',
                        undoStatus: 'idle',
                        undoErrorMsg: undefined,
                      })
                      qc.invalidateQueries({ queryKey: ['events'] })
                      qc.invalidateQueries({ queryKey: ['grocery'] })
                      if (actionTrace) {
                        emitAssistantTrace('action_execute_completed', actionTrace, {
                          detail: tool,
                          payload: { message_id: messageId, tool, action_correlation_id: actionCorrelationId },
                        })
                      }
                      return true
                    } catch (err) {
                      updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
                      if (actionTrace) {
                        emitAssistantTrace('action_execute_failed', actionTrace, {
                          detail: (err as Error).message,
                          payload: { message_id: messageId, tool, action_correlation_id: actionCorrelationId },
                        })
                      }
                      return false
                    }
                  }}
                  onUndoToolAction={async (messageId, actionId) => {
                    updateMessageToolStatus(messageId, 'done', { undoStatus: 'loading', undoErrorMsg: undefined })
                    try {
                      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
                        body: {
                          tool: 'undo_event_edit',
                          args: { action_id: actionId },
                          action_id: `${messageId}:undo`,
                          session_id: session?.id ?? null,
                          correlation_id: buildCorrelationId(`${messageId}:undo`),
                        },
                      })
                      if (error) throw error
                      if (data?.success === false) throw new Error(data.error ?? 'Undo failed')
                      updateMessageToolStatus(messageId, 'done', {
                        syncWarning: data?.sync_warning,
                        syncStatus: data?.sync_status === 'queued' ? 'queued' : data?.sync_status === 'failed' ? 'failed' : 'synced',
                        undoStatus: 'done',
                        undoErrorMsg: undefined,
                      })
                      qc.invalidateQueries({ queryKey: ['events'] })
                    } catch (err) {
                      updateMessageToolStatus(messageId, 'done', {
                        undoStatus: 'error',
                        undoErrorMsg: (err as Error).message,
                      })
                    }
                  }}
                  onCancelToolAction={(messageId) => {
                    updateMessageToolStatus(messageId, 'cancelled')
                    const trace = activeTraceRef.current
                    if (trace) {
                      emitAssistantTrace('confirmation_cancelled', trace, {
                        detail: 'Confirmation cancelled',
                        payload: { message_id: messageId },
                      })
                    }
                  }}
                  onRefreshToolAction={() => {
                    qc.invalidateQueries({ queryKey: ['events'] })
                  }}
                  registerPendingAction={registerPendingVoiceAction}
                  onEditMessage={(content) => {
                    markUserInteraction()
                    if (speech.listening || speech.connecting) speech.stop()
                    setInput(content)
                    interimRef.current = content
                    if (textareaRef.current) {
                      textareaRef.current.value = content
                      setTimeout(() => {
                        const el = textareaRef.current
                        if (!el) return
                        el.focus()
                        el.setSelectionRange(el.value.length, el.value.length)
                      }, 0)
                    }
                  }}
                />
              ))}

              {loading && !messages.some(m => m.streaming) && (
                <div className="flex items-center gap-2 text-casa-muted pl-1">
                  <Loader2 size={15} className="animate-spin text-casa-gold" />
                  <span className="text-caption">Thinking…</span>
                </div>
              )}
              <div ref={bottomRef} />
            </BounceScroll>

            {/* Input */}
            <div className="relative px-4 pb-5 pt-3 border-t border-casa-border">
              <AnimatePresence>
                {attachedImage && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2 overflow-hidden"
                  >
                    <div className="relative inline-block">
                      <img
                        src={attachedImage.dataUrl}
                        alt="Attached"
                        className="h-20 w-auto rounded-lg border border-casa-border object-cover"
                      />
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-3 -right-3 size-control rounded-button bg-casa-error text-white flex items-center justify-center shadow outline-none focus-visible:ring-2 focus-visible:ring-casa-gold"
                        aria-label="Remove attached image"
                      >
                        <X size={10} />
                      </Button>
                      <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/50 rounded px-1 py-0.5">
                        <ImageIcon size={9} className="text-white" />
                        <span className="text-caption text-white font-medium">Image attached</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className={cn(
                  'ai-presence-composer relative overflow-hidden bg-casa-bg rounded-xl border border-casa-border transition-all duration-300',
                  voiceComposerActive ? 'p-4' : 'px-3 py-2',
                  aiPresence === 'listening' && 'ai-presence-listening',
                  aiPresence === 'voice_active' && 'ai-presence-voice',
                  aiPresence === 'processing' && 'ai-presence-processing',
                  aiPresence === 'typing' && 'ai-presence-typing',
                  aiPresence === 'idle' && 'ai-presence-idle',
                )}
                style={presenceStyle}
              >
                <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

                {voiceComposerActive ? (
                  <div className="w-full">
                    <LiveTranscript
                      committed={voiceTranscript.committed}
                      interim={voiceTranscript.interim}
                      phase={voiceDisplayPhase}
                      volume={speech.volume}
                      className="rounded-none border-0 bg-transparent p-0 shadow-none"
                    />
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <Button
                        variant="subtle"
                        type="button"
                        onClick={handleTypeInstead}
                        className="min-h-control gap-2"
                      >
                        <Keyboard size={16} />
                        Type instead
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => { markUserInteraction(); speech.finish() }}
                        className="min-h-control gap-2"
                      >
                        <Square size={14} />
                        Stop
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full">
                    <AnimatePresence initial={false}>
                      {attachmentMenuOpen && (
                        <motion.div
                          id="assistant-attachment-actions"
                          initial={{ opacity: 0, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: 4 }}
                          className="mb-2 flex gap-2"
                        >
                          <Button
                            variant="subtle"
                            type="button"
                            onClick={() => {
                              setAttachmentMenuOpen(false)
                              fileInputRef.current?.click()
                            }}
                            className="min-h-control flex-1 gap-2"
                          >
                            <Paperclip size={16} /> Attach image
                          </Button>
                          <Button
                            variant="subtle"
                            type="button"
                            onClick={() => {
                              setAttachmentMenuOpen(false)
                              cameraInputRef.current?.click()
                            }}
                            className="min-h-control flex-1 gap-2"
                          >
                            <Camera size={16} /> Take photo
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <div className="flex items-end gap-2">
                      <Button variant="ghost"
                        type="button"
                        onClick={() => setAttachmentMenuOpen(value => !value)}
                        title="Add attachment"
                        className="size-control rounded-button text-casa-muted outline-none transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold"
                        aria-label="Add attachment"
                        aria-expanded={attachmentMenuOpen}
                        aria-controls="assistant-attachment-actions"
                      >
                        <Plus size={16} />
                      </Button>
                      <div className="relative min-w-0 flex-1">
                        <textarea
                          ref={textareaRef}
                          value={input}
                          onChange={e => handleInputChange(e.target.value)}
                          onKeyDown={handleKeyDown}
                          placeholder={attachedImage ? 'Ask about this image…' : 'Ask Casa anything…'}
                          rows={1}
                          aria-label="Assistant message"
                          className="w-full min-h-6 max-h-30 bg-transparent text-body text-casa-navy placeholder:text-casa-muted outline-none resize-none leading-relaxed"
                        />
                      </div>
                      {speech.supported && (
                        <Button variant="ghost"
                          type="button"
                          onClick={() => {
                            markUserInteraction()
                            setAttachmentMenuOpen(false)
                            speech.start()
                          }}
                          title="Start voice input"
                          className="min-h-control min-w-control rounded-button flex items-center justify-center gap-2 px-3 outline-none transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold bg-casa-divider text-casa-muted hover:text-casa-gold"
                          aria-label="Start voice input"
                        >
                          <Mic size={14} />
                          <span className="hidden md:inline">Speak</span>
                        </Button>
                      )}
                      <Button variant="ghost"
                        type="button"
                        onClick={handleKeyboardToggle}
                        title="Toggle on-screen keyboard"
                        className="ai-composer-kiosk-only size-control rounded-button items-center justify-center outline-none transition-all shrink-0 bg-casa-divider text-casa-muted hover:text-casa-gold focus-visible:ring-2 focus-visible:ring-casa-gold"
                        aria-label="Toggle on-screen keyboard"
                      >
                        <Keyboard size={14} />
                      </Button>
                      <Button variant="ghost"
                        type="button"
                        onClick={handleSend}
                        disabled={(!input.trim() && !attachedImage) || loading}
                        className={cn(
                          'size-control rounded-button flex items-center justify-center outline-none transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold',
                          (input.trim() || attachedImage) && !loading
                            ? 'bg-casa-gold text-white hover:brightness-110'
                            : 'bg-casa-divider text-casa-muted'
                        )}
                        aria-label="Send message"
                      >
                        <Send size={14} />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <p className="text-caption text-casa-muted mt-1.5 text-center opacity-60">
                {IS_SAFE_MODE
                  ? 'Safe mode enabled: voice capture is disabled'
                  : speech.bridgeDown
                    ? 'Voice bridge offline — text input still works'
                    : voiceComposerActive
                      ? loading
                        ? 'Sending automatically — Casa will listen again after replying'
                        : 'Pause to send · say "goodbye" to close'
                    : speech.supported
                      ? hasTypedInput
                        ? 'Typing mode active — voice paused'
                        : 'Type a message or choose Speak'
                      : 'Type a message and send'}
              </p>


            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Message Bubble ─────────────────────────────────────────── */

const MAX_VISIBLE_SOURCES = 3

function MessageBubble({ msg, isActivePending, enableQuickSaveRecipe, editSeed, events, onOpenEventDetails, onQuickSaveRecipe, onConfirmToolAction, onUndoToolAction, onCancelToolAction, onRefreshToolAction, registerPendingAction, onEditMessage }: {
  msg: AIMessage
  isActivePending: boolean
  enableQuickSaveRecipe?: boolean
  editSeed?: string
  events: EventWithDetails[]
  onOpenEventDetails?: (eventId: string) => void
  onQuickSaveRecipe?: (recipeMessage: string) => Promise<void>
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<boolean>
  onUndoToolAction: (messageId: string, actionId: string) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  onRefreshToolAction: () => void
  registerPendingAction: (
    messageId: string,
    handlers: Pick<PendingVoiceAction, 'confirm' | 'cancel'> | null,
  ) => void
  onEditMessage?: (content: string) => void
}) {
  const isUser = msg.role === 'user'
  const ta = msg.toolAction
  const [quickSaving, setQuickSaving] = useState(false)
  const [selectedEvidence, setSelectedEvidence] = useState<NonNullable<AIMessage['evidence']>[number] | null>(null)
  const [sourcesExpanded, setSourcesExpanded] = useState(false)
  const [showAllSources, setShowAllSources] = useState(false)
  const actionTransitionRef = useRef(false)
  const hasPendingAction = !!ta && ta.status === 'pending'
  const showQuickSaveRecipe = !isUser && !ta && Boolean(onQuickSaveRecipe) && Boolean(enableQuickSaveRecipe) && looksLikeRecipeSuggestion(msg.content)
  // A plain user text message can be tapped to edit + resend (no images / tool actions).
  const canEdit = isUser && !ta && !msg.imageDataUrl && Boolean(onEditMessage) && msg.content !== '(see attached image)' && Boolean(msg.content?.trim())
  const isStaleError = !!ta?.errorMsg && ta.errorMsg.toLowerCase().includes('changed since')
  const preferredEventId = msg.conversationState?.activeEntityType === 'event'
    ? msg.conversationState.activeEventId
    : ta?.resultEventId
  const assistantContent = !isUser && !ta
    ? formatTextForMarkdown(linkAssistantEventMentions(
        stripEvidenceCitationMarkers(msg.content),
        events,
        { preferredEventId },
      ))
    : null
  const isDestructiveAction =
    ta?.tool === 'delete_event' ||
    ta?.tool === 'delete_events_by_title' ||
    ta?.tool === 'remove_grocery_item' ||
    ta?.tool === 'clear_checked_grocery_items'
  const isDirectorySuggestion =
    ta?.tool === 'associate_family_contact' ||
    ta?.tool === 'associate_contact_place' ||
    ta?.tool === 'confirm_directory_entity'

  const doConfirm = useCallback(async () => {
    if (!ta || actionTransitionRef.current) return false
    actionTransitionRef.current = true
    return onConfirmToolAction(msg.id, ta.tool, ta.args)
  }, [msg.id, ta, onConfirmToolAction])

  const doConfirmCandidate = useCallback(async (candidateArgs: Record<string, unknown>) => {
    if (!ta || actionTransitionRef.current) return false
    actionTransitionRef.current = true
    return onConfirmToolAction(msg.id, ta.tool, candidateArgs)
  }, [msg.id, ta, onConfirmToolAction])

  const doCancel = useCallback(async () => {
    if (actionTransitionRef.current) return false
    actionTransitionRef.current = true
    onCancelToolAction(msg.id)
    return true
  }, [msg.id, onCancelToolAction])

  useEffect(() => {
    if (isActivePending && hasPendingAction) {
      registerPendingAction(msg.id, { confirm: doConfirm, cancel: doCancel })
    }
    return () => registerPendingAction(msg.id, null)
  }, [isActivePending, hasPendingAction, doConfirm, doCancel, msg.id, registerPendingAction])

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] rounded-2xl px-4 py-2.5 text-body-sm leading-relaxed',
          isUser
            ? 'bg-casa-navy text-white rounded-br-sm'
            : 'bg-casa-bg border border-casa-border text-casa-navy rounded-bl-sm',
          canEdit && 'cursor-pointer hover:brightness-110 transition',
        )}
        onClick={canEdit ? () => onEditMessage?.(msg.content) : undefined}
        title={canEdit ? 'Tap to edit and resend' : undefined}
      >
        {msg.imageDataUrl && (
          <img src={msg.imageDataUrl} alt="Attached" className="max-h-40 w-auto rounded-lg mb-2 object-cover" />
        )}
        {!ta && msg.content !== '(see attached image)' && msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap">{msg.content}</p>
            : (
              <MarkdownContent
                content={assistantContent ?? formatTextForMarkdown(msg.content)}
                onLinkClick={(href) => {
                  const eventId = parseAssistantEventHref(href)
                  if (!eventId) return
                  onOpenEventDetails?.(eventId)
                }}
              />
            )
        )}
        {!isUser && !ta && Boolean(msg.evidence?.length) && (
          <div className="mt-1">
            <div className="flex justify-end">
              <IconButton
                icon={<Activity size={14} strokeWidth={2} />}
                aria-label={`Sources checked (${msg.evidence?.length})`}
                title={`Sources checked · ${msg.evidence?.length}`}
                size="sm"
                className="text-casa-muted hover:text-casa-navy"
                aria-expanded={sourcesExpanded}
                aria-controls={`assistant-sources-${msg.id}`}
                onClick={() => {
                  setSourcesExpanded((expanded) => {
                    if (expanded) {
                      setShowAllSources(false)
                      setSelectedEvidence(null)
                    }
                    return !expanded
                  })
                }}
              />
            </div>
            {sourcesExpanded && (
              <div id={`assistant-sources-${msg.id}`} className="mt-1 space-y-1 pb-1" aria-label="Sources checked">
                {msg.evidence
                  ?.slice(0, showAllSources ? msg.evidence.length : MAX_VISIBLE_SOURCES)
                  .map((evidence) => {
                    const sourceLabel = evidence.sourceType === 'email'
                      ? 'Email'
                      : evidence.sourceType === 'event'
                        ? 'Calendar'
                        : evidence.sourceType === 'reminder'
                          ? 'Reminder'
                          : evidence.sourceType === 'activity'
                            ? 'Activity'
                            : evidence.sourceType === 'prep'
                              ? 'Prep'
                              : 'Family data'
                    const sourceIcon = evidence.sourceType === 'email'
                      ? <Mail size={14} />
                      : evidence.sourceType === 'event'
                        ? <CalendarDays size={14} />
                        : evidence.sourceType === 'reminder'
                          ? <Bell size={14} />
                          : evidence.sourceType === 'activity' || evidence.sourceType === 'prep'
                            ? <Activity size={14} />
                            : evidence.sourceType === 'place'
                              ? <MapPin size={14} />
                              : <UserPlus size={14} />
                    return (
                      <Button
                        key={evidence.evidenceId}
                        variant="subtle"
                        size="sm"
                        fullWidth
                        align="start"
                        leadingIcon={sourceIcon}
                        aria-label={`Open ${sourceLabel} source: ${evidence.title}`}
                        onClick={() => {
                          if ((evidence.sourceType === 'event' || evidence.sourceType === 'reminder') && evidence.sourceId) {
                            onOpenEventDetails?.(evidence.sourceId)
                            return
                          }
                          setSelectedEvidence((current) => current?.evidenceId === evidence.evidenceId ? null : evidence)
                        }}
                        className="text-casa-navy"
                      >
                        <span className="min-w-0">
                          <span className="block text-caption text-casa-muted">{sourceLabel}</span>
                          <span className="block truncate text-body-sm font-semibold">{evidence.title}</span>
                        </span>
                      </Button>
                    )
                  })}
                {!showAllSources && msg.evidence && msg.evidence.length > MAX_VISIBLE_SOURCES && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAllSources(true)}
                    className="text-casa-gold"
                  >
                    {`Show ${msg.evidence.length - MAX_VISIBLE_SOURCES} more`}
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
        {sourcesExpanded && selectedEvidence && (
          <Card tone="subtle" padding="sm" className="mt-3">
            <Heading role="heading">Evidence details</Heading>
            <Text role="body-sm" className="mt-1 font-semibold">{selectedEvidence.title}</Text>
            <Text role="body-sm" muted className="mt-2 whitespace-pre-wrap">{selectedEvidence.excerpt}</Text>
            {(selectedEvidence.effectiveAt || selectedEvidence.occurredAt) && (
              <Text role="caption" muted className="mt-2">
                {format(new Date(selectedEvidence.effectiveAt ?? selectedEvidence.occurredAt!), 'MMM d, yyyy')}
              </Text>
            )}
          </Card>
        )}
        {msg.streaming && (
          <span className="inline-flex items-center gap-1 align-middle" aria-hidden="true">
            {!msg.content && <span className="text-caption text-casa-muted">Thinking…</span>}
            <span className="inline-block w-1.5 h-3.5 bg-casa-gold/80 rounded-sm animate-pulse ml-0.5" />
          </span>
        )}
        {showQuickSaveRecipe && (
          <div className="mt-2">
            <Button variant="ghost"
              type="button"
              disabled={quickSaving}
              onClick={() => {
                if (!onQuickSaveRecipe) return
                setQuickSaving(true)
                void onQuickSaveRecipe(msg.content).finally(() => setQuickSaving(false))
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-gold/40 bg-casa-gold/10 text-caption font-semibold text-casa-navy hover:bg-casa-gold/15 disabled:opacity-60"
            >
              {quickSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              Save to Recipe Library (2 servings)
            </Button>
          </div>
        )}

        {/* Tool action confirmation card */}
        {ta && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {ta.status === 'done' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                  <Check size={13} />
                  {ta.tool === 'create_event' ? 'Created & added to calendar ✓'
                    : ta.tool === 'create_recipe' ? 'Saved to recipe library ✓'
                    : ta.tool === 'update_event' ? 'Updated ✓'
                    : ta.tool === 'bulk_update_events' ? 'Bulk updates applied ✓'
                    : ta.tool === 'delete_event' ? 'Deleted ✓'
                    : ta.tool === 'delete_events_by_title' ? 'Deleted matching events ✓'
                    : ta.tool === 'add_grocery_items' ? 'Added to grocery list ✓'
                    : ta.tool === 'check_grocery_item' ? 'Grocery item updated ✓'
                    : ta.tool === 'remove_grocery_item' ? 'Removed from grocery list ✓'
                    : ta.tool === 'update_grocery_item_quantity' ? 'Grocery quantity updated ✓'
                    : ta.tool === 'associate_family_contact' ? 'Saved to Household Directory ✓'
                    : ta.tool === 'associate_contact_place' ? 'Location saved ✓'
                    : ta.tool === 'confirm_directory_entity' ? 'Added to Household Directory ✓'
                    : 'Done ✓'}
                </div>
                {ta.tool === 'create_event' && ta.resultEventId && (
                  <div className="space-y-1">
                    <p className="text-caption text-casa-muted">Visible on your calendar now</p>
                    <p className="text-caption text-casa-muted">Finalizing address, contact, and driving-plan details in the background — check back shortly</p>
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => onOpenEventDetails?.(ta.resultEventId!)}
                      className="min-h-11 px-0 text-caption font-semibold text-casa-gold underline underline-offset-2 hover:text-casa-navy"
                    >
                      Open appointment details
                    </Button>
                  </div>
                )}
                {ta.tool === 'create_recipe' && (
                  <p className="text-caption text-casa-muted">Visible in Cook → Recipe library now</p>
                )}
                {['add_grocery_items', 'check_grocery_item', 'remove_grocery_item', 'update_grocery_item_quantity', 'clear_checked_grocery_items'].includes(ta.tool) && (
                  <p className="text-caption text-casa-muted">Saved in Casa; iOS Reminders syncs asynchronously</p>
                )}
                {ta.syncWarning && (
                  <p className="text-caption text-amber-600">{ta.syncWarning}</p>
                )}
                {ta.tool === 'update_event' && (
                  <SyncStatusPill status={ta.syncStatus ?? (ta.syncWarning ? 'queued' : 'synced')} />
                )}
                {ta.tool === 'update_event' && ta.actionId && ta.undoStatus !== 'done' && (
                  <div className="pt-1 space-y-1">
                    <Button variant="ghost"
                      type="button"
                      onClick={() => onUndoToolAction(msg.id, ta.actionId!)}
                      disabled={ta.undoStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-casa-navy text-caption font-semibold hover:bg-casa-bg transition-all disabled:opacity-60"
                    >
                      {ta.undoStatus === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Undo this edit
                    </Button>
                    {ta.undoStatus === 'error' && ta.undoErrorMsg && (
                      <p className="text-caption text-red-500">{ta.undoErrorMsg}</p>
                    )}
                  </div>
                )}
                {ta.undoStatus === 'done' && (
                  <p className="text-caption text-casa-muted">Undo applied.</p>
                )}
              </div>
            ) : ta.status === 'cancelled' ? (
              <div className="flex items-center gap-1.5 text-casa-muted text-caption">
                <XCircle size={13} /> Cancelled
              </div>
            ) : ta.status === 'error' ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-red-600 text-caption font-semibold">
                  <XCircle size={13} /> Failed
                </div>
                {ta.errorMsg && <p className="text-caption text-red-500">{ta.errorMsg}</p>}
                <div className="flex gap-2 flex-wrap">
                  <Button variant="ghost"
                    type="button"
                    onClick={doConfirm}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button bg-red-600 text-white text-caption font-semibold hover:brightness-110 transition-all"
                  >
                    <Loader2 size={12} /> {isStaleError ? 'Retry with latest' : 'Retry'}
                  </Button>
                  {isStaleError && (
                    <Button variant="ghost"
                      type="button"
                      onClick={onRefreshToolAction}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-casa-navy text-caption font-semibold hover:bg-casa-bg transition-all"
                    >
                      Refresh event
                    </Button>
                  )}
                </div>
              </div>
            ) : isDirectorySuggestion ? (
              <DirectorySuggestionCard
                tool={ta.tool}
                args={ta.args}
                loading={ta.status === 'loading'}
                onAccept={doConfirmCandidate}
                onCancel={doCancel}
              />
            ) : (
              <>
                <ToolActionPreview tool={ta.tool} args={ta.args} events={events} />
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button variant="ghost"
                    type="button"
                    disabled={ta.status === 'loading'}
                    onClick={doConfirm}
                    className={cn(
                      'min-h-control flex items-center gap-2 px-4 rounded-button text-body-sm font-semibold transition-colors disabled:opacity-50',
                      isDestructiveAction
                        ? 'bg-red-600 text-white hover:brightness-110'
                        : 'bg-casa-gold text-white hover:brightness-110',
                    )}
                  >
                    {ta.status === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                    {ta.status === 'loading'
                      ? 'Working…'
                      : isDestructiveAction
                        ? ta.tool === 'delete_event'
                          ? 'Delete event'
                          : ta.tool === 'delete_events_by_title'
                            ? 'Delete matching events'
                          : 'Clear checked items'
                        : ta.tool === 'update_event'
                          ? 'Apply change'
                          : ta.tool === 'create_event'
                            ? (ta.args as { event_type?: string })?.event_type === 'reminder'
                              ? 'Create reminder'
                              : 'Create event'
                            : confirmActionLabel(ta.tool)}
                  </Button>
                  {!isDestructiveAction && onEditMessage && editSeed?.trim() && (
                    <Button
                      variant="secondary"
                      type="button"
                      disabled={ta.status === 'loading'}
                      onClick={() => {
                        void doCancel()
                        onEditMessage(editSeed ?? '')
                      }}
                      className="min-h-control flex items-center gap-2 px-4 text-body-sm font-semibold"
                    >
                      <Pencil size={16} /> Change
                    </Button>
                  )}
                  <Button variant="ghost"
                    type="button"
                    onClick={doCancel}
                    className="min-h-control flex items-center gap-2 px-4 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-divider transition-colors"
                  >
                    <XCircle size={12} /> Cancel
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function looksLikeRecipeSuggestion(text: string): boolean {
  const normalized = text.toLowerCase()
  const hasIngredients = /\bingredients?\b/.test(normalized)
  const hasSteps = /\b(steps?|instructions?|directions?|method)\b/.test(normalized)
  const hasListLikeContent = /(^|\n)\s*(?:[-*]\s+|\d+\.\s+)/m.test(text)
  return hasIngredients && hasSteps && hasListLikeContent
}

function recurrenceScopeLabel(scope: unknown) {
  if (scope === 'this') return 'Only this event'
  if (scope === 'future') return 'This and following events'
  if (scope === 'all') return 'Entire series'
  return null
}

function confirmActionLabel(tool: string) {
  if (tool === 'create_recipe') return 'Save recipe'
  if (tool === 'add_grocery_items') return 'Add items'
  if (tool === 'check_grocery_item') return 'Update item'
  if (tool === 'remove_grocery_item') return 'Remove item'
  if (tool === 'update_grocery_item_quantity') return 'Update quantity'
  if (tool === 'bulk_update_events') return 'Apply updates'
  return 'Confirm action'
}

function ConfirmationHeading({ kind, icon, children }: { kind: 'calendar' | 'reminder' | 'grocery' | 'recipe' | 'warning' | 'directory'; icon?: 'contact' | 'place'; children: React.ReactNode }) {
  const Icon = kind === 'calendar'
    ? CalendarDays
    : kind === 'reminder'
      ? Bell
      : kind === 'grocery'
        ? ShoppingCart
        : kind === 'recipe'
          ? ChefHat
          : kind === 'directory'
            ? (icon === 'place' ? MapPin : UserPlus)
            : AlertTriangle
  const label = kind === 'calendar'
    ? 'Calendar'
    : kind === 'reminder'
      ? 'Reminder'
      : kind === 'grocery'
        ? 'Grocery list'
        : kind === 'recipe'
          ? 'Recipe library'
          : kind === 'directory'
            ? 'Household Directory'
            : 'Review carefully'
  return (
    <div className="space-y-1">
      <div className={cn(
        'flex items-center gap-2 text-caption font-semibold uppercase tracking-wide',
        kind === 'warning' ? 'text-casa-error' : 'text-casa-navy',
      )}>
        <Icon size={15} aria-hidden="true" />
        {label}
      </div>
      <h3 className="text-body font-semibold leading-snug text-casa-navy">{children}</h3>
    </div>
  )
}

type DirectoryCandidate = {
  key: string
  label: string
  sublabel?: string
  evidenceLabel?: string
  confirmArgs: Record<string, unknown>
}

function buildDirectoryCandidates(tool: string, args: Record<string, unknown>): {
  heading: string
  icon: 'contact' | 'place'
  candidates: DirectoryCandidate[]
} {
  const evidenceLabel = (count: unknown) => {
    const n = typeof count === 'number' ? count : Number(count) || 0
    return n > 0 ? `${n} calendar ${n === 1 ? 'entry' : 'entries'}` : undefined
  }

  if (tool === 'associate_family_contact') {
    const familyMemberName = String(args.family_member_name ?? 'this family member')
    const relationship = String(args.relationship ?? 'contact')
    const sharedWith = Array.isArray(args.shared_with) ? (args.shared_with as string[]) : []
    const alternatives = Array.isArray(args.alternatives) ? args.alternatives as Array<{
      contact_id?: string
      contact_name?: string
      relationship?: string
      evidence_count?: number
    }> : []
    const candidates: DirectoryCandidate[] = [{
      key: 'primary',
      label: String(args.contact_name ?? 'this contact'),
      sublabel: [args.place_name, sharedWith.length ? `Also confirmed for ${sharedWith.join(', ')}` : null]
        .filter(Boolean)
        .join(' · ') || undefined,
      evidenceLabel: evidenceLabel(args.evidence_count),
      confirmArgs: args,
    }]
    for (const alt of alternatives) {
      if (!alt.contact_id) continue
      candidates.push({
        key: alt.contact_id,
        label: alt.contact_name ?? 'Another contact',
        evidenceLabel: evidenceLabel(alt.evidence_count),
        confirmArgs: {
          ...args,
          contact_id: alt.contact_id,
          contact_name: alt.contact_name,
          relationship: alt.relationship ?? args.relationship,
          evidence_count: alt.evidence_count,
        },
      })
    }
    return { heading: `Save ${familyMemberName}'s ${relationship}?`, icon: 'contact', candidates }
  }

  if (tool === 'associate_contact_place') {
    const contactName = String(args.contact_name ?? 'this contact')
    const alternatives = Array.isArray(args.alternatives) ? args.alternatives as Array<{
      place_id?: string
      place_name?: string
      place_address?: string
      evidence_count?: number
    }> : []
    const candidates: DirectoryCandidate[] = [{
      key: 'primary',
      label: String(args.place_name ?? 'this location'),
      sublabel: args.place_address ? String(args.place_address) : undefined,
      evidenceLabel: evidenceLabel(args.evidence_count),
      confirmArgs: args,
    }]
    for (const alt of alternatives) {
      if (!alt.place_name) continue
      candidates.push({
        key: alt.place_id ?? alt.place_name,
        label: alt.place_name,
        sublabel: alt.place_address,
        evidenceLabel: evidenceLabel(alt.evidence_count),
        confirmArgs: {
          ...args,
          place_id: alt.place_id,
          place_name: alt.place_name,
          place_address: alt.place_address,
          evidence_count: alt.evidence_count,
        },
      })
    }
    return { heading: `Where does ${contactName} go?`, icon: 'place', candidates }
  }

  // confirm_directory_entity
  const entityType = args.entity_type === 'place' ? 'place' : 'contact'
  return {
    heading: `Add this ${entityType} to the Household Directory?`,
    icon: entityType === 'place' ? 'place' : 'contact',
    candidates: [{
      key: 'primary',
      label: String(args.entity_name ?? 'this entry'),
      sublabel: args.entity_detail ? String(args.entity_detail) : undefined,
      evidenceLabel: evidenceLabel(args.evidence_count),
      confirmArgs: args,
    }],
  }
}

function DirectorySuggestionCard({ tool, args, loading, onAccept, onCancel }: {
  tool: string
  args: Record<string, unknown>
  loading: boolean
  onAccept: (candidateArgs: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const { heading, icon, candidates } = buildDirectoryCandidates(tool, args)
  return (
    <div className="space-y-3">
      <ConfirmationHeading kind="directory" icon={icon}>{heading}</ConfirmationHeading>
      <div className="space-y-2">
        {candidates.map((candidate) => (
          <Button
            key={candidate.key}
            variant="ghost"
            type="button"
            disabled={loading}
            onClick={() => onAccept(candidate.confirmArgs)}
            className="min-h-control w-full flex items-center justify-between gap-3 px-4 py-3 rounded-button bg-casa-gold/10 border border-casa-gold/40 text-left hover:bg-casa-gold/20 disabled:opacity-50 transition-colors"
          >
            <span className="min-w-0">
              <span className="block text-body-sm font-semibold text-casa-navy truncate">{candidate.label}</span>
              {(candidate.sublabel || candidate.evidenceLabel) && (
                <span className="block text-caption text-casa-muted truncate">
                  {[candidate.sublabel, candidate.evidenceLabel].filter(Boolean).join(' · ')}
                </span>
              )}
            </span>
            {loading ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Check size={16} className="shrink-0 text-casa-gold" />}
          </Button>
        ))}
      </div>
      <Button
        variant="ghost"
        type="button"
        disabled={loading}
        onClick={onCancel}
        className="min-h-control flex items-center gap-2 px-4 rounded-button border border-casa-border text-body-sm text-casa-navy hover:bg-casa-divider transition-colors disabled:opacity-50"
      >
        <XCircle size={12} /> None of these
      </Button>
    </div>
  )
}

function ToolActionPreview({ tool, args, events }: { tool: string; args: Record<string, unknown>; events: EventWithDetails[] }) {
  const [expanded, setExpanded] = useState(false)

  if (tool === 'create_event') {
    const preview = buildCreatePreviewCopy(args, { now: new Date() })
    const isReminder = args.event_type === 'reminder'
    return (
      <div className="space-y-3">
        <ConfirmationHeading kind={isReminder ? 'reminder' : 'calendar'}>{preview.heading}</ConfirmationHeading>
        {preview.when && <p className="text-body-sm font-semibold text-casa-navy">{preview.when}</p>}
        {preview.details.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {preview.details.map((detail) => (
              <span key={detail} className="inline-flex items-center rounded-full bg-casa-surface border border-casa-border px-2.5 py-1 text-caption font-medium text-casa-navy">
                {detail}
              </span>
            ))}
          </div>
        )}
        <p className="text-caption text-casa-navy">{preview.impact}</p>
      </div>
    )
  }
  if (tool === 'update_event') {
    const matchedEvent = events.find((event) => event.id === String(args.id ?? ''))
    const preview = buildUpdatePreviewCopy(args, matchedEvent)
    const changes = summarizeUpdateArgs(args)
    const scopeLabel = recurrenceScopeLabel(args.recurrence_scope)
    const MAX_VISIBLE = 6
    const visibleChanges = expanded ? changes : changes.slice(0, MAX_VISIBLE)
    return (
      <div className="space-y-2">
        <ConfirmationHeading kind="calendar">{preview.heading}?</ConfirmationHeading>
        {scopeLabel && (
          <p className="text-caption font-semibold text-casa-gold">{scopeLabel}</p>
        )}
        {preview.currentSpan && preview.nextSpan && (
          <div className="rounded-lg border border-casa-border bg-casa-surface px-3 py-2.5 text-caption text-casa-navy space-y-1">
            <p><span className="font-semibold text-casa-navy">Current:</span> {preview.currentSpan}</p>
            <p><span className="font-semibold text-casa-navy">New:</span> {preview.nextSpan}</p>
          </div>
        )}
        {!preview.currentSpan && preview.nextSpan && (
          <p className="text-caption text-casa-muted">{preview.nextSpan}</p>
        )}
        <p className="text-caption text-casa-navy">
          {changes.length > 0
            ? `Updating ${changes.length} field${changes.length === 1 ? '' : 's'} for ${scopeLabel?.toLowerCase() ?? 'one event'}.`
            : `Updating ${scopeLabel?.toLowerCase() ?? 'one event'}.`}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {visibleChanges.map((change) => (
            <span
              key={change}
              className="inline-flex items-center rounded-full bg-casa-surface border border-casa-border px-2.5 py-1 text-caption font-medium text-casa-navy"
            >
              {change}
            </span>
          ))}
        </div>
        {changes.length > MAX_VISIBLE && (
          <Button variant="ghost"
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-caption font-semibold text-casa-gold hover:underline"
          >
            {expanded ? 'Show less' : `Show ${changes.length - MAX_VISIBLE} more`}
          </Button>
        )}
      </div>
    )
  }
  if (tool === 'bulk_update_events') {
    const count = Number.isFinite(Number(args.count))
      ? Number(args.count)
      : (Array.isArray(args.ids) ? args.ids.length : 0)
    const titleQuery = String(args.title_query ?? '').trim()
    const changes = summarizeUpdateArgs(args).filter((change) => change !== 'id')
    return (
      <div className="space-y-2">
        <ConfirmationHeading kind="calendar">
          Update {count} matching event{count === 1 ? '' : 's'}{titleQuery ? ` for "${titleQuery}"` : ''}
        </ConfirmationHeading>
        {changes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {changes.slice(0, 8).map((change) => (
              <span
                key={change}
                className="inline-flex items-center rounded-full bg-casa-surface border border-casa-border px-2.5 py-1 text-caption font-medium text-casa-navy"
              >
                {change}
              </span>
            ))}
          </div>
        )}
      </div>
    )
  }
  if (tool === 'delete_event') {
    const matchedEvent = events.find((event) => event.id === String(args.id ?? ''))
    const preview = buildDeletePreviewCopy(matchedEvent, args)
    const scopeLabel = recurrenceScopeLabel(args.recurrence_scope)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
        <ConfirmationHeading kind="warning">{preview.heading}?</ConfirmationHeading>
        {scopeLabel && <p className="text-caption font-semibold text-red-700">{scopeLabel}</p>}
        {preview.when && <p className="text-body-sm font-semibold text-red-800">{preview.when}</p>}
        <p className="text-caption text-red-800">{preview.note}</p>
      </div>
    )
  }
  if (tool === 'delete_events_by_title') {
    const preview = buildDeleteManyPreviewCopy(events, args)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 space-y-2">
        <ConfirmationHeading kind="warning">{preview.heading}</ConfirmationHeading>
        <p className="text-caption text-red-800">{preview.note}</p>
        {preview.matches.length > 0 && (
          <div className="space-y-1 rounded-lg border border-red-200 bg-white/70 px-2.5 py-2 text-caption text-red-700">
            {preview.matches.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {preview.count > preview.matches.length && (
              <p>+ {preview.count - preview.matches.length} more</p>
            )}
          </div>
        )}
      </div>
    )
  }
  if (tool === 'add_grocery_items') {
    const items = Array.isArray(args.items) ? args.items as { name: string; quantity?: string }[] : []
    return (
      <div className="space-y-3">
        <ConfirmationHeading kind="grocery">
          Add {items.length} item{items.length === 1 ? '' : 's'}?
        </ConfirmationHeading>
        <div className="space-y-1 text-body-sm text-casa-navy">
          {items.map((item, index) => (
            <p key={`${item.name}-${index}`} className="font-medium">
              {item.name}{item.quantity ? ` · ${item.quantity}` : ''}
            </p>
          ))}
        </div>
        <p className="text-caption text-casa-navy">Saves to Casa now; iOS Reminders sync follows asynchronously.</p>
      </div>
    )
  }
  if (tool === 'create_recipe') {
    const ingredients = Array.isArray(args.ingredients) ? args.ingredients : []
    const steps = Array.isArray(args.steps) ? args.steps : []
    return (
      <div className="space-y-3">
        <ConfirmationHeading kind="recipe">Save "{String(args.name ?? 'Untitled recipe')}"?</ConfirmationHeading>
        <div className="flex flex-wrap gap-2 text-caption font-medium text-casa-navy">
          <span>{ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'}</span>
          <span aria-hidden="true">·</span>
          <span>{steps.length} step{steps.length === 1 ? '' : 's'}</span>
        </div>
        {typeof args.cook_time === 'string' && args.cook_time.trim().length > 0 && (
          <p className="flex items-center gap-2 text-caption text-casa-navy"><Clock3 size={15} aria-hidden="true" /> {args.cook_time}</p>
        )}
        {typeof args.servings === 'string' && args.servings.trim().length > 0 && (
          <p className="flex items-center gap-2 text-caption text-casa-navy"><Utensils size={15} aria-hidden="true" /> {args.servings}</p>
        )}
      </div>
    )
  }
  if (tool === 'check_grocery_item') {
    return (
      <div className="space-y-2">
        <ConfirmationHeading kind="grocery">Mark this item {args.checked ? 'complete' : 'not complete'}?</ConfirmationHeading>
        <p className="text-caption text-casa-navy">The status change syncs to iOS Reminders asynchronously.</p>
      </div>
    )
  }
  if (tool === 'remove_grocery_item') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
        <ConfirmationHeading kind="warning">Remove this grocery item?</ConfirmationHeading>
        <p className="text-caption text-amber-900">Removes it from Casa now; iOS Reminders sync follows asynchronously.</p>
      </div>
    )
  }
  if (tool === 'update_grocery_item_quantity') {
    const amount = [args.quantity, args.unit].filter((value) =>
      typeof value === 'string' && value.trim().length > 0
    ).join(' ')
    return (
      <div className="space-y-2">
        <ConfirmationHeading kind="grocery">Set the quantity to {amount || 'the new amount'}?</ConfirmationHeading>
        <p className="text-caption text-casa-navy">Updates the item now; iOS Reminders sync follows asynchronously.</p>
      </div>
    )
  }
  if (tool === 'clear_checked_grocery_items') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 space-y-2">
        <ConfirmationHeading kind="warning">Clear all checked grocery items?</ConfirmationHeading>
        <p className="text-caption text-amber-900">Removes every completed item from Casa now; iOS Reminders sync follows asynchronously.</p>
      </div>
    )
  }
  return <p className="text-caption text-casa-muted">{tool}</p>
}

function SyncStatusPill({ status }: { status: 'synced' | 'queued' | 'failed' }) {
  const tone = status === 'synced'
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : status === 'queued'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-red-50 text-red-700 border-red-200'
  const label = status === 'synced'
    ? 'Google synced'
    : status === 'queued'
      ? 'Retry queued'
      : 'Sync failed'

  return (
    <span className={cn('inline-flex mt-1 items-center rounded-full border px-2 py-0.5 text-caption font-semibold', tone)}>
      {label}
    </span>
  )
}

function summarizeUpdateArgs(args: Record<string, unknown>): string[] {
  const show = (value: unknown) => value == null || String(value).trim() === '' ? '(clear)' : String(value)
  const changes: string[] = []
  if (args.title !== undefined) changes.push(`Title: ${show(args.title)}`)
  if (args.start !== undefined) changes.push(`Start: ${format(new Date(args.start as string), 'MMM d h:mm a')}`)
  if (args.end !== undefined) changes.push(`End: ${format(new Date(args.end as string), 'h:mm a')}`)
  if (args.location !== undefined) changes.push(`Location: ${show(args.location)}`)
  if (args.address !== undefined) changes.push(`Address: ${show(args.address)}`)
  if (args.notes !== undefined) changes.push(`Notes: ${show(args.notes)}`)
  if (args.description !== undefined) changes.push(`Description: ${show(args.description)}`)
  if (args.category !== undefined) changes.push(`Category: ${show(args.category)}`)
  if (args.what_to_bring !== undefined) changes.push(`What to bring: ${Array.isArray(args.what_to_bring) ? `${(args.what_to_bring as unknown[]).length} item(s)` : 'updated'}`)
  if (args.outfit_suggestion !== undefined) changes.push(`Outfit: ${show(args.outfit_suggestion)}`)
  if (args.parking_notes !== undefined) changes.push(`Parking: ${show(args.parking_notes)}`)
  if (args.contact_name !== undefined) changes.push(`Contact: ${show(args.contact_name)}`)
  if (args.contact_phone !== undefined) changes.push(`Phone: ${show(args.contact_phone)}`)
  if (args.cost_estimate !== undefined) changes.push(`Cost: ${show(args.cost_estimate)}`)
  if (args.dietary_notes !== undefined) changes.push(`Dietary: ${show(args.dietary_notes)}`)
  if (args.meal_impact !== undefined) changes.push(`Meal impact: ${show(args.meal_impact)}`)
  if (args.checklist_items !== undefined) changes.push(`Checklist: ${Array.isArray(args.checklist_items) ? `${(args.checklist_items as unknown[]).length} item(s)` : 'updated'}`)
  if (args.action_items !== undefined) changes.push(`Actions: ${Array.isArray(args.action_items) ? `${(args.action_items as unknown[]).length} item(s)` : 'updated'}`)
  if ((args.members_add as string[])?.length) changes.push(`Add: ${(args.members_add as string[]).join(', ')}`)
  if ((args.members_remove as string[])?.length) changes.push(`Remove: ${(args.members_remove as string[]).join(', ')}`)
  return changes
}

/* ── Contextual suggestions ─────────────────────────────────── */

type ProactiveNudge = { text: string; prompt: string }

/**
 * Derive at most ONE proactive, context-aware nudge from the current events.
 * Priority: schedule conflict → upcoming event missing location → busy day →
 * imminent next event. Returns null when nothing is worth surfacing.
 * Intentionally quiet: one line, dismissible, never chatty.
 */
function deriveProactiveNudge(events: EventWithDetails[], now: Date): ProactiveNudge | null {
  if (!events || events.length === 0) return null
  const HOUR = 3600_000
  const nowMs = now.getTime()
  const dayLabel = (d: Date) => {
    const diff = Math.floor((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / (24 * HOUR))
    if (diff === 0) return 'today'
    if (diff === 1) return 'tomorrow'
    return format(d, 'EEEE')
  }

  const timed = events
    .filter(e => !e.all_day && e.start_time)
    .map(e => ({ e, start: new Date(e.start_time).getTime(), end: new Date(e.end_time ?? e.start_time).getTime() }))
    .filter(x => Number.isFinite(x.start))
    .sort((a, b) => a.start - b.start)

  // 1) Conflict: two timed events overlapping >15min within the next 3 days
  const horizon = nowMs + 3 * 24 * HOUR
  for (let i = 0; i < timed.length; i++) {
    const a = timed[i]
    if (a.start > horizon || a.end <= nowMs) continue
    for (let j = i + 1; j < timed.length; j++) {
      const b = timed[j]
      if (b.start >= a.end) break
      const overlap = Math.min(a.end, b.end) - Math.max(a.start, b.start)
      if (overlap > 15 * 60_000) {
        return {
          text: `Heads up — "${a.e.title}" and "${b.e.title}" overlap ${dayLabel(new Date(a.start))}.`,
          prompt: 'Do I have any scheduling conflicts coming up?',
        }
      }
    }
  }

  // 2) Upcoming event within 24h that's missing a location
  const upcoming = timed.find(x => x.start > nowMs && x.start <= nowMs + 24 * HOUR && !x.e.location_name && !x.e.address)
  if (upcoming) {
    return {
      text: `"${upcoming.e.title}" ${dayLabel(new Date(upcoming.start))} doesn't have a location yet.`,
      prompt: `Add a location to "${upcoming.e.title}"`,
    }
  }

  // 3) Busy day: any of the next 3 days with 4+ events
  const byDay = new Map<string, number>()
  for (const x of timed) {
    if (x.start < nowMs || x.start > horizon) continue
    const key = format(new Date(x.start), 'yyyy-MM-dd')
    byDay.set(key, (byDay.get(key) ?? 0) + 1)
  }
  for (const [key, count] of byDay) {
    if (count >= 4) {
      const d = new Date(key + 'T12:00:00')
      return {
        text: `Busy ${dayLabel(d)} — ${count} events lined up.`,
        prompt: `Give me a rundown of ${dayLabel(d)}`,
      }
    }
  }

  // 4) Next event starting within 3 hours
  const soon = timed.find(x => x.start > nowMs && x.start <= nowMs + 3 * HOUR)
  if (soon) {
    const mins = Math.round((soon.start - nowMs) / 60_000)
    const rel = mins < 60 ? `in ${mins} min` : `at ${format(new Date(soon.start), 'h:mm a')}`
    return {
      text: `"${soon.e.title}" starts ${rel}.`,
      prompt: `Prep me for "${soon.e.title}"`,
    }
  }

  return null
}

const SUGGESTIONS: Record<string, string[]> = {
  home: ["What's next up today?", "Add an event tonight", "Any conflicts this week?"],
  calendar: ["What does tomorrow look like?", "Add a new appointment", "Who's busiest this week?"],
  briefing: ["Summarize today for me", "Add an event", "Any prep needed today?"],
  grocery: ["Add milk and eggs", "What's on the list?", "Clear checked items"],
  cook: ["Plan 4 quick weeknight dinners", "Optimize my meals for budget", "Build grocery list from the plan"],
  app: ["What's next up today?", "Add an event tonight", "What's on the grocery list?"],
}

/**
 * Build suggestion chips that reflect the actual current schedule.
 * Prepends up to one state-derived chip (next event today / tomorrow's load)
 * to the static per-page list, then caps to keep the empty state tidy.
 */
function buildDynamicSuggestions(page: string, events: EventWithDetails[], now: Date): string[] {
  const base = SUGGESTIONS[page] ?? SUGGESTIONS.app
  const HOUR = 3600_000
  const nowMs = now.getTime()
  const timed = (events ?? [])
    .filter(e => !e.all_day && e.start_time)
    .map(e => ({ e, start: new Date(e.start_time).getTime() }))
    .filter(x => Number.isFinite(x.start) && x.start > nowMs)
    .sort((a, b) => a.start - b.start)

  if (timed.length === 0) return base

  const next = timed[0]
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()
  const dynamic: string[] = []
  if (next.start <= endOfToday) {
    dynamic.push(`Prep me for "${next.e.title}"`)
  } else if (next.start <= nowMs + 36 * HOUR) {
    dynamic.push(`What's on for "${format(new Date(next.start), 'EEEE')}"?`)
  }

  const merged = [...dynamic, ...base.filter(s => !dynamic.includes(s))]
  return merged.slice(0, 4)
}
