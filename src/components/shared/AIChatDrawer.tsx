import { useState, useRef, useEffect, useCallback } from 'react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, Keyboard, RotateCcw } from 'lucide-react'
import { format } from 'date-fns'
import { cn } from '../../utils/cn'
import { useAIAssistant, type AIMessage } from '../../hooks/useAIAssistant'
import { useLedStrip } from '../../hooks/useLedStrip'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { FamilyMember } from '../../types'
import BounceScroll from '../shared/BounceScroll'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const CONFIRM_PHRASES = /\b(yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)\b/i
const CANCEL_PHRASES  = /\b(no|nope|cancel|don't|do not|stop|abort|never mind|nevermind|undo)\b/i
const LOW_CONFIDENCE_CONFIRM_PHRASES = /\b(yes|yeah|yep|ok|okay|use it|that one|correct|right|go ahead)\b/i
const LOW_CONFIDENCE_REJECT_PHRASES = /\b(no|nope|try again|wrong|not that|cancel)\b/i

/** DeepGram STT bridge — HTTP for probe/display, WS for streaming */
const BRIDGE    = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing'
type STTMode = 'unknown' | 'bridge' | 'webspeech'

const SILENCE_MS = 2500
const CONNECT_TIMEOUT_MS = 5000
const NO_ACTIVITY_AUTO_CLOSE_MS = 30_000

/** Quick probe — resolves true if bridge is reachable within 800ms */
async function probeBridge(): Promise<boolean> {
  try {
    const ctrl = new AbortController()
    const tid = setTimeout(() => ctrl.abort(), 800)
    const res = await fetch(`${BRIDGE}/status`, { signal: ctrl.signal })
    clearTimeout(tid)
    return res.ok
  } catch {
    return false
  }
}

function useSpeechInput({
  onInterim,
  onFinalTranscript,
  onDismiss,
  onConfirm,
  onCancel,
  hasPendingAction,
}: {
  onInterim: (text: string) => void
  onFinalTranscript: (text: string, meta?: { confidence?: number | null }) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
  hasPendingAction: boolean
}) {
  const wsRef              = useRef<WebSocket | null>(null)
  const activeRef          = useRef(false)
  const suppressRef        = useRef(false)
  const modeRef            = useRef<STTMode>('unknown')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef     = useRef<any>(null)
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInterimRef     = useRef('')
  const lastInterimTimeRef = useRef(0)
  const lastConfidenceRef  = useRef<number | null>(null)
  const connectStartRef    = useRef(0)
  const [phase, setPhase]  = useState<VoicePhase>('idle')
  const phaseRef           = useRef<VoicePhase>('idle')
  const setPhaseSync = (p: VoicePhase) => { phaseRef.current = p; setPhase(p) }
  const [volume, setVolume] = useState(0)
  const [bridgeDown, setBridgeDown] = useState(false)
  const supported = !IS_SAFE_MODE

  // ── Stable callback refs — always current, never stale inside setInterval ──
  // This is the core pattern for voice agents: the polling loop runs continuously
  // but React re-creates callbacks whenever state changes (e.g. hasPendingAction).
  // Using refs ensures the poll always calls the latest version.
  const onInterimRef       = useRef(onInterim)
  const onFinalRef         = useRef(onFinalTranscript)
  const onDismissRef       = useRef(onDismiss)
  const onConfirmRef       = useRef(onConfirm)
  const onCancelRef        = useRef(onCancel)
  const hasPendingRef      = useRef(hasPendingAction)
  useEffect(() => { onInterimRef.current  = onInterim },        [onInterim])
  useEffect(() => { onFinalRef.current    = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onDismissRef.current  = onDismiss },         [onDismiss])
  useEffect(() => { onConfirmRef.current  = onConfirm },         [onConfirm])
  useEffect(() => { onCancelRef.current   = onCancel },          [onCancel])
  useEffect(() => { hasPendingRef.current = hasPendingAction },  [hasPendingAction])

  const normalizeConfidence = useCallback((raw: unknown): number | null => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return null
    if (raw > 1 && raw <= 100) return Math.max(0, Math.min(1, raw / 100))
    return Math.max(0, Math.min(1, raw))
  }, [])

  // Stable ref — avoids recreating startWebSpeech on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null
  ).current

  const stopWS = () => {
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }
  const stopSilenceTimer = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }

  // No deps — uses only refs, so triggerFinal/startBridge are created once and never stale
  const handleFinalTranscript = useCallback((transcript: string) => {
    if (!transcript.trim()) return
    if (suppressRef.current) return
    if (DISMISS_PHRASES.test(transcript)) {
      activeRef.current = false  // prevent poll-scheduled restart from re-firing
      onDismissRef.current()
      return
    }
    const isShort = transcript.trim().split(/\s+/).length <= 5
    if (isShort && hasPendingRef.current && CONFIRM_PHRASES.test(transcript)) {
      onConfirmRef.current(); onInterimRef.current('')
      return
    }
    if (isShort && hasPendingRef.current && CANCEL_PHRASES.test(transcript)) {
      onCancelRef.current(); onInterimRef.current('')
      return
    }
    onFinalRef.current(transcript.trim(), { confidence: lastConfidenceRef.current })
    onFinalRef.current('__SEND__', { confidence: lastConfidenceRef.current })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const triggerFinal = useCallback((text: string) => {
    stopWS()
    stopSilenceTimer()
    setPhaseSync('processing')
    const finalText = text.trim() || lastInterimRef.current.trim()
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    handleFinalTranscript(finalText)
  }, [handleFinalTranscript])

  // ── Web Speech API path (Safari / iOS) ──────────────────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    // Kill any lingering instance to prevent duplicate ghost listeners
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    setPhaseSync('listening')

    const recognition = new WebSpeech()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    recognition.onresult = (event: any) => {
      let interim = ''
      let finalAccum = ''
      let finalConfidence: number | null = null
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          finalAccum += t
          finalConfidence = normalizeConfidence(event.results[i][0].confidence)
        }
        else interim += t
      }

      // Use final result immediately (authoritative — no silence timer needed)
      if (finalAccum.trim()) {
        lastConfidenceRef.current = finalConfidence
        stopSilenceTimer()
        lastInterimRef.current = ''
        onInterimRef.current(finalAccum.trim())
        try { recognition.stop() } catch { /* ignore */ }
        triggerFinal(finalAccum.trim())
        if (activeRef.current) setTimeout(() => startWebSpeech(), 300)
        return
      }

      const display = interim.trim()
      if (!display) return

      onInterimRef.current(display)
      lastInterimRef.current = display

      // Silence timer fallback for browsers that don't emit isFinal promptly
      stopSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        if (lastInterimRef.current && activeRef.current) {
          const toSend = lastInterimRef.current
          lastInterimRef.current = ''
          try { recognition.stop() } catch { /* ignore */ }
          triggerFinal(toSend)
          if (activeRef.current) setTimeout(() => startWebSpeech(), 300)
        }
      }, SILENCE_MS)
    }

    recognition.onerror = (e: any) => {
      // 'no-speech' and 'aborted' are expected — no-speech = silence, aborted = we called stop()
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.warn('[WebSpeech] error', e.error)
      if (activeRef.current) setTimeout(() => startWebSpeech(), 500)
    }

    recognition.onend = () => {
      // continuous=true can still stop on silence — restart transparently
      // Use phaseRef (not phase) to avoid stale closure
      if (activeRef.current && phaseRef.current !== 'processing') {
        setTimeout(() => startWebSpeech(), 150)
      }
    }

    recognition.start()
  }, [WebSpeech, triggerFinal, normalizeConfidence]) // all state accessed via refs

  const stopWebSpeech = useCallback(() => {
    stopSilenceTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  // ── Bridge path (Pi / Chromium) ─────────────────────────────────────────
  const startBridge = useCallback(() => {
    if (!activeRef.current) return
    stopWS()
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    connectStartRef.current = Date.now()
    setPhaseSync('connecting')

    const ws = new WebSocket(BRIDGE_WS)
    wsRef.current = ws

    ws.onopen = () => {
      setBridgeDown(false)
      ws.send(JSON.stringify({ type: 'start' }))
    }

    ws.onmessage = (evt) => {
      if (!activeRef.current) return
      try {
        const msg = JSON.parse(evt.data as string)
        switch (msg.type) {
          case 'ready':
            setPhaseSync('listening')
            connectStartRef.current = 0
            setBridgeDown(false)
            break
          case 'volume':
            setVolume(msg.level ?? 0)
            break
          case 'interim':
            if (msg.text !== lastInterimRef.current) {
              lastInterimRef.current = msg.text
              lastInterimTimeRef.current = Date.now()
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              onInterimRef.current(msg.text)
            }
            break
          case 'final':
            if (phaseRef.current !== 'processing') {
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              triggerFinal(msg.text)
              if (activeRef.current) setTimeout(() => startBridge(), 300)
            }
            break
          case 'error':
            console.warn('[STT] bridge error', msg.msg)
            if (activeRef.current) setTimeout(() => startBridge(), 500)
            break
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => {
      console.warn('[STT] WS connection error')
    }

    ws.onclose = () => {
      wsRef.current = null
      setVolume(0)
      if (connectStartRef.current > 0 && Date.now() - connectStartRef.current > CONNECT_TIMEOUT_MS) {
        console.warn('[STT] connect timeout, retrying')
        setBridgeDown(true)
      }
      if (activeRef.current && phaseRef.current !== 'processing') {
        setTimeout(() => startBridge(), 500)
      }
    }
  }, [triggerFinal, normalizeConfidence]) // onInterim/phase via refs

  const stopBridge = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch { /* ignore */ }
    }
    stopWS()
  }, [])

  // ── Unified start / stop ─────────────────────────────────────────────────
  const stop = useCallback(async () => {
    activeRef.current = false
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    lastConfidenceRef.current = null
    connectStartRef.current = 0
    setPhaseSync('idle')
    setVolume(0)
    onInterimRef.current('')
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopBridge()
  }, [stopWebSpeech, stopBridge])

  const start = useCallback(async () => {
    if (activeRef.current) return
    if (IS_SAFE_MODE) return
    activeRef.current = true
    setPhaseSync('connecting')

    // Auto-detect once per component lifetime — don't re-probe on every open
    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
      console.log(`[STT] mode: ${modeRef.current}`)
    }

    if (modeRef.current === 'webspeech') startWebSpeech()
    else startBridge()
  }, [startWebSpeech, startBridge, WebSpeech])

  const toggle = useCallback(() => {
    if (activeRef.current) stop()
    else start()
  }, [start, stop])

  // Suppress/unsuppress without stopping the mic — used during AI loading
  const suppress  = useCallback(() => { suppressRef.current = true  }, [])
  const unsuppress = useCallback(() => { suppressRef.current = false }, [])

  // Ensure mic is running — restarts WebSpeech if it naturally ended while suppressed.
  // Reads phaseRef (not state) to avoid stale closure — ensureRunning is created once.
  const ensureRunning = useCallback(() => {
    if (!activeRef.current) return  // fully stopped (drawer closed), don't restart
    if (
      modeRef.current === 'webspeech' &&
      phaseRef.current !== 'listening' &&
      phaseRef.current !== 'connecting'
    ) {
      startWebSpeech()
    }
    // Bridge stays running continuously — no action needed
  }, [startWebSpeech]) // phase read via phaseRef, no stale closure

  // Ensure bridge/webspeech resources are always torn down on component unmount.
  useEffect(() => {
    return () => {
      activeRef.current = false
      stopSilenceTimer()
      stopWebSpeech()
      stopBridge()
    }
  }, [stopWebSpeech, stopBridge])

  return {
    phase,
    volume,
    supported,
    bridgeDown,
    start,
    stop,
    toggle,
    suppress,
    unsuppress,
    ensureRunning,
    listening: phase === 'listening',
    connecting: phase === 'connecting',
  }
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
  }
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  onSleepCommand?: () => void
  focusedEvent?: EventWithDetails
}

