import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, Keyboard, RotateCcw, Plus, Square, Calendar, CalendarDays, Car, ShoppingCart, ChefHat, Pencil, AlertTriangle, Clock3, Utensils, Bell, UserPlus, MapPin, Mail, Activity, ChevronRight, Navigation, Rotate3d, BookOpen, Lock, Building2, Users, FileText } from 'lucide-react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../utils/cn'
import { useAIAssistant, type AIMessage, type GroceryAssistantContext, type ActionAiContext } from '../../hooks/useAIAssistant'
import type { PrivateConversation } from '../../hooks/useAIConversationHistory'
import {
  useSpeechInput,
  IS_SAFE_MODE,
  type VoiceTranscriptRevision,
} from '../../hooks/useSpeechInput'
import { useLedStrip } from '../../hooks/useLedStrip'
import { useProfileSession } from '../../contexts/ProfileSessionContext'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember, DinnerPlan, DinnerMode } from '../../types'
import { useAppStore } from '../../stores/appStore'
import { getDisplayMemberColor } from '../../design-system/memberColors'
import BounceScroll from '../shared/BounceScroll'
import MarkdownContent from '../shared/MarkdownContent'
import { Button, Card, Heading, IconButton, LiveTranscript, Modal, Text } from '../ui'
import { formatTextForMarkdown, stripEvidenceCitationMarkers } from '../../lib/assistantMarkdown.mjs'
import { createAssistantTraceContext, emitAssistantTrace, getAssistantDeviceId } from '../../lib/assistantTelemetry'
import { classifyPendingConfirmation } from '../../lib/assistantConfirmation.mjs'
import { conversationStateAfterCalendarAction } from '../../lib/assistantConversationState.mjs'
import { linkAssistantEventMentions, parseAssistantEventHref, parseAssistantHref } from '../../lib/assistantEntityLinks'
import { openEventDetails } from '../../utils/openEventDetails'
import { buildCreatePreviewCopy, buildDeleteManyPreviewCopy, buildDeletePreviewCopy, buildUpdatePreviewCopy } from '../../utils/aiConfirmPreview'
import { matchDinnerPlanIntent, getDinnerPlanSuggestions } from '../../utils/dinnerPlanManager'
import { saveTonightDinnerPlan } from '../../utils/dinnerPlanSync'
import { invalidateAllCalendarQueries } from '../../lib/eventMutations'

const LOW_CONFIDENCE_CONFIRM_PHRASES = /\b(yes|yeah|yep|ok|okay|use it|that one|correct|right|go ahead)\b/i
const LOW_CONFIDENCE_REJECT_PHRASES = /\b(no|nope|try again|wrong|not that|cancel)\b/i

const CONVERSATION_MODE_KEY = 'casa_ai_conversation_mode'
type PendingVoiceAction = {
  messageId: string
  state: 'pending' | 'executing'
  confirm: () => Promise<boolean>
  cancel: () => Promise<boolean>
}



import type { AIChatLaunchContext } from '../../stores/appStore'

interface Props {
  open: boolean
  onClose: () => void
  anchor?: { right: number; top: number }
  page: string
  launchContext?: AIChatLaunchContext
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  onSleepCommand?: () => void
  focusedEvent?: EventWithDetails
  focusedAction?: ActionAiContext
  onOpenEventDetails?: (event: EventWithDetails) => void
  onSwitchToEvent?: () => void
  embedded?: boolean
}

const SLEEP_PHRASES = /\b(sleep|goodnight|good night|art mode|screen saver|screensaver|night mode)\b/i

export default function AIChatDrawer({
  open,
  onClose,
  anchor: _anchor,
  page,
  launchContext,
  events,
  family,
  homeCity,
  onSleepCommand,
  focusedEvent,
  focusedAction,
  onOpenEventDetails,
  onSwitchToEvent,
  embedded = false,
}: Props) {
  const [input, setInput] = useState('')
  const [voiceTranscript, setVoiceTranscript] = useState<VoiceTranscriptRevision>({
    committed: '',
    interim: '',
    isFinal: false,
  })
  const interimRef = useRef('')
  const hadUserInteractionRef = useRef(false)
  const [attachedImages, setAttachedImages] = useState<Array<{ dataUrl: string; mimeType: string }>>([])
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historyUnlockError, setHistoryUnlockError] = useState<string | null>(null)
  const [historyConversations, setHistoryConversations] = useState<PrivateConversation[]>([])
  const [historyListLoading, setHistoryListLoading] = useState(false)
  const [conversationMode] = useState<boolean>(() => {
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
  const { profile, signOut } = useProfileSession()

  // ── Preload Real-Time Grocery List, Pantry Inventory, and Meal Plans for Copilot ──
  const { data: copilotGroceryItems = [] } = useQuery({
    queryKey: ['copilot-grocery-items'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('grocery_items')
        .select('id,name,category,checked,quantity,unit,notes')
        .order('created_at', { ascending: false })
      if (error) return []
      return (data ?? []) as Array<{ id: string; name: string; category: string; checked: boolean; quantity: string | null; unit: string | null; notes: string | null }>
    },
    staleTime: 20_000,
  })

  const { data: copilotPantrySettings } = useQuery({
    queryKey: ['copilot-pantry-settings'],
    queryFn: async () => {
      const { data } = await supabase
        .from('settings')
        .select('value')
        .eq('key', 'pantry_inventory')
        .maybeSingle()
      return data?.value ?? null
    },
    staleTime: 60_000,
  })

  const { data: copilotMealPlans = [] } = useQuery({
    queryKey: ['copilot-meal-plans'],
    queryFn: async () => {
      const { data } = await supabase
        .from('recipe_meal_plans')
        .select('id,recipe_id,slot,recipes(name,cook_time,servings,recipe_ingredients(raw_text))')
        .order('created_at', { ascending: false })
      return (data ?? []) as any[]
    },
    staleTime: 60_000,
  })

  const groceryContext = useMemo<GroceryAssistantContext>(() => {
    const toBuy = copilotGroceryItems.filter((i) => !i.checked)
    const inCart = copilotGroceryItems.filter((i) => i.checked)

    const pantryMap = (copilotPantrySettings && typeof copilotPantrySettings === 'object' ? copilotPantrySettings : {}) as Record<string, any>
    const pantryInventory = Object.entries(pantryMap).map(([key, val]) => ({
      name: val?.name ?? key,
      category: val?.category ?? 'pantry',
      currentStock: Number(val?.current_stock ?? val?.quantity ?? 0),
      unit: String(val?.unit ?? 'pkg'),
      lowStockThreshold: Number(val?.low_stock_threshold ?? 1),
    }))

    const plannedDinners = copilotMealPlans.map((plan: any) => ({
      slot: plan.slot ?? 'tonight',
      recipeName: plan.recipes?.name ?? 'Planned Recipe',
      cookTime: plan.recipes?.cook_time ?? null,
      servings: plan.recipes?.servings ?? null,
      ingredientCount: plan.recipes?.recipe_ingredients?.length ?? 0,
      ingredients: (plan.recipes?.recipe_ingredients ?? []).map((ing: any) => ing.raw_text).filter(Boolean),
    }))

    return {
      totalItems: copilotGroceryItems.length,
      toBuyCount: toBuy.length,
      inCartCount: inCart.length,
      items: copilotGroceryItems.map((item) => ({
        id: item.id,
        name: item.name,
        category: item.category,
        checked: item.checked,
        quantity: item.quantity,
        unit: item.unit,
        notes: item.notes,
      })),
      pantryInventory,
      plannedDinners,
      recentAisleCategories: Array.from(new Set(copilotGroceryItems.map((i) => i.category))),
    }
  }, [copilotGroceryItems, copilotPantrySettings, copilotMealPlans])

  const {
    messages,
    loading,
    send,
    reset,
    session,
    sessionLoading,
    startFresh,
    primeMessages,
    appendSyntheticMessage,
    updateMessageToolStatus,
    privateHistory,
    resumePrivateConversation,
  } = useAIAssistant({
    page,
    assistantMode: launchContext?.agent ?? 'general',
    events,
    family,
    homeCity,
    focusedEvent,
    focusedAction,
    groceryContext,
    onSessionEnd: onClose,
  })

  const led = useLedStrip()

  const proactiveNudge = useMemo(
    () => (open ? deriveProactiveNudge(events, new Date()) : null),
    [open, events],
  )

  const [windowWidth, setWindowWidth] = useState(() => typeof window !== 'undefined' ? window.innerWidth : 1280)
  const isMobile = windowWidth < 640

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Sidecar width scales as a responsive percentage of the screen (~33vw),
  // clamped between 380px (tablet/laptop) and 720px for high-res kiosk screens.
  const sidecarWidth = useMemo(() => {
    if (isMobile) return windowWidth
    return Math.min(720, Math.max(380, Math.round(windowWidth * 0.33)))
  }, [isMobile, windowWidth])

  useEffect(() => {
    if (open && !isMobile) {
      document.documentElement.style.setProperty('--ai-sidecar-width', `${sidecarWidth}px`)
    } else {
      document.documentElement.style.setProperty('--ai-sidecar-width', '0px')
    }
    return () => {
      document.documentElement.style.setProperty('--ai-sidecar-width', '0px')
    }
  }, [open, isMobile, sidecarWidth])

  useEffect(() => {
    // Only lock background scroll on small mobile screens where the drawer is a modal bottom sheet.
    // On tablet and desktop, the drawer is an in-flow sidecar companion panel, so the background remains fully interactive and scrollable.
    if (!open || !isMobile) return

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
  }, [open, isMobile])

  const dinnerPlan = useAppStore((s) => s.dinnerPlan)
  const dynamicSuggestions = useMemo(
    () => deriveDynamicFollowUpSuggestions(messages, page, events, new Date(), focusedEvent, launchContext?.source, dinnerPlan, focusedAction),
    [messages, page, events, focusedEvent, launchContext?.source, dinnerPlan, focusedAction],
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

  const navigate = useNavigate()

  const handleOpenEventDetails = useCallback((eventId: string) => {
    const event = eventById.get(eventId)
    if (embedded) {
      if (event && onOpenEventDetails) {
        onOpenEventDetails(event)
      } else {
        openEventDetails(eventId)
      }
    } else {
      onClose()
      if (event && onOpenEventDetails) {
        onOpenEventDetails(event)
      } else {
        openEventDetails(eventId)
      }
    }
  }, [embedded, eventById, onClose, onOpenEventDetails])

  const handleLinkClick = useCallback((href: string) => {
    const parsed = parseAssistantHref(href)
    if (parsed.type === 'event') {
      const event = eventById.get(parsed.idOrPath)
      if (embedded) {
        if (event && onOpenEventDetails) {
          onOpenEventDetails(event)
        } else {
          openEventDetails(parsed.idOrPath)
        }
      } else {
        onClose()
        if (event && onOpenEventDetails) {
          onOpenEventDetails(event)
        } else {
          openEventDetails(parsed.idOrPath)
        }
      }
    } else if (parsed.type === 'recipe') {
      if (!embedded) onClose()
      navigate(`/cook?search=${encodeURIComponent(parsed.idOrPath)}`)
    } else if (parsed.type === 'grocery') {
      if (!embedded) onClose()
      navigate('/grocery')
    } else if (parsed.type === 'navigate') {
      if (!embedded) onClose()
      navigate(`/${parsed.idOrPath}`)
    }
  }, [embedded, eventById, onClose, onOpenEventDetails, navigate])

  const markUserInteraction = useCallback(() => {
    hadUserInteractionRef.current = true
  }, [])

  const clearVoiceTranscript = useCallback(() => {
    setVoiceTranscript({ committed: '', interim: '', isFinal: false })
  }, [])

  const activePendingToolMessage = [...messages]
    .reverse()
    .find(message => message.toolAction?.status === 'pending')
  const hasPendingToolAction = Boolean(activePendingToolMessage)
  const activePendingToolMessageId = activePendingToolMessage?.id

  // Auto-execute grocery additions seamlessly with instant undo availability
  const autoGroceryExecutingRef = useRef<Set<string>>(new Set())
  const autoGroceryCreatedIdsRef = useRef<Map<string, string[]>>(new Map())
  useEffect(() => {
    const pendingGrocery = messages.find(
      (m) => m.role === 'assistant' && m.toolAction?.tool === 'add_grocery_items' && m.toolAction.status === 'pending'
    )
    if (pendingGrocery && pendingGrocery.toolAction && !autoGroceryExecutingRef.current.has(pendingGrocery.id)) {
      const messageId = pendingGrocery.id
      const toolAction = pendingGrocery.toolAction
      autoGroceryExecutingRef.current.add(messageId)
      void (async () => {
        updateMessageToolStatus(messageId, 'loading')
        try {
          const { data, error } = await supabase.functions.invoke('execute-ai-action', {
            body: {
              tool: toolAction.tool,
              args: toolAction.args,
              action_id: messageId,
              session_id: session?.id ?? null,
              correlation_id: buildCorrelationId(messageId),
              confirmed_by_user: true,
            },
          })
          if (error || data?.success === false) throw (error || new Error(data?.error ?? 'Failed to add grocery items'))

          const createdIds = Array.isArray(data?.items)
            ? data.items.map((i: any) => i.id).filter(Boolean)
            : []

          autoGroceryCreatedIdsRef.current.set(messageId, createdIds)

          updateMessageToolStatus(messageId, 'done', {
            actionId: messageId,
            undoStatus: 'idle',
          })
          qc.invalidateQueries({ queryKey: ['grocery'] })
        } catch (err) {
          updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
        }
      })()
    }
  }, [messages, session?.id, updateMessageToolStatus, qc])

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
    image?: { dataUrl: string; mimeType: string } | Array<{ dataUrl: string; mimeType: string }>,
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
    const isDinnerScope = !focusedEvent && !focusedAction && (page === 'cook' || launchContext?.source === 'tonights-kitchen' || /\b(dinner|kitchen|recipe|cook tonight|takeout|flanigan|pizza|leftovers)\b/i.test(trimmed))
    const dinnerIntent = isDinnerScope ? matchDinnerPlanIntent(trimmed, useAppStore.getState().dinnerPlan) : null
    if (dinnerIntent) {
      appendSyntheticMessage({
        id: crypto.randomUUID(),
        role: 'user',
        content: trimmed,
      })
      appendSyntheticMessage({
        id: crypto.randomUUID(),
        role: 'assistant',
        content: dinnerIntent.assistantReply,
        toolAction: dinnerIntent.toolAction,
      })
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

  const quickSaveAndSetTonightRecipe = useCallback(async (recipeMessage: string) => {
    if (loading) return
    markUserInteraction()
    const recipeExcerpt = recipeMessage.trim().slice(0, 3500)
    const prompt = [
      'Save this recipe to my Recipe Library AND schedule it as Tonight\'s Dinner.',
      'Use your previous recipe details as the source of truth.',
      'Include complete ingredients with quantities/units and full numbered cooking steps.',
      'Update Tonight\'s Kitchen plan on the dashboard with this recipe so we are ready to cook immediately.',
      recipeExcerpt ? `\nRecipe draft:\n${recipeExcerpt}` : '',
    ].join('\n')
    await sendTraced(prompt)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['cook-page-recipes'] }),
      qc.invalidateQueries({ queryKey: ['cook-page-meal-plans'] }),
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

  // Keep speechStopRef current so the onFinalTranscript callback can stop the mic
  // without creating a circular dependency on the speech object.
  useEffect(() => { speechStopRef.current = speech.stop }, [speech.stop])

  useEffect(() => {
    if (open) {
      hadUserInteractionRef.current = false
      setNudgeDismissed(false)
      if (IS_SAFE_MODE) return
      // Launch intent controls the initial mode: wake word is voice-first;
      // manual opens remain text-first even when conversation mode is enabled.
      if (launchContext?.source === 'wake_word' && !launchContext?.prompt) {
        speech.start()
      }
      // Focus textarea slightly after animation settles (UI only, doesn't affect mic)
      setTimeout(() => textareaRef.current?.focus(), 300)
    } else {
      speech.stop()
      led.off()
      reset()
      setInput('')
      interimRef.current = ''
      clearVoiceTranscript()
      pendingLowConfidenceRef.current = null
      latestVoiceConfidenceRef.current = null
      setAttachedImages([])
      setAttachmentMenuOpen(false)
      firedChefGreetRef.current = null
    }
  }, [open])

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

  // Start a clean, focused session when switching events (silent executive standby)
  const firedEventGreetRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !focusedEvent || loading) return
    if (firedEventGreetRef.current === focusedEvent.id) return
    if (sessionLoading) return
    firedEventGreetRef.current = focusedEvent.id

    // Start a clean, dedicated session for this event without synthetic message bloat
    startFresh()
  }, [open, focusedEvent?.id, sessionLoading, loading, startFresh])

  // Only prime an action greeting when launching AI from an action queue item
  const firedActionGreetRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !focusedAction || loading) return
    const key = `${focusedAction.actionId}:${launchContext?.launchId || 'action'}`
    if (firedActionGreetRef.current === key) return
    if (sessionLoading) return
    firedActionGreetRef.current = key

    // Start a clean, dedicated session for this action queue item
    startFresh()

    let content = `I'm reviewing the details for **${focusedAction.title}** 📋\n\n`
    if (focusedAction.sender) content += `✉️ **From:** ${focusedAction.sender}\n`
    if (focusedAction.amount) content += `💰 **Amount:** ${focusedAction.amount}\n`
    if (focusedAction.urgency) content += `⚠️ **Urgency:** ${focusedAction.urgency}\n`
    if (focusedAction.requiredAction) content += `⚡ **Required Action:** ${focusedAction.requiredAction}\n`
    if (focusedAction.householdImpact) content += `🏡 **Household Impact:** ${focusedAction.householdImpact}\n`
    content += `\nHow would you like to handle this action item?`

    primeMessages([{ id: crypto.randomUUID(), role: 'assistant', content }])
  }, [open, focusedAction, launchContext?.launchId, sessionLoading, loading, startFresh, primeMessages])

  useEffect(() => {
    if (!open || focusedEvent || focusedAction || loading) return
    if (launchContext?.agent !== 'chef') return
    if (sessionLoading) return
    if (!launchContext?.launchId) return
    if (firedChefGreetRef.current === launchContext.launchId) return
    firedChefGreetRef.current = launchContext.launchId

    if (launchContext?.source === 'tonights-kitchen') {
      const plan = useAppStore.getState().dinnerPlan
      const msg: AIMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `**Tonight's Kitchen Planning**\n\nCurrently planned: **${plan.title}** (${plan.targetTime || '6:30 PM Target'}).\n\nWhat's the pivot for tonight? Tap a quick option below, generate an on-the-fly recipe from the pantry, or tell me what you'd like to switch to!`,
      }
      if (messages.length === 0) {
        primeMessages([msg])
      } else {
        appendSyntheticMessage(msg)
      }
      return
    }

    const defaultChefMsg: AIMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: "Chef Agent online.\n\nI can help you plan weeknight meals, generate custom recipes from what's in your pantry, optimize grocery lists, and manage tonight's dinner.\n\nTry: “Cook with what we have on hand” or “Plan 4 quick dinners under 30 minutes.”",
    }
    if (messages.length === 0) {
      primeMessages([defaultChefMsg])
    } else {
      appendSyntheticMessage(defaultChefMsg)
    }
  }, [open, focusedEvent, loading, launchContext?.agent, launchContext?.launchId, launchContext?.source, sessionLoading, messages.length, primeMessages, appendSyntheticMessage])

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
    const imageItems = items.filter(i => i.type.startsWith('image/'))
    if (imageItems.length > 0) {
      e.preventDefault()
      markUserInteraction()
      const newImages: Array<{ dataUrl: string; mimeType: string }> = []
      for (const item of imageItems) {
        const blob = item.getAsFile()
        if (blob) {
          const img = await readImageFile(blob)
          newImages.push(img)
        }
      }
      if (newImages.length > 0) {
        setAttachedImages(prev => [...prev, ...newImages])
      }
    }
  }, [readImageFile, markUserInteraction])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const imageFiles = files.filter(f => f.type.startsWith('image/'))
    if (imageFiles.length > 0) {
      markUserInteraction()
      const newImages: Array<{ dataUrl: string; mimeType: string }> = []
      for (const file of imageFiles) {
        const img = await readImageFile(file)
        newImages.push(img)
      }
      if (newImages.length > 0) {
        setAttachedImages(prev => [...prev, ...newImages])
      }
    }
    e.target.value = ''
  }, [readImageFile, markUserInteraction])

  const handleRemoveImage = useCallback((indexToRemove: number) => {
    setAttachedImages(prev => prev.filter((_, idx) => idx !== indexToRemove))
  }, [])

  const handleSend = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = (textareaRef.current?.value ?? input).trim()
    const imgs = attachedImages
    if ((!text && imgs.length === 0) || loading) return
    markUserInteraction()
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    setAttachedImages([])
    if (imgs.length === 0 && dispatchPendingConfirmation(text)) return
    void sendTraced(text || (imgs.length > 1 ? '(see attached images)' : '(see attached image)'), imgs.length > 0 ? imgs : undefined)
  }, [input, attachedImages, loading, sendTraced, markUserInteraction, dispatchPendingConfirmation])

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

  const hasSession = !sessionLoading && !!session && session.messages.length > 0
  const voiceLevel = Math.max(0, Math.min(1, speech.volume / 100))

  const loadHistoryConversations = useCallback(() => {
    if (!privateHistory.access) return
    setHistoryListLoading(true)
    void privateHistory.listConversations()
      .then(setHistoryConversations)
      .catch((error: unknown) => setHistoryUnlockError(error instanceof Error ? error.message : 'Private history could not be loaded.'))
      .finally(() => setHistoryListLoading(false))
  }, [privateHistory.access, privateHistory.listConversations])
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

  const drawerBody = (
    <>
      {/* Drawer Header Bar */}
      <div className="py-2 px-4 sm:px-5 flex items-center justify-between border-b border-casa-gold/20 bg-gradient-to-r from-casa-surface via-casa-bg to-casa-surface shrink-0 relative z-20 shadow-2xs min-h-[44px]">
        <div className="flex items-center gap-2 min-w-0">
          {focusedEvent && focusedEvent.members && focusedEvent.members.length > 0 && (
            <div className="flex items-center gap-1.5 min-w-0">
              <div className="flex items-center">
                {focusedEvent.members.slice(0, 3).map((m) => (
                  <div
                    key={m.id || m.family_member?.id}
                    className="w-5 h-5 rounded-full border border-white text-2xs font-extrabold flex items-center justify-center text-white shrink-0 -ml-1 first:ml-0 shadow-2xs"
                    style={{ backgroundColor: getDisplayMemberColor(m.family_member?.color_hex) }}
                  >
                    {(m.family_member?.name ?? 'M').charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-2xs font-extrabold text-casa-navy uppercase tracking-wider truncate">
                {focusedEvent.members.map((m) => m.family_member?.name).filter(Boolean).join(' + ') || 'Event'}
              </span>
            </div>
          )}

          {loading && (
            <span className="text-casa-gold text-2xs font-semibold animate-pulse flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full bg-casa-gold/10 border border-casa-gold/25">
              <span className="w-1.5 h-1.5 rounded-full bg-casa-gold animate-pulse inline-block" />
              thinking…
            </span>
          )}
          {!loading && speech.listening && (
            <span className="text-red-500 text-2xs font-semibold flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-full bg-red-50 border border-red-200">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse inline-block" />
              listening
            </span>
          )}
        </div>

        {/* Action Buttons: Hero Flip Action, Private History, New Session, Close */}
        <div className="flex items-center gap-1.5 shrink-0">
          {onSwitchToEvent && (Boolean(focusedEvent) || Boolean(focusedAction)) && (
            <Button
              variant="ghost"
              type="button"
              onClick={onSwitchToEvent}
              title={`Flip to ${focusedEvent ? `event: ${focusedEvent.title}` : focusedAction ? `action: ${focusedAction.title}` : 'details'}`}
              aria-label="Flip to event details"
              className="min-h-[34px] px-3 py-1 flex items-center gap-1.5 rounded-full text-2xs font-bold text-casa-navy bg-casa-accent-subtle hover:bg-casa-accent-soft border border-casa-gold/40 shadow-2xs transition-all active:scale-95 group shrink-0"
            >
              <Rotate3d size={14} className="text-casa-gold transition-transform duration-300 group-hover:rotate-180" />
              <span>Flip to {focusedEvent ? 'Event' : 'Action'}</span>
            </Button>
          )}

          {Boolean(profile?.token || privateHistory.access) && (
            <IconButton
              variant="ghost"
              onClick={() => {
                setHistoryUnlockError(null)
                setHistoryModalOpen(true)
                loadHistoryConversations()
              }}
              title={`Open ${profile?.memberName ?? 'your'} private conversation history`}
              aria-label="Private conversation history"
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-full hover:bg-amber-50 text-amber-900"
              icon={<Lock size={15} className="text-amber-800" />}
            />
          )}

          {(hasSession || messages.length > 0) && (
            <IconButton
              variant="ghost"
              onClick={startFresh}
              title="New conversation"
              aria-label="New conversation"
              className="min-h-[32px] min-w-[32px] p-1.5 rounded-full hover:bg-slate-100 group"
              icon={<RotateCcw size={15} className="text-slate-800 transition-transform duration-300 group-hover:-rotate-90" />}
            />
          )}
          <IconButton
            variant="ghost"
            onClick={onClose}
            className="min-h-[32px] min-w-[32px] p-1.5 rounded-full hover:bg-slate-100"
            aria-label="Close assistant"
            title="Close assistant"
            icon={<X size={15} className="text-slate-800" />}
          />
        </div>
      </div>

      {/* Silent Executive Anchor HUD (Concept 2: Pure AI Mode) */}
      {focusedEvent && (
        <div className="border-b border-casa-gold/25 bg-gradient-to-r from-casa-surface-subtle via-casa-accent-subtle/40 to-casa-surface-subtle px-3.5 py-2.5 shrink-0 shadow-2xs backdrop-blur-sm flex items-center justify-between gap-2">
          <div
            onClick={() => handleOpenEventDetails(focusedEvent.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleOpenEventDetails(focusedEvent.id) }}
            title="Tap to view event details"
            className="flex items-center gap-2.5 min-w-0 flex-1 cursor-pointer hover:opacity-85 transition-opacity"
          >
            <div className="w-7 h-7 rounded-lg bg-casa-gold/15 border border-casa-gold/30 flex items-center justify-center shrink-0">
              <Calendar size={14} className="text-casa-gold" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="font-extrabold text-caption text-casa-navy truncate leading-tight">
                  {focusedEvent.title}
                </span>
              </div>
              <div className="flex items-center gap-2 text-2xs text-casa-muted font-medium truncate mt-0.5">
                <span>{format(new Date(focusedEvent.start_time), 'EEE, MMM d · h:mm a')}</span>
                {focusedEvent.location_name && (
                  <span className="hidden sm:inline-flex items-center gap-1 text-casa-muted truncate">
                    <span>·</span>
                    <MapPin size={10} className="text-casa-gold shrink-0" />
                    <span className="truncate">{focusedEvent.location_name}</span>
                  </span>
                )}
                {Boolean(focusedEvent.plan_override?.transportation_plan?.legs?.[0]?.driverName) && (
                  <span className="hidden md:inline-flex items-center gap-1 text-amber-900 bg-casa-gold/15 px-1.5 py-0.5 rounded-full font-bold">
                    <Car size={10} className="text-casa-gold" />
                    <span>{focusedEvent.plan_override?.transportation_plan?.legs?.[0]?.driverName}</span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {(focusedEvent.address || focusedEvent.location_name) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const dest = encodeURIComponent(focusedEvent.address || focusedEvent.location_name || '')
                  window.open(`https://www.google.com/maps/search/?api=1&query=${dest}`, '_blank')
                }}
                title="Open directions in Google Maps"
                className="min-h-[30px] px-2.5 py-0.5 text-2xs font-bold rounded-lg bg-casa-surface hover:bg-casa-accent-subtle text-casa-navy border border-casa-border shadow-2xs flex items-center gap-1"
              >
                <Navigation size={11} className="text-casa-gold" />
                <span className="hidden sm:inline">Directions</span>
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Pinned Focused Action Subheader Bar */}
      {focusedAction && !focusedEvent && (
        <div className="border-b border-casa-gold/25 bg-gradient-to-b from-amber-50/60 via-white to-amber-50/30 px-4 py-3 shrink-0 shadow-2xs backdrop-blur-sm">
          <div className="flex items-center justify-between gap-2 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-2xs uppercase tracking-wider font-extrabold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-gold-hover border border-casa-gold/30 shrink-0">
                ⚡ Action Item
              </span>
              {focusedAction.urgency && (
                <span className="text-caption font-semibold text-casa-muted truncate">
                  {focusedAction.urgency}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="font-extrabold text-body-sm text-casa-navy truncate">
              {focusedAction.title}
            </h3>
            {focusedAction.amount && (
              <span className="font-mono font-bold text-body-sm text-casa-gold-hover shrink-0">
                {focusedAction.amount}
              </span>
            )}
          </div>
          {focusedAction.sender && (
            <div className="text-caption text-casa-muted truncate mt-0.5 font-medium">
              From: {focusedAction.sender}
            </div>
          )}
        </div>
      )}

      {/* Messages */}
      <BounceScroll nativeScroll className="flex-1 min-h-0" innerClassName="px-4 py-4 space-y-3">
        {/* Session resume banner */}
              {hasSession && messages.length > 0 && !focusedEvent && !focusedAction && (
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

              {/* Editorial Proactive Welcome & Travertine Plinths */}
              {messages.length === 0 && (
                focusedEvent ? (
                  <div className="flex flex-col gap-3.5 py-3 text-left">
                    {/* Standby Card */}
                    <div className="rounded-2xl bg-gradient-to-br from-casa-surface via-casa-surface-subtle to-casa-accent-subtle/30 border border-casa-gold/35 p-4 shadow-subtle space-y-1.5">
                      <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-casa-gold-hover">
                        <Sparkles size={13} className="text-casa-gold" />
                        <span>Event Copilot Standby</span>
                      </div>
                      <h3 className="text-body font-bold text-casa-navy leading-snug">
                        Ready to assist with {focusedEvent.title}
                      </h3>
                      <p className="text-caption text-casa-muted leading-relaxed">
                        Ask a question, check conflicts, or tap a quick action below.
                      </p>
                    </div>

                    {/* Dynamic Event Suggestion Pills */}
                    <div className="space-y-2 pt-1">
                      <p className="text-2xs uppercase tracking-widest font-bold text-casa-muted px-1">Suggested actions</p>
                      <div className="flex flex-wrap gap-2">
                        {dynamicSuggestions.map(s => (
                          <Button
                            variant="ghost"
                            key={s}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => { markUserInteraction(); sendCurrentInput(s) }}
                            className="min-h-control px-3.5 py-1.5 rounded-full border border-casa-gold/30 bg-casa-surface hover:bg-casa-accent-subtle hover:border-casa-gold/60 text-caption font-semibold text-casa-navy transition-all shadow-2xs touch-manipulation cursor-pointer flex items-center gap-1.5"
                          >
                            <Sparkles size={12} className="text-casa-gold shrink-0" />
                            <span>{s}</span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3 py-2 text-left">
                    {/* Salutation Card */}
                    <div className="rounded-2xl bg-gradient-to-br from-casa-bg via-casa-surface-subtle to-casa-bg-2 border border-casa-gold/30 p-4 shadow-subtle space-y-1">
                      <div className="flex items-center gap-1.5 text-2xs font-bold uppercase tracking-wider text-casa-gold-hover">
                        <Sparkles size={13} className="text-casa-gold" />
                        <span>Estate Intelligence</span>
                      </div>
                      <h3 className="text-body font-bold text-casa-navy leading-snug">
                        {format(new Date(), 'EEEE, MMMM d')}
                      </h3>
                      <p className="text-caption text-casa-muted leading-relaxed">
                        Schedules, meal planning, grocery coordination, and proactive family assistance.
                      </p>
                    </div>

                    {/* Travertine Hero Plinth for Proactive Nudge */}
                    {proactiveNudge && !nudgeDismissed && (
                      <div className="rounded-2xl bg-casa-accent-subtle border border-casa-gold/45 p-4 shadow-card space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 text-caption font-bold uppercase tracking-wide text-amber-900">
                            <AlertTriangle size={15} className="text-casa-gold" />
                            <span>Attention Recommended</span>
                          </div>
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => setNudgeDismissed(true)}
                            aria-label="Dismiss notification"
                            className="text-casa-muted hover:text-casa-navy p-1 rounded-full hover:bg-black/5"
                          >
                            <X size={14} />
                          </Button>
                        </div>
                        <p className="text-body-sm font-semibold text-casa-navy leading-snug">
                          {proactiveNudge.text}
                        </p>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => { markUserInteraction(); sendCurrentInput(proactiveNudge.prompt) }}
                          className="w-full min-h-[44px] flex items-center justify-center gap-2 rounded-xl bg-white border border-casa-gold/40 text-casa-navy text-caption font-bold shadow-xs hover:bg-casa-gold/10 active:scale-[0.99] transition-all"
                        >
                          <Sparkles size={14} className="text-casa-gold" />
                          <span>Review with Copilot</span>
                        </Button>
                      </div>
                    )}

                    {/* Ambient Glance Cards */}
                    <AmbientGlanceCards
                      events={events}
                      onPromptSelect={(prompt) => {
                        markUserInteraction()
                        sendCurrentInput(prompt)
                      }}
                    />

                    {/* Dynamic Suggestion Pills */}
                    <div className="space-y-1.5 pt-1">
                      <p className="text-2xs uppercase tracking-widest font-bold text-casa-muted px-1">Suggested inquiries</p>
                      <div className="flex flex-wrap gap-1.5">
                        {dynamicSuggestions.map(s => (
                          <Button
                            variant="ghost"
                            key={s}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => { markUserInteraction(); sendCurrentInput(s) }}
                            className="min-h-[38px] px-3.5 py-1.5 rounded-full border border-casa-gold/30 bg-casa-bg text-caption font-semibold text-casa-navy hover:bg-white hover:border-casa-gold/60 transition-all shadow-2xs touch-manipulation cursor-pointer"
                          >
                            {s}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </div>
                )
              )}

              {messages.map((msg, messageIndex) => {
                const isLatestAssistant =
                  messageIndex === messages.length - 1 &&
                  msg.role === 'assistant' &&
                  !msg.streaming &&
                  !loading
                return (
                  <div key={msg.id} className="space-y-2">
                    <MessageBubble
                      msg={msg}
                      isActivePending={msg.id === activePendingToolMessageId}
                      events={events}
                      onOpenEventDetails={handleOpenEventDetails}
                      onLinkClick={handleLinkClick}
                      enableQuickSaveRecipe={page === 'cook' || launchContext?.agent === 'chef'}
                      editSeed={messages.slice(0, messageIndex).findLast((message) => message.role === 'user')?.content ?? ''}
                      onQuickSaveRecipe={quickSaveRecipeSuggestion}
                      onQuickSaveAndSetTonight={quickSaveAndSetTonightRecipe}
                      onConfirmToolAction={async (messageId, tool, args) => {
                        if (tool === 'confirm_talk_plan_action_intent') {
                          updateMessageToolStatus(messageId, 'done')
                          await send(String(args.original_request ?? ''), undefined, undefined, {
                            replayExistingUserMessage: true,
                            talkPlanIntentResolution: 'confirmed_action',
                          })
                          return true
                        }
                        if (tool === 'update_dinner_plan') {
                          updateMessageToolStatus(messageId, 'loading')
                          try {
                            const defaultDriverOrChef = (args.mode === 'takeout' || args.mode === 'dineout') ? 'Jake' : 'Jake & Kelly'
                            const plan: DinnerPlan = {
                              mode: (args.mode as DinnerMode) || 'takeout',
                              title: String(args.title || "Flanigan's Seafood Bar & Grill"),
                              subtitle: String(args.subtitle || (args.mode === 'takeout' ? `Pickup: ${args.chefOrDriver || 'Jake'} · Order Window: 6:00–6:15 PM` : '25m prep · Pantry stock confirmed · Chef: Jake & Kelly')),
                              targetTime: String(args.targetTime || '6:30 PM Target'),
                              recipeId: args.recipeId ? String(args.recipeId) : undefined,
                              chefOrDriver: args.chefOrDriver ? String(args.chefOrDriver) : defaultDriverOrChef,
                              statusBadge: args.statusBadge ? String(args.statusBadge) : (args.mode === 'takeout' ? 'Order ready for pickup' : 'Ingredients ready'),
                            }
                            useAppStore.getState().setDinnerPlan(plan)
                            void saveTonightDinnerPlan(plan)
                            qc.invalidateQueries({ queryKey: ['copilot-meal-plans'] })
                            qc.invalidateQueries({ queryKey: ['recipe-meal-plans'] })
                            updateMessageToolStatus(messageId, 'done')
                            return true
                          } catch (err) {
                            updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
                            return false
                          }
                        }
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
                            : tool === 'create_event' && (args.calendar_preflight || args.allow_calendar_conflicts)
                              ? { ...args, allow_calendar_conflicts: true }
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
                              confirmed_by_user: true,
                            },
                          })

                          let responseData = data
                          if (error && typeof error === 'object' && 'context' in error) {
                            const resp = (error as { context?: unknown }).context
                            if (resp && typeof resp === 'object' && 'json' in resp) {
                              try {
                                const readable = 'clone' in resp && typeof (resp as any).clone === 'function'
                                  ? (resp as any).clone()
                                  : resp
                                const parsed = await (readable as { json: () => Promise<any> }).json()
                                if (parsed && typeof parsed === 'object') {
                                  responseData = parsed
                                }
                              } catch {
                                // Fallback to raw error
                              }
                            }
                          }

                          // If the backend detected a conflict/duplicate requiring confirmation, transition to pending with preflight attached
                          if (responseData?.code === 'calendar_conflict_confirmation_required' && responseData?.calendar_preflight) {
                            updateMessageToolStatus(messageId, 'pending', {
                              args: {
                                ...requestArgs,
                                calendar_preflight: responseData.calendar_preflight,
                                allow_calendar_conflicts: true,
                              },
                            })
                            if (actionTrace) {
                              emitAssistantTrace('calendar_conflict_detected', actionTrace, {
                                detail: 'Calendar conflict requires user confirmation',
                                payload: { message_id: messageId, tool, preflight: responseData.calendar_preflight },
                              })
                            }
                            return false
                          }

                          if (error && !responseData?.success) {
                            const serverMsg = typeof responseData?.error === 'string' ? responseData.error : error.message
                            throw new Error(serverMsg || 'Action failed')
                          }
                          if (responseData?.success === false) throw new Error(responseData.error ?? 'Action failed')
                          updateMessageToolStatus(messageId, 'done', {
                            actionId: responseData?.action_id,
                            resultEventId: responseData?.event_id,
                            conversationState: conversationStateAfterCalendarAction(
                              tool,
                              requestArgs,
                              responseData,
                              new Date(),
                              msg.conversationState,
                            ),
                            syncWarning: data?.duplicate ? data?.message : (responseData?.duplicate ? responseData?.message : responseData?.sync_warning),
                            syncStatus: responseData?.sync_status === 'queued' ? 'queued' : responseData?.sync_status === 'failed' ? 'failed' : 'synced',
                            undoStatus: 'idle',
                            undoErrorMsg: undefined,
                          })
                          invalidateAllCalendarQueries(qc, String(requestArgs?.event_id ?? requestArgs?.id ?? focusedEvent?.id ?? ''))
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
                        const targetMsg = messages.find((m) => m.id === messageId)
                        if (targetMsg?.toolAction?.tool === 'add_grocery_items') {
                          updateMessageToolStatus(messageId, 'done', { undoStatus: 'loading', undoErrorMsg: undefined })
                          try {
                            const createdIds = autoGroceryCreatedIdsRef.current.get(messageId) ?? []
                            if (createdIds.length > 0) {
                              const { error } = await supabase
                                .from('grocery_items')
                                .update({ deleted_at: new Date().toISOString(), last_modified_source: 'casa' })
                                .in('id', createdIds)
                              if (error) throw error
                            }
                            updateMessageToolStatus(messageId, 'done', {
                              undoStatus: 'done',
                              undoErrorMsg: undefined,
                            })
                            qc.invalidateQueries({ queryKey: ['grocery'] })
                          } catch (err) {
                            updateMessageToolStatus(messageId, 'done', {
                              undoStatus: 'error',
                              undoErrorMsg: (err as Error).message,
                            })
                          }
                          return
                        }

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
                          invalidateAllCalendarQueries(qc, focusedEvent?.id)
                        } catch (err) {
                          updateMessageToolStatus(messageId, 'done', {
                            undoStatus: 'error',
                            undoErrorMsg: (err as Error).message,
                          })
                        }
                      }}
                      onCancelToolAction={(messageId) => {
                        const message = messages.find(item => item.id === messageId)
                        updateMessageToolStatus(messageId, 'cancelled')
                        const trace = activeTraceRef.current
                        if (trace) {
                          emitAssistantTrace('confirmation_cancelled', trace, {
                            detail: 'Confirmation cancelled',
                            payload: { message_id: messageId },
                          })
                        }
                        if (message?.toolAction?.tool === 'confirm_talk_plan_action_intent') {
                          void send(
                            String(message.toolAction.args.original_request ?? ''),
                            undefined,
                            undefined,
                            {
                              replayExistingUserMessage: true,
                              talkPlanIntentResolution: 'conversation_only',
                            },
                          )
                        }
                      }}
                      onRefreshToolAction={() => {
                        invalidateAllCalendarQueries(qc, focusedEvent?.id)
                      }}
                      registerPendingAction={registerPendingVoiceAction}
                      onSelectSuggestion={(text) => {
                        markUserInteraction()
                        sendCurrentInput(text)
                      }}
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
                    {isLatestAssistant && !hasPendingToolAction && dynamicSuggestions.length > 0 && (
                      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1 pl-1">
                        {dynamicSuggestions.map((s) => (
                          <Button
                            variant="ghost"
                            key={s}
                            type="button"
                            onPointerDown={(e) => e.stopPropagation()}
                            onClick={() => {
                              markUserInteraction()
                              sendCurrentInput(s)
                            }}
                            className="px-3 py-1.5 rounded-full border border-casa-gold/30 bg-casa-gold/5 text-caption font-medium text-casa-navy hover:bg-casa-gold/15 hover:border-casa-gold/60 transition-all whitespace-nowrap shrink-0 shadow-xs touch-manipulation cursor-pointer"
                          >
                            <Sparkles size={11} className="inline mr-1 text-casa-gold" />
                            {s}
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}

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
                {attachedImages.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-2.5 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 overflow-x-auto pb-1.5 pt-0.5 scrollbar-thin">
                      {attachedImages.map((img, index) => (
                        <div key={index} className="relative inline-block shrink-0 rounded-xl border border-casa-border overflow-hidden group shadow-2xs">
                          <img
                            src={img.dataUrl}
                            alt={`Attached ${index + 1}`}
                            className="h-20 w-24 object-cover"
                          />
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => handleRemoveImage(index)}
                            className="absolute top-1 right-1 size-6 rounded-full bg-black/70 hover:bg-red-600 text-white flex items-center justify-center shadow outline-none transition-colors"
                            aria-label={`Remove attached image ${index + 1}`}
                          >
                            <X size={12} />
                          </Button>
                          <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/60 backdrop-blur-xs rounded px-1.5 py-0.5">
                            <ImageIcon size={9} className="text-white" />
                            <span className="text-3xs text-white font-semibold">Photo {index + 1}</span>
                          </div>
                        </div>
                      ))}

                      <Button
                        variant="subtle"
                        type="button"
                        onClick={() => setAttachmentMenuOpen(true)}
                        className="h-20 w-16 shrink-0 rounded-xl border border-dashed border-casa-gold/50 bg-casa-gold/5 hover:bg-casa-gold/15 text-casa-gold flex flex-col items-center justify-center gap-1 transition-colors"
                        title="Add another photo or attachment"
                        aria-label="Add another photo or attachment"
                      >
                        <Plus size={16} />
                        <span className="text-3xs font-bold">+ Add</span>
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className={cn(
                  'ai-presence-composer relative overflow-hidden bg-casa-bg rounded-2xl border border-casa-gold/30 transition-all duration-300 shadow-subtle focus-within:border-casa-gold focus-within:ring-2 focus-within:ring-casa-gold/20',
                  voiceComposerActive ? 'p-4' : 'p-3',
                  aiPresence === 'listening' && 'ai-presence-listening',
                  aiPresence === 'voice_active' && 'ai-presence-voice',
                  aiPresence === 'processing' && 'ai-presence-processing',
                  aiPresence === 'typing' && 'ai-presence-typing',
                  aiPresence === 'idle' && 'ai-presence-idle',
                )}
                style={presenceStyle}
              >
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileChange} />
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
                        className="min-h-control gap-2 rounded-xl border border-casa-gold/30 bg-white text-casa-navy font-semibold hover:bg-casa-gold/10"
                      >
                        <Keyboard size={16} />
                        Type instead
                      </Button>
                      <Button
                        variant="secondary"
                        type="button"
                        onClick={() => { markUserInteraction(); speech.finish() }}
                        className="min-h-control gap-2 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 font-bold hover:bg-amber-100"
                      >
                        <Square size={14} />
                        Stop
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="w-full flex flex-col gap-2">
                    <AnimatePresence initial={false}>
                      {attachmentMenuOpen && (
                        <motion.div
                          id="assistant-attachment-actions"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex gap-2 overflow-hidden pb-1"
                        >
                          <Button
                            variant="subtle"
                            type="button"
                            onClick={() => {
                              setAttachmentMenuOpen(false)
                              fileInputRef.current?.click()
                            }}
                            className="min-h-control flex-1 gap-2 text-body-sm rounded-xl border border-casa-gold/30 bg-white text-casa-navy font-semibold hover:bg-casa-gold/10"
                          >
                            <Paperclip size={16} /> Attach images
                          </Button>
                          <Button
                            variant="subtle"
                            type="button"
                            onClick={() => {
                              setAttachmentMenuOpen(false)
                              cameraInputRef.current?.click()
                            }}
                            className="min-h-control flex-1 gap-2 text-body-sm rounded-xl border border-casa-gold/30 bg-white text-casa-navy font-semibold hover:bg-casa-gold/10"
                          >
                            <Camera size={16} /> Take photo
                          </Button>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {/* Top: Full-width Textarea with ample room for multi-sentence prompts */}
                    <div className="relative w-full">
                      <textarea
                        ref={textareaRef}
                        value={input}
                        onChange={e => handleInputChange(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={attachedImages.length > 0 ? 'Ask Copilot about these attachments…' : 'Ask Copilot anything or speak…'}
                        rows={2}
                        aria-label="Assistant message"
                        className="w-full min-h-[44px] max-h-[160px] bg-transparent text-body text-casa-navy placeholder:text-casa-muted/80 outline-none resize-none leading-relaxed px-1 py-0.5 font-medium"
                      />
                    </div>

                    {/* Bottom: Dedicated Action Toolbar */}
                    <div className="flex items-center justify-between pt-1.5 border-t border-casa-gold/15">
                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={() => setAttachmentMenuOpen(value => !value)}
                          title="Add attachment"
                          className="size-control rounded-full text-casa-muted hover:text-casa-navy hover:bg-black/5 outline-none transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold"
                          aria-label="Add attachment"
                          aria-expanded={attachmentMenuOpen}
                          aria-controls="assistant-attachment-actions"
                        >
                          <Plus size={18} />
                        </Button>
                        {attachedImages.length > 0 && (
                          <span className="text-caption text-casa-gold-hover font-semibold truncate max-w-[140px]">
                            {attachedImages.length === 1 ? '1 image attached' : `${attachedImages.length} images attached`}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {speech.supported && (
                          <Button
                            variant="ghost"
                            type="button"
                            onClick={() => {
                              markUserInteraction()
                              setAttachmentMenuOpen(false)
                              speech.start()
                            }}
                            title="Start voice input"
                            className="min-h-control px-3 rounded-full flex items-center justify-center gap-1.5 outline-none transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold bg-gradient-to-r from-amber-50 to-amber-100/80 border border-amber-300 text-amber-900 hover:border-casa-gold hover:bg-amber-100 text-body-sm font-bold shadow-2xs active:scale-95"
                            aria-label="Start voice input"
                          >
                            <Mic size={15} className="text-amber-700" />
                            <span>Speak</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={handleKeyboardToggle}
                          title="Toggle on-screen keyboard"
                          className="ai-composer-kiosk-only size-control rounded-full items-center justify-center outline-none transition-all shrink-0 bg-casa-surface border border-casa-gold/30 text-casa-muted hover:text-casa-navy focus-visible:ring-2 focus-visible:ring-casa-gold"
                          aria-label="Toggle on-screen keyboard"
                        >
                          <Keyboard size={15} />
                        </Button>
                        <Button
                          variant="ghost"
                          type="button"
                          onClick={handleSend}
                          disabled={(!input.trim() && attachedImages.length === 0) || loading}
                          className={cn(
                            'size-control rounded-full flex items-center justify-center outline-none transition-all shrink-0 focus-visible:ring-2 focus-visible:ring-casa-gold',
                            (input.trim() || attachedImages.length > 0) && !loading
                              ? 'bg-gradient-to-r from-casa-gold to-amber-600 text-white hover:brightness-105 shadow-xs active:scale-95'
                              : 'bg-casa-divider text-casa-muted opacity-50'
                          )}
                          aria-label="Send message"
                        >
                          <Send size={15} />
                        </Button>
                      </div>
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
            <Modal
              open={historyModalOpen}
              onClose={() => setHistoryModalOpen(false)}
              title="Private conversation history"
              size="lg"
              className="z-toast"
              panelClassName="max-h-[88vh]"
              contentClassName="overflow-y-auto max-h-[calc(88vh-4rem)]"
            >
                <div className="space-y-4">
                  <p className="text-body-sm text-casa-muted">
                    {profile?.memberName}'s saved conversations are private, retained for 90 days, and never used as household memory or in Daily Brief.
                  </p>
                  {(historyUnlockError ?? privateHistory.error) && (
                    <p role="alert" className="text-body-sm text-casa-error">{historyUnlockError ?? privateHistory.error}</p>
                  )}
                  <div className="space-y-2">
                    <p className="text-caption font-semibold uppercase tracking-wide text-casa-muted">Saved conversations</p>
                    {historyListLoading && <p className="text-body-sm text-casa-muted">Loading private conversations…</p>}
                    {!historyListLoading && historyConversations.length === 0 && <p className="text-body-sm text-casa-muted">No saved conversations yet.</p>}
                    {historyConversations.filter((conversation) => !conversation.archived_at).map((conversation) => (
                      <div key={conversation.id} className="flex flex-col gap-3 rounded-card border border-casa-border p-3">
                        <div className="min-w-0">
                          <p className="truncate text-body-sm font-semibold text-casa-navy">{conversation.display_title ?? conversation.title}</p>
                          {conversation.summary && (
                            <p className="mt-1 line-clamp-2 text-caption text-casa-muted">{conversation.summary}</p>
                          )}
                          <p className="mt-1 text-caption text-casa-muted">
                            {conversation.experience_mode === 'talk_plan' ? 'Talk & Plan' : 'Do'}
                            {' · '}
                            Updated {new Date(conversation.updated_at).toLocaleString()}
                            {' · '}
                            Started {new Date(conversation.created_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button variant="ghost" size="sm" onClick={() => {
                            void resumePrivateConversation(conversation.id)
                              .then(() => setHistoryModalOpen(false))
                              .catch((error: unknown) => setHistoryUnlockError(error instanceof Error ? error.message : 'Conversation could not be resumed.'))
                          }}>Resume</Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            void privateHistory.exportConversation(conversation.id)
                              .then((payload) => {
                                const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
                                const url = URL.createObjectURL(blob)
                                const link = document.createElement('a')
                                link.href = url
                                link.download = `${conversation.title.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'casa-conversation'}.json`
                                link.click()
                                URL.revokeObjectURL(url)
                              })
                              .catch((error: unknown) => setHistoryUnlockError(error instanceof Error ? error.message : 'Conversation export failed.'))
                          }}>Export</Button>
                          <Button variant="ghost" size="sm" onClick={() => {
                            void privateHistory.archiveConversation(conversation.id).then(loadHistoryConversations)
                          }}>Archive</Button>
                          <Button variant="ghost" size="sm" className="text-casa-error" onClick={() => {
                            void privateHistory.forgetConversation(conversation.id).then(loadHistoryConversations)
                          }}>Forget</Button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <Button
                    variant="secondary"
                    fullWidth
                    onClick={() => {
                      setHistoryModalOpen(false)
                      signOut()
                    }}
                  >
                    Sign out of Casa
                  </Button>
                </div>
            </Modal>
    </>
  )

  if (embedded) {
    return (
      <div
        className={cn(
          'flex flex-col flex-1 h-full w-full overflow-hidden bg-casa-surface relative',
          loading && 'ai-thinking'
        )}
        data-panel-overlay
        data-touch-keyboard="ignore"
        onClick={e => e.stopPropagation()}
        onPaste={handlePaste}
      >
        {drawerBody}
      </div>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        isMobile ? (
          <>
            <motion.div
              key="ai-scrim-mobile"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-scrim bg-black/40 sm:hidden"
              onClick={onClose}
            />
            <motion.div
              key="ai-sheet-mobile"
              initial={{ y: '100%', opacity: 0.95 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0.95 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className={cn(
                'fixed inset-x-0 bottom-0 z-popover bg-casa-surface flex flex-col sm:hidden shadow-modal rounded-t-2xl',
                loading && 'ai-thinking',
              )}
              data-panel-overlay
              data-touch-keyboard="ignore"
              style={{
                maxHeight: '88vh',
                paddingBottom: 'env(safe-area-inset-bottom)',
              }}
              onClick={e => e.stopPropagation()}
              onPaste={handlePaste}
            >
              {/* Drag handle — mobile only */}
              <div className="flex justify-center pt-3 pb-1 sm:hidden flex-shrink-0">
                <div className="w-9 h-1 bg-casa-divider rounded-full" />
              </div>
              {drawerBody}
            </motion.div>
          </>
        ) : (
          <motion.aside
            key="ai-sidecar-desktop"
            initial={{ x: '100%', opacity: 0.9 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: '100%', opacity: 0.9 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className={cn(
              'hidden sm:flex flex-col flex-shrink-0 h-full overflow-hidden border-l border-casa-border bg-casa-surface relative z-10 shadow-lg w-[var(--ai-sidecar-width,420px)] [will-change:transform]',
              loading && 'ai-thinking',
            )}
            data-panel-overlay
            data-touch-keyboard="ignore"
            onClick={e => e.stopPropagation()}
            onPaste={handlePaste}
          >
            <div style={{ width: sidecarWidth }} className="h-full flex flex-col flex-shrink-0">
              {drawerBody}
            </div>
          </motion.aside>
        )
      )}
    </AnimatePresence>
  )
}

/* ── Message Bubble ─────────────────────────────────────────── */

const MAX_VISIBLE_SOURCES = 3

function MessageBubble({ msg, isActivePending, enableQuickSaveRecipe, editSeed, events, onOpenEventDetails, onLinkClick, onQuickSaveRecipe, onQuickSaveAndSetTonight, onConfirmToolAction, onUndoToolAction, onCancelToolAction, onRefreshToolAction, registerPendingAction, onSelectSuggestion, onEditMessage }: {
  msg: AIMessage
  isActivePending: boolean
  enableQuickSaveRecipe?: boolean
  editSeed?: string
  events: EventWithDetails[]
  onOpenEventDetails?: (eventId: string) => void
  onLinkClick?: (href: string) => void
  onQuickSaveRecipe?: (recipeMessage: string) => Promise<void>
  onQuickSaveAndSetTonight?: (recipeMessage: string) => Promise<void>
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<boolean>
  onUndoToolAction: (messageId: string, actionId: string) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  onRefreshToolAction: () => void
  registerPendingAction: (
    messageId: string,
    handlers: Pick<PendingVoiceAction, 'confirm' | 'cancel'> | null,
  ) => void
  onSelectSuggestion?: (text: string) => void
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
  const canEdit = isUser && !ta && !msg.imageDataUrl && !(msg.imageDataUrls && msg.imageDataUrls.length > 0) && Boolean(onEditMessage) && msg.content !== '(see attached image)' && msg.content !== '(see attached images)' && Boolean(msg.content?.trim())
  const isStaleError = !!ta?.errorMsg && ta.errorMsg.toLowerCase().includes('changed since')
  const preferredEventId = msg.conversationState?.activeEntityType === 'event'
    ? msg.conversationState.activeEventId
    : ta?.resultEventId
  const assistantContent = !isUser
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
    try {
      return await onConfirmToolAction(msg.id, ta.tool, ta.args)
    } finally {
      actionTransitionRef.current = false
    }
  }, [msg.id, ta, onConfirmToolAction])

  const doConfirmCandidate = useCallback(async (candidateArgs: Record<string, unknown>) => {
    if (!ta || actionTransitionRef.current) return false
    actionTransitionRef.current = true
    try {
      return await onConfirmToolAction(msg.id, ta.tool, candidateArgs)
    } finally {
      actionTransitionRef.current = false
    }
  }, [msg.id, ta, onConfirmToolAction])

  const doCancel = useCallback(async () => {
    if (actionTransitionRef.current) return false
    actionTransitionRef.current = true
    try {
      onCancelToolAction(msg.id)
      return true
    } finally {
      actionTransitionRef.current = false
    }
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
          'max-w-[85%] rounded-2xl px-4 py-3 text-body-sm leading-relaxed',
          isUser
            ? 'bg-casa-navy text-white rounded-br-sm shadow-xs border border-white/10'
            : 'bg-casa-bg border border-casa-gold/30 text-casa-navy rounded-bl-sm shadow-subtle',
          canEdit && 'cursor-pointer hover:brightness-110 transition',
        )}
        onClick={canEdit ? () => onEditMessage?.(msg.content) : undefined}
        title={canEdit ? 'Tap to edit and resend' : undefined}
      >
        {(() => {
          const images = msg.imageDataUrls && msg.imageDataUrls.length > 0
            ? msg.imageDataUrls
            : msg.imageDataUrl
              ? [msg.imageDataUrl]
              : []
          if (images.length === 0) return null
          if (images.length === 1) {
            return (
              <img
                src={images[0]}
                alt="Attached"
                className="max-h-48 w-auto rounded-xl mb-2 object-cover border border-white/10 shadow-2xs"
              />
            )
          }
          return (
            <div className="grid grid-cols-2 gap-1.5 mb-2.5 max-w-[280px]">
              {images.map((url, idx) => (
                <img
                  key={idx}
                  src={url}
                  alt={`Attached ${idx + 1}`}
                  className="h-24 w-full rounded-lg object-cover border border-white/10 shadow-2xs"
                />
              ))}
            </div>
          )
        })()}
        {!ta && msg.content !== '(see attached image)' && msg.content !== '(see attached images)' && msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap">{msg.content}</p>
            : (
              <MarkdownContent
                content={assistantContent ?? formatTextForMarkdown(msg.content)}
                onLinkClick={(href) => {
                  if (onLinkClick) {
                    onLinkClick(href)
                  } else {
                    const eventId = parseAssistantEventHref(href)
                    if (eventId) onOpenEventDetails?.(eventId)
                  }
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
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Button
              variant="champagne"
              type="button"
              disabled={quickSaving}
              onClick={() => {
                if (!onQuickSaveAndSetTonight) return
                setQuickSaving(true)
                void onQuickSaveAndSetTonight(msg.content).finally(() => setQuickSaving(false))
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-bold shadow-2xs"
            >
              {quickSaving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              Set as Tonight's Dinner & Save
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={quickSaving}
              onClick={() => {
                if (!onQuickSaveRecipe) return
                setQuickSaving(true)
                void onQuickSaveRecipe(msg.content).finally(() => setQuickSaving(false))
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-button text-caption font-semibold text-casa-navy hover:bg-casa-gold/15 disabled:opacity-60"
            >
              {quickSaving ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
              Save to Library Only
            </Button>
          </div>
        )}

        {/* Disambiguation and clarification selection cards */}
        {msg.conversationState?.activeEntityType === 'calendar_clarification' && Array.isArray(msg.conversationState.candidateEvents) && msg.conversationState.candidateEvents.length > 0 && (
          <div className="mt-2.5 space-y-1.5 pt-2 border-t border-casa-border/50">
            <p className="text-caption font-semibold text-casa-muted">Select an event:</p>
            <div className="flex flex-col gap-1.5">
              {msg.conversationState.candidateEvents.map((evt) => {
                const timeLabel = evt.start ? format(new Date(evt.start), 'EEE, MMM d · h:mm a') : 'Scheduled'
                return (
                  <Button
                    key={evt.id}
                    variant="ghost"
                    type="button"
                    onClick={() => onSelectSuggestion?.(`Select "${evt.title}" on ${timeLabel}`)}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg border border-casa-border bg-casa-surface/80 hover:bg-casa-gold/10 hover:border-casa-gold/50 text-left transition-all"
                  >
                    <div className="min-w-0">
                      <p className="text-body-sm font-semibold text-casa-navy truncate">{evt.title}</p>
                      <p className="text-caption text-casa-muted">{timeLabel}</p>
                    </div>
                    <ChevronRight size={14} className="text-casa-muted shrink-0" />
                  </Button>
                )
              })}
            </div>
          </div>
        )}

        {msg.conversationState?.activeEntityType === 'grocery_clarification' && Array.isArray(msg.conversationState.candidateGroceryItems) && msg.conversationState.candidateGroceryItems.length > 0 && (
          <div className="mt-2.5 space-y-1.5 pt-2 border-t border-casa-border/50">
            <p className="text-caption font-semibold text-casa-muted">Select a grocery item:</p>
            <div className="flex flex-wrap gap-1.5">
              {msg.conversationState.candidateGroceryItems.map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  type="button"
                  onClick={() => onSelectSuggestion?.(`Select ${item.name}`)}
                  className="px-2.5 py-1 rounded-full border border-casa-border bg-casa-surface/80 hover:bg-casa-gold/10 hover:border-casa-gold/50 text-caption font-medium text-casa-navy transition-all"
                >
                  {item.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Tool action confirmation card */}
        {ta && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {ta.status === 'done' ? (
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                    <Check size={13} />
                    {ta.tool === 'confirm_talk_plan_action_intent' ? 'Action intent confirmed'
                      : ta.tool === 'update_dinner_plan' ? 'Tonight’s Kitchen updated on Dashboard ✓'
                      : ta.tool === 'create_event' ? 'Created & added to calendar ✓'
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
                  {ta.tool === 'add_grocery_items' && ta.undoStatus !== 'done' && (
                    <Button variant="ghost"
                      type="button"
                      onClick={() => onUndoToolAction(msg.id, ta.actionId ?? msg.id)}
                      disabled={ta.undoStatus === 'loading'}
                      className="flex items-center gap-1 px-2.5 py-0.5 rounded-button border border-casa-border text-casa-navy text-caption font-semibold hover:bg-casa-surface transition-all disabled:opacity-60 shrink-0"
                    >
                      {ta.undoStatus === 'loading' ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                      Undo
                    </Button>
                  )}
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
                {ta.tool === 'update_dinner_plan' && ta.args && (
                  <div className="mt-1.5 p-2.5 rounded-xl bg-casa-card border border-casa-border text-caption space-y-1">
                    <p className="font-semibold text-casa-navy">
                      {String(ta.args.title)} {ta.args.targetTime ? `· ${String(ta.args.targetTime)}` : ''}
                    </p>
                    {Boolean(ta.args.subtitle) && (
                      <p className="text-casa-muted">{String(ta.args.subtitle)}</p>
                    )}
                    {Boolean(ta.args.statusBadge) && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 font-medium text-caption">
                        <Check size={11} />
                        {String(ta.args.statusBadge)}
                      </div>
                    )}
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
                {ta.undoStatus === 'error' && ta.undoErrorMsg && ta.tool === 'add_grocery_items' && (
                  <p className="text-caption text-red-500">{ta.undoErrorMsg}</p>
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
                  {(() => {
                    const isReminderAction = (ta.args as { event_type?: string })?.event_type === 'reminder'
                    const membersArg = Array.isArray(ta.args.members) ? ta.args.members : []
                    const hasConflictOrDuplicate = Boolean(
                      ta.tool === 'create_event' && (
                        ta.args.calendar_preflight ||
                        ta.args.allow_calendar_conflicts ||
                        (!isReminderAction && findOverlappingEvent(events, ta.args.start ?? ta.args.start_time, ta.args.end ?? ta.args.end_time, null, membersArg, ta.args.event_type))
                      )
                    )
                    return (
                      <Button variant="ghost"
                        type="button"
                        disabled={ta.status === 'loading'}
                        onClick={doConfirm}
                        className={cn(
                          'min-h-control flex items-center gap-2 px-4 rounded-button text-body-sm font-semibold transition-colors disabled:opacity-50',
                          isDestructiveAction
                            ? 'bg-red-600 text-white hover:brightness-110'
                            : hasConflictOrDuplicate
                              ? 'bg-amber-600 text-white hover:brightness-110'
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
                            : ta.tool === 'confirm_talk_plan_action_intent'
                              ? 'Yes, prepare it'
                            : ta.tool === 'update_event'
                              ? 'Apply change'
                            : ta.tool === 'create_event'
                              ? (ta.args as { event_type?: string })?.event_type === 'reminder'
                                ? 'Create reminder'
                                : hasConflictOrDuplicate
                                  ? 'Create anyway (keep both)'
                                  : 'Create event'
                              : confirmActionLabel(ta.tool)}
                      </Button>
                    )
                  })()}
                  {ta.tool !== 'confirm_talk_plan_action_intent' && !isDestructiveAction && onEditMessage && editSeed?.trim() && (
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
                    <XCircle size={12} />
                    {ta.tool === 'confirm_talk_plan_action_intent' ? 'No, answer conversationally' : 'Cancel'}
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
  if (tool === 'update_dinner_plan') return 'Apply to Dashboard'
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
          ? 'Kitchen & Dinner'
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

function findOverlappingEvent(
  events: EventWithDetails[],
  startTimeStr: unknown,
  endTimeStr: unknown,
  ignoreEventId?: string | null,
  targetMembers?: unknown,
  eventTypeStr?: unknown,
): EventWithDetails | null {
  if (eventTypeStr === 'reminder') return null
  if (!startTimeStr || typeof startTimeStr !== 'string') return null
  const startMs = new Date(startTimeStr).getTime()
  if (!Number.isFinite(startMs)) return null
  const endMs = (typeof endTimeStr === 'string' && Number.isFinite(new Date(endTimeStr).getTime()))
    ? new Date(endTimeStr).getTime()
    : startMs + 3600_000

  const cleanTargetMembers = (Array.isArray(targetMembers) ? targetMembers : [])
    .map((m) => String(m).trim().toLowerCase())
    .filter(Boolean)

  if (cleanTargetMembers.length === 0) return null

  return events.find((e) => {
    if (ignoreEventId && e.id === ignoreEventId) return false
    if (e.all_day || !e.start_time || e.event_type === 'reminder') return false
    const eStart = new Date(e.start_time).getTime()
    const eEnd = new Date(e.end_time ?? e.start_time).getTime()
    if (!Number.isFinite(eStart) || !Number.isFinite(eEnd)) return false
    const overlaps = Math.max(startMs, eStart) < Math.min(endMs, eEnd)
    if (!overlaps) return false

    const eMembers = (e.members ?? (e as any).event_members ?? []).map((m: any) =>
      (m.family_member?.name ?? m.family_members?.name ?? m.name ?? '').trim().toLowerCase()
    ).filter(Boolean)

    if (eMembers.length === 0) return false
    return cleanTargetMembers.some((tm) => eMembers.includes(tm))
  }) ?? null
}

function ToolActionPreview({ tool, args, events }: { tool: string; args: Record<string, unknown>; events: EventWithDetails[] }) {
  const [expanded, setExpanded] = useState(false)

  if (tool === 'update_dinner_plan') {
    const mode = String(args.mode ?? 'takeout')
    const title = String(args.title ?? "Flanigan's Seafood Bar & Grill")
    const targetTime = String(args.targetTime ?? '6:30 PM Target')
    const chefOrDriver = args.chefOrDriver ? String(args.chefOrDriver) : undefined
    const subtitle = args.subtitle ? String(args.subtitle) : undefined

    return (
      <div className="space-y-3">
        <ConfirmationHeading kind="recipe">Update Tonight's Kitchen Plan?</ConfirmationHeading>
        <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-casa-surface to-casa-surface p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-body font-bold text-casa-navy">{title}</span>
            <span className="text-caption font-semibold px-2.5 py-0.5 rounded-full bg-casa-surface border border-casa-border text-casa-navy shadow-2xs">
              {mode === 'takeout' ? 'Takeout' : mode === 'leftovers' ? 'Leftovers' : mode === 'dineout' ? 'Dining Out' : 'Cooking'}
            </span>
          </div>
          <div className="text-caption text-casa-text-secondary space-y-1">
            <p><span className="font-semibold text-casa-navy">Time:</span> {targetTime}</p>
            {chefOrDriver && (
              <p><span className="font-semibold text-casa-navy">{mode === 'takeout' ? 'Pickup Driver:' : 'Chef:'}</span> {chefOrDriver}</p>
            )}
            {subtitle && (
              <p className="text-casa-muted mt-1">{subtitle}</p>
            )}
          </div>
        </div>
        <p className="text-caption text-casa-muted">
          Applying this will instantly update the Tonight's Kitchen card on the live dashboard.
        </p>
      </div>
    )
  }

  if (tool === 'confirm_talk_plan_action_intent') {
    return (
      <Card tone="subtle" padding="sm" className="space-y-2">
        <Heading role="heading">Use Casa action mode?</Heading>
        <Text role="body-sm">
          Are you asking Casa to create or change a {String(args.action_kind ?? 'household item')}?
        </Text>
        <Text role="caption" muted>
          Yes prepares the normal detailed action card. No continues this as a Talk & Plan conversation.
        </Text>
      </Card>
    )
  }

  if (tool === 'create_event') {
    const preview = buildCreatePreviewCopy(args, { now: new Date() })
    const isReminder = args.event_type === 'reminder'
    const startStr = (args.start ?? args.start_time) as string | undefined
    const endStr = (args.end ?? args.end_time) as string | undefined
    const titleStr = String(args.title ?? '').trim()
    const membersArg = Array.isArray(args.members) ? args.members : []
    const conflict = !isReminder ? findOverlappingEvent(events, startStr, endStr, null, membersArg, args.event_type) : null
    const duplicate = !isReminder && startStr && titleStr ? events.find((e) => {
      if (e.all_day || !e.start_time || e.event_type === 'reminder') return false
      const sameDay = new Date(e.start_time).toDateString() === new Date(startStr).toDateString()
      const sameTitle = e.title.trim().toLowerCase() === titleStr.toLowerCase()
      return sameDay && sameTitle
    }) : null

    const preflight = args.calendar_preflight as {
      status?: string
      conflicts?: Array<{ id?: string; title?: string; start_time?: string; end_time?: string }>
      probableDuplicates?: Array<{ id?: string; title?: string; start_time?: string; end_time?: string }>
      exactDuplicate?: { id?: string; title?: string; start_time?: string; end_time?: string } | null
    } | undefined

    const preflightConflict = preflight?.conflicts?.[0]
    const preflightDuplicate = preflight?.probableDuplicates?.[0] ?? preflight?.exactDuplicate

    const activeConflict = preflightConflict ?? conflict
    const activeDuplicate = preflightDuplicate ?? duplicate
    const isExactMatch = activeDuplicate && activeDuplicate.title?.trim().toLowerCase() === titleStr.toLowerCase()
    const isHotelOrStay = /\b(?:hotel|resort|inn|suite|suites|motel|stay|lodge|airbnb|reservation|flight|booking)\b/i.test(titleStr) ||
      (typeof args.notes === 'string' && /\b(?:conf(?:irmation)?|room|check-in|checkout)\b/i.test(args.notes))

    return (
      <div className="space-y-3">
        <ConfirmationHeading kind={isReminder ? 'reminder' : isHotelOrStay ? 'recipe' : 'calendar'}>
          {activeDuplicate
            ? (isReminder ? 'Duplicate Reminder Detected' : 'Duplicate Event Detected')
            : activeConflict
              ? 'Calendar Conflict Detected'
              : isHotelOrStay
                ? `Confirm Reservation: "${titleStr || 'Reservation'}"`
                : preview.heading}
        </ConfirmationHeading>

        {/* Structured Preflight Card */}
        <div className="rounded-2xl border border-casa-gold/30 bg-gradient-to-br from-amber-500/5 via-casa-surface to-casa-surface p-3.5 space-y-2.5 shadow-2xs">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <span className="text-body font-bold text-casa-navy block truncate">
                {titleStr || 'New Event'}
              </span>
              {preview.when && (
                <p className="text-caption font-semibold text-casa-gold-hover flex items-center gap-1.5">
                  <CalendarDays size={13} className="shrink-0" />
                  <span>{preview.when}</span>
                </p>
              )}
            </div>
            {isHotelOrStay && (
              <span className="text-2xs font-bold px-2 py-0.5 rounded-full bg-casa-surface border border-casa-gold/40 text-casa-navy shrink-0 shadow-2xs flex items-center gap-1">
                <Building2 size={11} className="text-casa-gold" />
                Stay / Reservation
              </span>
            )}
          </div>

          {Boolean(args.location || args.address) && (
            <div className="flex items-start gap-1.5 text-caption text-casa-text-secondary">
              <MapPin size={13} className="text-casa-muted shrink-0 mt-0.5" />
              <span className="leading-snug">{String(args.location ?? args.address)}</span>
            </div>
          )}

          {membersArg.length > 0 && (
            <div className="flex items-center gap-1.5 text-caption text-casa-text-secondary">
              <Users size={13} className="text-casa-muted shrink-0" />
              <span>{membersArg.join(', ')}</span>
            </div>
          )}

          {Boolean(args.notes || args.description) && (
            <div className="flex items-start gap-1.5 text-caption text-casa-text-secondary pt-2 border-t border-casa-border/50">
              <FileText size={13} className="text-casa-muted shrink-0 mt-0.5" />
              <p className="whitespace-pre-wrap leading-relaxed line-clamp-4 font-mono text-2xs text-casa-navy/80">
                {String(args.notes ?? args.description)}
              </p>
            </div>
          )}
        </div>

        {activeDuplicate ? (
          <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-3 text-caption text-amber-900 dark:text-amber-200 space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle size={14} className="shrink-0 text-amber-600" />
              <span>
                {isExactMatch
                  ? (isReminder ? 'A reminder with this name already exists' : 'An event with this name already exists')
                  : (isReminder ? 'A similar reminder is already scheduled' : 'A similar event is already scheduled')}
              </span>
            </div>
            <p className="text-body-sm font-bold text-casa-navy">
              "{activeDuplicate.title}"
            </p>
            {activeDuplicate.start_time && (
              <p className="text-caption text-casa-text-secondary">
                Scheduled at {format(new Date(activeDuplicate.start_time), 'h:mm a · EEEE, MMM d')}
              </p>
            )}
            <p className="pt-1 text-caption font-medium text-amber-900 dark:text-amber-100">
              Do you still want to create this {isReminder ? 'reminder' : 'event'} and keep both?
            </p>
          </div>
        ) : activeConflict ? (
          <div className="rounded-xl border border-amber-300/80 bg-amber-500/10 p-3 text-caption text-amber-900 dark:text-amber-200 space-y-1.5 shadow-2xs">
            <div className="flex items-center gap-1.5 font-semibold text-amber-800 dark:text-amber-300">
              <AlertTriangle size={14} className="shrink-0 text-amber-600" />
              <span>Time overlap on your calendar</span>
            </div>
            <p className="text-body-sm font-bold text-casa-navy">
              "{activeConflict.title}"
            </p>
            {activeConflict.start_time && (
              <p className="text-caption text-casa-text-secondary">
                Scheduled for {format(new Date(activeConflict.start_time), 'h:mm a')}
                {activeConflict.end_time ? ` – ${format(new Date(activeConflict.end_time), 'h:mm a')}` : ''}
              </p>
            )}
            <p className="pt-1 text-caption font-medium text-amber-900 dark:text-amber-100">
              There is something else already scheduled at this time for this member. Do you still want to create this event?
            </p>
          </div>
        ) : null}

        {preview.details.length > 0 && !isHotelOrStay && (
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
    const existingMembers = (matchedEvent?.members ?? []).map((m) => m.family_member?.name ?? '').filter(Boolean)
    const membersArg = Array.isArray(args.members) ? args.members : existingMembers
    const conflict = matchedEvent?.event_type !== 'reminder' && args.event_type !== 'reminder'
      ? findOverlappingEvent(
          events,
          args.start_time ?? matchedEvent?.start_time,
          args.end_time ?? matchedEvent?.end_time,
          String(args.id ?? ''),
          membersArg,
          args.event_type ?? matchedEvent?.event_type,
        )
      : null
    const MAX_VISIBLE = 6
    const visibleChanges = expanded ? changes : changes.slice(0, MAX_VISIBLE)
    return (
      <div className="space-y-2">
        <ConfirmationHeading kind="calendar">{preview.heading}?</ConfirmationHeading>
        {scopeLabel && (
          <p className="text-caption font-semibold text-casa-gold">{scopeLabel}</p>
        )}
        {conflict && (
          <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-caption text-amber-900 font-medium">
            <AlertTriangle size={14} className="text-amber-600 shrink-0" />
            <span>Overlaps with "{conflict.title}" ({format(new Date(conflict.start_time), 'h:mm a')})</span>
          </div>
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
  home: ["What's next up today?", "Add an event tonight", "Any conflicts this week?", "Give me a quick rundown"],
  calendar: ["What does tomorrow look like?", "Add a new appointment", "Who's busiest this week?", "Find free time Saturday"],
  briefing: ["Summarize today for me", "What needs my attention?", "Walk me through today's timeline", "Any prep needed today?"],
  grocery: ["Add milk and eggs", "What's on the list?", "Clear checked items", "Suggest pantry staples"],
  cook: ["Plan 4 quick weeknight dinners", "Suggest a dinner with pantry items", "Optimize my meals for budget", "Build grocery list from the plan"],
  kitchen: ["🥡 Takeout from Flanigan's", "🍕 Pizza Night", "🍲 Reheat Leftovers", "🍽️ Dining Out", "⏰ Push dinner to 7:00 PM"],
  settings: ["How do I connect Google Calendars?", "Check sync status", "Set up family member PINs"],
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

/**
 * Derives dynamic follow-up chips based on the latest conversation turns,
 * current schedule, and active context.
 */
function deriveDynamicFollowUpSuggestions(
  messages: AIMessage[],
  page: string,
  events: EventWithDetails[],
  now: Date,
  focusedEvent?: EventWithDetails,
  source?: string,
  currentDinnerPlan?: DinnerPlan,
  focusedAction?: ActionAiContext,
): string[] {
  if (focusedEvent) {
    const titleLower = focusedEvent.title.toLowerCase()
    const categoryLower = (focusedEvent.enrichment?.category || '').toLowerCase()
    const isReminderOrChore = focusedEvent.event_type === 'reminder' || /trash|recycle|chore|meds|medication|clean|water|filter/i.test(titleLower)
    const isSchoolOrPhotos = /photo|picture|school|bak|rehearsal|concert|strings|band/i.test(titleLower) || /school|milestone/i.test(categoryLower)
    const isMedical = /dr|doctor|pediatric|dentist|appointment|clinic|therapy/i.test(titleLower) || /medical|health/i.test(categoryLower)

    if (isReminderOrChore) {
      return [
        'Mark completed now',
        'Snooze for 30 minutes',
        'Reassign family member',
        'Reschedule reminder',
      ]
    }

    if (isSchoolOrPhotos) {
      return [
        'Who is driving?',
        'Check for schedule overlaps',
        'Search email for school forms',
        'Adjust departure time',
      ]
    }

    if (isMedical) {
      return [
        'Check driving time and buffer',
        'Who is driving?',
        'View preparation notes',
        'Reschedule appointment',
      ]
    }

    return [
      'Who is driving?',
      'Check for schedule conflicts',
      'Adjust departure buffer',
      'Add event notes or checklist',
    ]
  }

  if (focusedAction) {
    if (focusedAction.amount || /payment|loan|bill|auto-pay|due/i.test(focusedAction.title)) {
      return [
        'Verify checking balance',
        'Mark payment as done',
        'Snooze to tomorrow',
        'Explain auto-pay terms',
      ]
    }
    if (/waiver|release|medical|camp|permission/i.test(focusedAction.title)) {
      return [
        'Help me sign the waiver',
        'Check equipment packing list',
        'Confirm emergency contacts',
        'Mark waiver as done',
      ]
    }
    if (/spirit|pto|pta|school/i.test(focusedAction.title)) {
      return [
        'Confirm spirit day attire',
        'Check school calendar',
        'Set morning reminder',
        'Mark item as done',
      ]
    }
    return [
      `Mark "${focusedAction.title}" done`,
      'Snooze for 3 hours',
      'Summarize full email',
      'Set reminder for tomorrow',
    ]
  }

  if (source === 'tonights-kitchen') {
    const plan = currentDinnerPlan || useAppStore.getState().dinnerPlan
    return getDinnerPlanSuggestions(plan)
  }

  if (!messages || messages.length === 0) {
    return buildDynamicSuggestions(page, events, now)
  }

  const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
  if (!lastAssistant) {
    return buildDynamicSuggestions(page, events, now)
  }

  const ta = lastAssistant.toolAction
  const content = (lastAssistant.content || '').toLowerCase()
  const state = lastAssistant.conversationState

  // 0. If dinner / kitchen plan or takeout in context
  if (
    content.includes("tonight's kitchen") ||
    content.includes('kitchen') ||
    content.includes('dinner') ||
    content.includes('flanigan') ||
    content.includes('takeout') ||
    content.includes('leftover') ||
    content.includes('pizza') ||
    ta?.tool === 'update_dinner_plan'
  ) {
    const plan = currentDinnerPlan || useAppStore.getState().dinnerPlan
    return getDinnerPlanSuggestions(plan)
  }

  // 1. If last action was creating / updating an event
  if (ta?.tool === 'create_event' || ta?.tool === 'update_event' || state?.activeEntityType === 'event') {
    return [
      "Who's driving?",
      "Add a 30m reminder",
      "What else is on that day?",
      "Any conflicts with this?",
    ]
  }

  // 2. If last action was grocery addition or list read
  if (
    ta?.tool === 'add_grocery_items' ||
    ta?.tool === 'check_grocery_item' ||
    state?.activeEntityType === 'grocery_item' ||
    content.includes('grocery') ||
    content.includes('shopping list')
  ) {
    return [
      "What else is on the list?",
      "Clear checked items",
      "Suggest weeknight dinner staples",
      "Add milk and eggs",
    ]
  }

  // 3. If last message was cooking / recipes
  if (
    page === 'cook' ||
    ta?.tool === 'create_recipe' ||
    content.includes('recipe') ||
    content.includes('ingredients') ||
    content.includes('dinner') ||
    content.includes('cook')
  ) {
    return [
      "Add ingredients to grocery list",
      "What can I prep ahead?",
      "Suggest a quick side dish",
      "Scale this for 6 people",
    ]
  }

  // 4. If last message was calendar rundown / queries
  if (
    content.includes('calendar') ||
    content.includes('schedule') ||
    content.includes('tomorrow') ||
    content.includes('today') ||
    content.includes('appointment')
  ) {
    return [
      "Any conflicts this weekend?",
      "What's on tomorrow?",
      "Give me a full week overview",
      "Find free time Saturday",
    ]
  }

  return buildDynamicSuggestions(page, events, now)
}

function AmbientGlanceCards({
  events,
  onPromptSelect,
}: {
  events: EventWithDetails[]
  onPromptSelect: (prompt: string) => void
}) {
  const now = new Date()
  const nowMs = now.getTime()
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).getTime()

  const nextEvent = useMemo(() => {
    return (events ?? [])
      .filter((e) => {
        if (!e.start_time) return false
        const t = new Date(e.start_time).getTime()
        return Number.isFinite(t) && t >= nowMs && t <= todayEnd
      })
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null
  }, [events, nowMs, todayEnd])

  return (
    <div className="w-full grid grid-cols-1 sm:grid-cols-2 gap-2 text-left">
      <Button
        variant="ghost"
        type="button"
        onClick={() => onPromptSelect(nextEvent ? `Prep me for "${nextEvent.title}"` : "What's on our schedule today?")}
        className="group flex items-start gap-3 p-3 min-h-[64px] rounded-2xl border border-casa-gold/35 bg-casa-bg hover:bg-white hover:border-casa-gold/60 transition-all shadow-subtle cursor-pointer text-left whitespace-normal justify-start active:scale-[0.99]"
      >
        <div className="p-2 rounded-xl bg-casa-gold/15 text-casa-gold shrink-0 group-hover:scale-105 transition-transform">
          <CalendarDays size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-bold text-casa-gold-hover uppercase tracking-wider">
            {nextEvent ? 'Next Up' : 'Schedule'}
          </p>
          <p className="text-body-sm font-semibold text-casa-navy truncate">
            {nextEvent ? nextEvent.title : 'Free for today'}
          </p>
          {nextEvent && (
            <p className="text-caption text-casa-muted font-medium">
              {format(new Date(nextEvent.start_time), 'h:mm a')}
            </p>
          )}
        </div>
      </Button>

      <Button
        variant="ghost"
        type="button"
        onClick={() => onPromptSelect('Plan a quick weeknight dinner for tonight')}
        className="group flex items-start gap-3 p-3 min-h-[64px] rounded-2xl border border-casa-gold/35 bg-casa-bg hover:bg-white hover:border-casa-gold/60 transition-all shadow-subtle cursor-pointer text-left whitespace-normal justify-start active:scale-[0.99]"
      >
        <div className="p-2 rounded-xl bg-amber-500/15 text-amber-700 shrink-0 group-hover:scale-105 transition-transform">
          <Utensils size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-bold text-amber-800 uppercase tracking-wider">Tonight's Meal</p>
          <p className="text-body-sm font-semibold text-casa-navy truncate">Dinner Plan</p>
          <p className="text-caption text-casa-muted">Pantry-friendly & fast</p>
        </div>
      </Button>
    </div>
  )
}