const SLEEP_PHRASES = /\b(sleep|goodnight|good night|art mode|screen saver|screensaver|night mode)\b/i

export default function AIChatDrawer({ open, onClose, anchor, page, launchContext, events, family, homeCity, onSleepCommand, focusedEvent }: Props) {
  const [input, setInput] = useState('')
  const interimRef = useRef('')
  const idleAutoCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hadUserInteractionRef = useRef(false)
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
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

  const pendingConfirmRef = useRef<(() => Promise<boolean>) | null>(null)
  const pendingCancelRef  = useRef<(() => Promise<boolean>) | null>(null)
  const pendingLowConfidenceRef = useRef<{ transcript: string; confidence: number } | null>(null)
  // Ref to speech.stop — avoids circular dependency when calling stop inside useSpeechInput callbacks
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const speechStopRef = useRef<() => void>(() => {})
  const latestVoiceConfidenceRef = useRef<number | null>(null)
  const appliedLaunchRef = useRef<string | null>(null)
  const firedChefGreetRef = useRef<string | null>(null)

  const clearIdleAutoCloseTimer = useCallback(() => {
    if (idleAutoCloseTimerRef.current) {
      clearTimeout(idleAutoCloseTimerRef.current)
      idleAutoCloseTimerRef.current = null
    }
  }, [])

  const markUserInteraction = useCallback(() => {
    hadUserInteractionRef.current = true
    clearIdleAutoCloseTimer()
  }, [clearIdleAutoCloseTimer])

  // True when the latest assistant message has a pending tool action awaiting confirmation
  const hasPendingToolAction = messages.some(m => m.toolAction?.status === 'pending')

  const sendCurrentInput = useCallback((text: string, opts?: { fromVoice?: boolean; confidence?: number | null }) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
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
        if (textareaRef.current) textareaRef.current.value = ''
        send(pending.transcript)
        return
      }
      if (LOW_CONFIDENCE_REJECT_PHRASES.test(trimmed)) {
        pendingLowConfidenceRef.current = null
        setInput('')
        interimRef.current = ''
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
      send(trimmed)
      setTimeout(() => {
        setInput('')
        interimRef.current = ''
        if (textareaRef.current) textareaRef.current.value = ''
      }, 800)
    } else {
      setInput('')
      interimRef.current = ''
      if (textareaRef.current) textareaRef.current.value = ''
      send(trimmed)
    }
  }, [loading, send, appendSyntheticMessage])

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
    await send(prompt)
  }, [loading, markUserInteraction, send])

  const speech = useSpeechInput({
    onInterim: (interim) => {
      if (interim.trim()) markUserInteraction()
      interimRef.current = interim
      setInput(interim)
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
        // Stop mic after each voice-submitted message — user must tap mic to speak again
        speechStopRef.current()
      } else {
        if (text.trim()) markUserInteraction()
        interimRef.current = text
        setInput(text)
      }
    },
    onDismiss: () => {
      markUserInteraction()
      // Verbal goodbye — clear session immediately so next open starts fresh
      startFresh()
      setTimeout(onClose, 400)
    },
    onConfirm: () => {
      markUserInteraction()
      led.confirm()
      const run = pendingConfirmRef.current
      if (!run) return
      void Promise.resolve(run()).then((confirmed) => {
        if (!confirmed) return
        startFresh()
        setTimeout(onClose, 350)
      })
    },
    onCancel:  () => {
      markUserInteraction()
      led.cancel()
      const run = pendingCancelRef.current
      if (!run) return
      void Promise.resolve(run()).then((cancelled) => {
        if (!cancelled) return
        startFresh()
        setTimeout(onClose, 350)
      })
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
      clearIdleAutoCloseTimer()
      idleAutoCloseTimerRef.current = setTimeout(() => {
        if (!hadUserInteractionRef.current) {
          startFresh()
          onClose()
        }
      }, NO_ACTIVITY_AUTO_CLOSE_MS)
      if (IS_SAFE_MODE) return
      // Only auto-start mic when opened by wake word — otherwise user taps the mic button.
      if (launchContext?.source === 'wake_word') {
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
      pendingLowConfidenceRef.current = null
      latestVoiceConfidenceRef.current = null
      setAttachedImage(null)
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
    send(text || '(see attached image)', img ?? undefined)
  }, [input, attachedImage, loading, send, markUserInteraction])

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
    setInput(value)
  }, [markUserInteraction, speech.connecting, speech.listening, speech.stop])

  const handleKeyboardToggle = useCallback(() => {
    markUserInteraction()
    document.dispatchEvent(new CustomEvent('touch-keyboard:control', {
      detail: {
        target: textareaRef.current,
        toggle: true,
      },
    }))
  }, [markUserInteraction])

  const hasSession = !sessionLoading && !!session && session.messages.length > 0
  const voiceLevel = Math.max(0, Math.min(1, speech.volume / 100))
  const isVoiceActive = speech.listening && voiceLevel > 0.12
  const hasTypedInput = input.trim().length > 0 && !loading && !speech.listening
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
            className="fixed inset-0 z-[65] max-sm:bg-black/40 sm:bg-transparent"
            onClick={onClose}
          />

          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className={cn(
              'fixed z-[70] bg-casa-surface flex flex-col transition-shadow',
              'max-sm:inset-x-0 max-sm:bottom-0 max-sm:rounded-t-2xl max-sm:w-full max-sm:shadow-modal',
              'sm:rounded-2xl sm:w-[760px] sm:shadow-[0_8px_40px_rgba(0,0,0,0.22)] sm:border sm:border-casa-border',
              loading && 'ai-thinking',
            )}
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
                {hasSession && (
                  <button
                    type="button"
                    onClick={startFresh}
                    title="New conversation"
                    className="w-7 h-7 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
                  >
                    <RotateCcw size={14} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Messages */}
            <BounceScroll className="flex-1 min-h-0" innerClassName="px-4 py-4 space-y-3">
              {/* Session resume banner */}
              {hasSession && messages.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-casa-gold/8 border border-casa-gold/20 text-caption text-casa-muted">
                  <Sparkles size={11} className="text-casa-gold flex-shrink-0" />
                  <span>Resuming previous conversation</span>
                  <button
                    type="button"
                    onClick={startFresh}
                    className="ml-auto text-casa-gold font-semibold hover:underline"
                  >
                    New chat
                  </button>
                </div>
              )}

              {messages.length === 0 && (
                <div className="flex flex-col items-center gap-3 py-6 text-center">
                  <Sparkles size={28} className="text-casa-gold opacity-60" />
                  <p className="text-body-sm font-semibold text-casa-navy">What can I help with?</p>
                  <div className="flex flex-wrap justify-center gap-2 mt-1">
                    {SUGGESTIONS[page]?.map(s => (
                      <button
                        key={s}
                        onClick={() => { markUserInteraction(); setInput(s); textareaRef.current?.focus() }}
                        className="px-3 py-1.5 rounded-full border border-casa-border text-caption text-casa-muted hover:bg-casa-bg hover:text-casa-navy transition-colors"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg, idx) => (
                <MessageBubble
                  key={msg.id}
                  msg={msg}
                  isLatest={idx === messages.length - 1}
                  enableQuickSaveRecipe={page === 'cook' || launchContext?.agent === 'chef'}
                  onQuickSaveRecipe={quickSaveRecipeSuggestion}
                  onConfirmToolAction={async (messageId, tool, args) => {
                    updateMessageToolStatus(messageId, 'loading')
                    try {
                      const matchedEvent = tool === 'update_event'
                        ? events.find((event) => event.id === String(args.id ?? ''))
                        : undefined
                      const requestArgs = tool === 'update_event' && matchedEvent && args.expected_updated_at === undefined
                        ? { ...args, expected_updated_at: matchedEvent.updated_at }
                        : args
                      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
                        body: {
                          tool,
                          args: requestArgs,
                          action_id: messageId,
                          session_id: session?.id ?? null,
                          correlation_id: buildCorrelationId(messageId),
                        },
                      })
                      if (error) throw error
                      if (data?.success === false) throw new Error(data.error ?? 'Action failed')
                      updateMessageToolStatus(messageId, 'done', {
                        actionId: data?.action_id,
                        resultEventId: data?.event_id,
                        syncWarning: data?.sync_warning,
                        syncStatus: data?.sync_status === 'queued' ? 'queued' : data?.sync_status === 'failed' ? 'failed' : 'synced',
                        undoStatus: 'idle',
                        undoErrorMsg: undefined,
                      })
                      qc.invalidateQueries({ queryKey: ['events'] })
                      qc.invalidateQueries({ queryKey: ['grocery'] })
                      return true
                    } catch (err) {
                      updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
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
                  onCancelToolAction={(messageId) => updateMessageToolStatus(messageId, 'cancelled')}
                  onRefreshToolAction={() => {
                    qc.invalidateQueries({ queryKey: ['events'] })
                  }}
                  registerPendingConfirm={(fn) => { pendingConfirmRef.current = fn }}
                  registerPendingCancel={(fn)  => { pendingCancelRef.current  = fn }}
                />
              ))}

              {loading && (
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
                      <button
                        type="button"
                        onClick={() => setAttachedImage(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-casa-error text-white flex items-center justify-center shadow"
                      >
                        <X size={10} />
                      </button>
                      <div className="absolute bottom-1 left-1 flex items-center gap-1 bg-black/50 rounded px-1 py-0.5">
                        <ImageIcon size={9} className="text-white" />
                        <span className="text-[9px] text-white font-medium">Image attached</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div
                className={cn(
                  'ai-presence-composer relative overflow-hidden flex items-end gap-2 bg-casa-bg rounded-xl border border-casa-border px-3 py-2 transition-all duration-300',
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

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  title="Attach image from library"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Paperclip size={16} />
                </button>

                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  title="Take a photo"
                  className="text-casa-muted hover:text-casa-gold transition-colors shrink-0 pb-1"
                >
                  <Camera size={16} />
                </button>

                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={e => handleInputChange(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={speech.listening ? 'Listening… speak now' : attachedImage ? 'Ask about this image…' : "Ask anything or say 'add an event…'"}
                  rows={1}
                  className="flex-1 bg-transparent text-body text-casa-navy placeholder:text-casa-muted outline-none resize-none leading-relaxed"
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />

                {speech.supported && (
                  <button
                    type="button"
                    onClick={() => { markUserInteraction(); speech.toggle() }}
                    title={speech.listening ? 'Stop listening' : speech.connecting ? 'Connecting…' : 'Start voice input'}
                    className={cn(
                      'w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5',
                      speech.listening
                        ? 'bg-casa-navy text-casa-gold animate-pulse'
                        : speech.connecting
                          ? 'bg-casa-navy/60 text-casa-gold/60'
                          : 'bg-casa-divider text-casa-muted hover:text-casa-gold'
                    )}
                  >
                    {speech.connecting
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Mic size={14} />}
                  </button>
                )}

                <button
                  type="button"
                  onClick={handleKeyboardToggle}
                  title="Toggle on-screen keyboard"
                  className="w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5 bg-casa-divider text-casa-muted hover:text-casa-gold"
                >
                  <Keyboard size={14} />
                </button>

                <button
                  type="button"
                  onClick={handleSend}
                  disabled={(!input.trim() && !attachedImage) || loading}
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center transition-all shrink-0 mb-0.5',
                    (input.trim() || attachedImage) && !loading
                      ? 'bg-casa-gold text-white hover:brightness-110'
                      : 'bg-casa-divider text-casa-muted'
                  )}
                >
                  <Send size={14} />
                </button>
              </div>
              <p className="text-caption text-casa-muted mt-1.5 text-center opacity-60">
                {IS_SAFE_MODE
                  ? 'Safe mode enabled: voice capture is disabled'
                  : speech.bridgeDown
                    ? 'Voice bridge offline — text input still works'
                    : speech.supported
                  ? speech.connecting
                    ? 'Connecting to mic…'
                    : speech.listening
                      ? 'Listening — pause to send · say "goodbye" to close'
                      : hasTypedInput
                        ? 'Typing mode active — voice paused'
                      : 'Tap 🎙 to start voice · pause to send'
                  : 'Tap ➤ to send · 📎 gallery · 📷 camera'}
              </p>


            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

/* ── Message Bubble ─────────────────────────────────────────── */

function MessageBubble({ msg, isLatest, enableQuickSaveRecipe, onQuickSaveRecipe, onConfirmToolAction, onUndoToolAction, onCancelToolAction, onRefreshToolAction, registerPendingConfirm, registerPendingCancel }: {
  msg: AIMessage
  isLatest: boolean
  enableQuickSaveRecipe?: boolean
  onQuickSaveRecipe?: (recipeMessage: string) => Promise<void>
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<boolean>
  onUndoToolAction: (messageId: string, actionId: string) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  onRefreshToolAction: () => void
  registerPendingConfirm: (fn: () => Promise<boolean>) => void
  registerPendingCancel:  (fn: () => Promise<boolean>) => void
}) {
  const isUser = msg.role === 'user'
  const ta = msg.toolAction
  const [quickSaving, setQuickSaving] = useState(false)
  const hasPendingAction = !!ta && ta.status === 'pending'
  const showQuickSaveRecipe = !isUser && !ta && Boolean(onQuickSaveRecipe) && Boolean(enableQuickSaveRecipe) && looksLikeRecipeSuggestion(msg.content)
  const isStaleError = !!ta?.errorMsg && ta.errorMsg.toLowerCase().includes('changed since')
  const isDestructiveAction =
    ta?.tool === 'delete_event' ||
    ta?.tool === 'delete_events_by_title' ||
    ta?.tool === 'clear_checked_grocery_items'

  const doConfirm = useCallback(async () => {
    if (!ta) return false
    return onConfirmToolAction(msg.id, ta.tool, ta.args)
  }, [msg.id, ta, onConfirmToolAction])

  const doCancel = useCallback(async () => {
    onCancelToolAction(msg.id)
    return true
  }, [msg.id, onCancelToolAction])

  useEffect(() => {
    if (isLatest && hasPendingAction) {
      registerPendingConfirm(doConfirm)
      registerPendingCancel(doCancel)
    }
  }, [isLatest, hasPendingAction, doConfirm, doCancel]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className={cn('flex', isUser ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[85%] rounded-2xl px-4 py-2.5 text-body-sm leading-relaxed',
        isUser
          ? 'bg-casa-navy text-white rounded-br-sm'
          : 'bg-casa-bg border border-casa-border text-casa-navy rounded-bl-sm'
      )}>
        {msg.imageDataUrl && (
          <img src={msg.imageDataUrl} alt="Attached" className="max-h-40 w-auto rounded-lg mb-2 object-cover" />
        )}
        {msg.content !== '(see attached image)' && msg.content && (
          isUser
            ? <p className="whitespace-pre-wrap">{msg.content}</p>
            : <MarkdownMessage content={msg.content} />
        )}
        {showQuickSaveRecipe && (
          <div className="mt-2">
            <button
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
            </button>
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
                    : 'Done ✓'}
                </div>
                {ta.tool === 'create_event' && ta.resultEventId && (
                  <p className="text-caption text-casa-muted">Visible on your calendar now</p>
                )}
                {ta.tool === 'create_recipe' && (
                  <p className="text-caption text-casa-muted">Visible in Cook → Recipe library now</p>
                )}
                {ta.syncWarning && (
                  <p className="text-caption text-amber-600">{ta.syncWarning}</p>
                )}
                {ta.tool === 'update_event' && (
                  <SyncStatusPill status={ta.syncStatus ?? (ta.syncWarning ? 'queued' : 'synced')} />
                )}
                {ta.tool === 'update_event' && ta.actionId && ta.undoStatus !== 'done' && (
                  <div className="pt-1 space-y-1">
                    <button
                      type="button"
                      onClick={() => onUndoToolAction(msg.id, ta.actionId!)}
                      disabled={ta.undoStatus === 'loading'}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-casa-navy text-caption font-semibold hover:bg-casa-bg transition-all disabled:opacity-60"
                    >
                      {ta.undoStatus === 'loading' ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
                      Undo this edit
                    </button>
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
                  <button
                    type="button"
                    onClick={doConfirm}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button bg-red-600 text-white text-caption font-semibold hover:brightness-110 transition-all"
                  >
                    <Loader2 size={12} /> Retry
                  </button>
                  {isStaleError && (
                    <button
                      type="button"
                      onClick={onRefreshToolAction}
                      className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-casa-navy text-caption font-semibold hover:bg-casa-bg transition-all"
                    >
                      Refresh event
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <>
                <ToolActionPreview tool={ta.tool} args={ta.args} />
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    disabled={ta.status === 'loading'}
                    onClick={doConfirm}
                    className={cn(
                      'flex items-center gap-1.5 px-3 py-1 rounded-button text-caption font-semibold transition-all disabled:opacity-50',
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
                        : 'Confirm'}
                  </button>
                  <button
                    type="button"
                    onClick={doCancel}
                    className="flex items-center gap-1.5 px-3 py-1 rounded-button border border-casa-border text-caption text-casa-muted hover:bg-casa-divider transition-colors"
                  >
                    <XCircle size={12} /> Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function renderInlineMarkdown(text: string, keyPrefix: string): React.ReactNode[] {
  const tokenRegex = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\((https?:\/\/[^)\s]+)\))/g
  const nodes: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  let tokenIndex = 0

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(<strong key={`${keyPrefix}-b-${tokenIndex}`}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(
        <code key={`${keyPrefix}-c-${tokenIndex}`} className="px-1 py-0.5 rounded bg-casa-surface border border-casa-border text-[0.85em]">
          {token.slice(1, -1)}
        </code>,
      )
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/)
      if (linkMatch) {
        nodes.push(
          <a
            key={`${keyPrefix}-a-${tokenIndex}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noreferrer"
            className="text-casa-gold underline underline-offset-2"
          >
            {linkMatch[1]}
          </a>,
        )
      } else {
        nodes.push(token)
      }
    }
    lastIndex = tokenRegex.lastIndex
    tokenIndex += 1
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex))
  }
  return nodes
}

function splitMarkdownTableRow(line: string): string[] {
  const cleaned = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return cleaned.split('|').map((cell) => cell.trim())
}

function looksLikeRecipeSuggestion(text: string): boolean {
  const normalized = text.toLowerCase()
  const hasIngredients = /\bingredients?\b/.test(normalized)
  const hasSteps = /\b(steps?|instructions?|directions?|method)\b/.test(normalized)
  const hasListLikeContent = /(^|\n)\s*(?:[-*]\s+|\d+\.\s+)/m.test(text)
  return hasIngredients && hasSteps && hasListLikeContent
}

function isMarkdownTableSeparator(line: string, columns: number): boolean {
  const cells = splitMarkdownTableRow(line)
  if (cells.length !== columns || columns < 2) return false
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function MarkdownMessage({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').trim().split('\n')
  const blocks: React.ReactNode[] = []
  let i = 0
  let paragraphBuffer: string[] = []

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) return
    const text = paragraphBuffer.join(' ').trim()
    if (text) {
      blocks.push(
        <p key={`p-${blocks.length}`} className="whitespace-pre-wrap">
          {renderInlineMarkdown(text, `p-${blocks.length}`)}
        </p>,
      )
    }
    paragraphBuffer = []
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()
    if (trimmed.length === 0) {
      flushParagraph()
      i += 1
      continue
    }

    if (trimmed.startsWith('```')) {
      flushParagraph()
      i += 1
      const codeLines: string[] = []
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length) i += 1
      blocks.push(
        <pre key={`code-${blocks.length}`} className="rounded-lg border border-casa-border bg-casa-surface px-3 py-2 overflow-x-auto text-[12px] leading-relaxed">
          <code>{codeLines.join('\n')}</code>
        </pre>,
      )
      continue
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      blocks.push(
        <p key={`h-${blocks.length}`} className="font-semibold text-casa-navy">
          {renderInlineMarkdown(headingMatch[2], `h-${blocks.length}`)}
        </p>,
      )
      i += 1
      continue
    }

    if (trimmed.includes('|') && i + 1 < lines.length) {
      const headerCells = splitMarkdownTableRow(lines[i])
      if (isMarkdownTableSeparator(lines[i + 1] ?? '', headerCells.length)) {
        flushParagraph()
        const rows: string[][] = []
        i += 2
        while (i < lines.length) {
          const rowLine = lines[i].trim()
          if (!rowLine || !rowLine.includes('|')) break
          const rowCells = splitMarkdownTableRow(lines[i])
          if (rowCells.length !== headerCells.length) break
          rows.push(rowCells)
          i += 1
        }
        blocks.push(
          <div key={`table-${blocks.length}`} className="overflow-x-auto">
            <table className="min-w-full border border-casa-border rounded-lg bg-casa-surface text-caption">
              <thead className="bg-casa-bg">
                <tr>
                  {headerCells.map((cell, idx) => (
                    <th key={`th-${idx}`} className="px-2 py-1 text-left border-b border-casa-border font-semibold text-casa-navy">
                      {renderInlineMarkdown(cell, `th-${blocks.length}-${idx}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIdx) => (
                  <tr key={`tr-${rowIdx}`} className="border-b last:border-b-0 border-casa-border">
                    {row.map((cell, cellIdx) => (
                      <td key={`td-${rowIdx}-${cellIdx}`} className="px-2 py-1 align-top">
                        {renderInlineMarkdown(cell, `td-${blocks.length}-${rowIdx}-${cellIdx}`)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>,
        )
        continue
      }
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*]\s+/, ''))
        i += 1
      }
      blocks.push(
        <ul key={`ul-${blocks.length}`} className="list-disc pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={`ul-${blocks.length}-${idx}`}>{renderInlineMarkdown(item, `ul-${blocks.length}-${idx}`)}</li>
          ))}
        </ul>,
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const items: string[] = []
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i += 1
      }
      blocks.push(
        <ol key={`ol-${blocks.length}`} className="list-decimal pl-5 space-y-1">
          {items.map((item, idx) => (
            <li key={`ol-${blocks.length}-${idx}`}>{renderInlineMarkdown(item, `ol-${blocks.length}-${idx}`)}</li>
          ))}
        </ol>,
      )
      continue
    }

    paragraphBuffer.push(trimmed)
    i += 1
  }

  flushParagraph()
  return <div className="space-y-2">{blocks}</div>
}

function ToolActionPreview({ tool, args }: { tool: string; args: Record<string, unknown> }) {
  const [expanded, setExpanded] = useState(false)

  if (tool === 'create_event') {
    const start = new Date(args.start as string)
    const end = new Date(args.end as string)
    return (
      <div className="space-y-1 text-caption text-casa-muted">
        <p className="font-semibold text-casa-navy text-body-sm">{args.title as string}</p>
        <p>{format(start, 'EEE, MMM d · h:mm a')} – {format(end, 'h:mm a')}</p>
        {!!args.location && <p>📍 {String(args.location)}</p>}
        {(args.members as string[])?.length > 0 && <p>👤 {(args.members as string[]).join(', ')}</p>}
      </div>
    )
  }
  if (tool === 'update_event') {
    const changes = summarizeUpdateArgs(args)
    const MAX_VISIBLE = 6
    const visibleChanges = expanded ? changes : changes.slice(0, MAX_VISIBLE)
    return (
      <div className="space-y-2">
        <p className="text-caption font-semibold text-casa-navy">
          Applying {changes.length} change{changes.length === 1 ? '' : 's'}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {visibleChanges.map((change) => (
            <span
              key={change}
              className="inline-flex items-center rounded-full bg-casa-surface border border-casa-border px-2 py-0.5 text-[11px] text-casa-muted"
            >
              {change}
            </span>
          ))}
        </div>
        {changes.length > MAX_VISIBLE && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="text-[11px] font-semibold text-casa-gold hover:underline"
          >
            {expanded ? 'Show less' : `Show ${changes.length - MAX_VISIBLE} more`}
          </button>
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
        <p className="text-caption font-semibold text-casa-navy">
          Update {count} matching event{count === 1 ? '' : 's'}{titleQuery ? ` for "${titleQuery}"` : ''}
        </p>
        {changes.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {changes.slice(0, 8).map((change) => (
              <span
                key={change}
                className="inline-flex items-center rounded-full bg-casa-surface border border-casa-border px-2 py-0.5 text-[11px] text-casa-muted"
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
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
        <p className="text-caption text-red-700 font-semibold">Delete this event permanently?</p>
        <p className="text-caption text-red-600 mt-0.5">"{args.title as string}" will be removed from your calendar and synced deletion will follow.</p>
      </div>
    )
  }
  if (tool === 'delete_events_by_title') {
    const titleQuery = String(args.title_query ?? '').trim()
    const count = Number.isFinite(Number(args.count))
      ? Number(args.count)
      : (Array.isArray(args.ids) ? args.ids.length : 0)
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
        <p className="text-caption text-red-700 font-semibold">Delete all matching events?</p>
        <p className="text-caption text-red-600 mt-0.5">
          {count} event{count === 1 ? '' : 's'} matching "{titleQuery || 'selected title'}" will be removed and synced deletion will follow.
        </p>
      </div>
    )
  }
  if (tool === 'add_grocery_items') {
    const items = args.items as { name: string; quantity?: string }[]
    return (
      <div className="space-y-0.5 text-caption text-casa-muted">
        {items.map((i, idx) => (
          <p key={idx}>+ {i.name}{i.quantity ? ` (${i.quantity})` : ''}</p>
        ))}
      </div>
    )
  }
  if (tool === 'create_recipe') {
    const ingredients = Array.isArray(args.ingredients) ? args.ingredients : []
    const steps = Array.isArray(args.steps) ? args.steps : []
    return (
      <div className="space-y-1 text-caption text-casa-muted">
        <p className="font-semibold text-casa-navy text-body-sm">{String(args.name ?? 'Untitled recipe')}</p>
        <p>{ingredients.length} ingredient{ingredients.length === 1 ? '' : 's'} · {steps.length} step{steps.length === 1 ? '' : 's'}</p>
        {typeof args.cook_time === 'string' && args.cook_time.trim().length > 0 && <p>⏱ {args.cook_time}</p>}
        {typeof args.servings === 'string' && args.servings.trim().length > 0 && <p>🍽 {args.servings}</p>}
      </div>
    )
  }
  if (tool === 'check_grocery_item') {
    return <p className="text-caption text-casa-muted">Mark item as {args.checked ? 'done ✓' : 'undone'}</p>
  }
  if (tool === 'clear_checked_grocery_items') {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2">
        <p className="text-caption text-amber-800 font-semibold">Clear all checked grocery items?</p>
        <p className="text-caption text-amber-700 mt-0.5">This removes completed items from the list.</p>
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
    <span className={cn('inline-flex mt-1 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold', tone)}>
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

const SUGGESTIONS: Record<string, string[]> = {
  home: ["What's next up today?", "Add an event tonight", "Any conflicts this week?"],
  calendar: ["What does tomorrow look like?", "Add a new appointment", "Who's busiest this week?"],
  briefing: ["Summarize today for me", "Add an event", "Any prep needed today?"],
  grocery: ["Add milk and eggs", "What's on the list?", "Clear checked items"],
  cook: ["Plan 4 quick weeknight dinners", "Optimize my meals for budget", "Build grocery list from the plan"],
  app: ["What's next up today?", "Add an event tonight", "What's on the grocery list?"],
}
