import { useState, useRef, useEffect, useCallback } from 'react'
import type React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Send, Sparkles, Check, XCircle, Loader2, Paperclip, Image as ImageIcon, Camera, Mic, RotateCcw } from 'lucide-react'
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

/** DeepGram STT bridge — HTTP for probe/display, WS for streaming */
const BRIDGE    = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'

type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing'
type STTMode = 'unknown' | 'bridge' | 'webspeech'

const SILENCE_MS = 1500
const CONNECT_TIMEOUT_MS = 5000

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
  onFinalTranscript: (text: string) => void
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
  const connectStartRef    = useRef(0)
  const [phase, setPhase]  = useState<VoicePhase>('idle')
  const phaseRef           = useRef<VoicePhase>('idle')
  const setPhaseSync = (p: VoicePhase) => { phaseRef.current = p; setPhase(p) }
  const [volume, setVolume] = useState(0)
  const supported = true

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
    onFinalRef.current(transcript.trim()); onFinalRef.current('__SEND__')
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
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalAccum += t
        else interim += t
      }

      // Use final result immediately (authoritative — no silence timer needed)
      if (finalAccum.trim()) {
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
  }, [WebSpeech, triggerFinal]) // all state accessed via refs

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
            break
          case 'volume':
            setVolume(msg.level ?? 0)
            break
          case 'interim':
            if (msg.text !== lastInterimRef.current) {
              lastInterimRef.current = msg.text
              lastInterimTimeRef.current = Date.now()
              onInterimRef.current(msg.text)
            }
            break
          case 'final':
            if (phaseRef.current !== 'processing') {
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
      }
      if (activeRef.current && phaseRef.current !== 'processing') {
        setTimeout(() => startBridge(), 500)
      }
    }
  }, [triggerFinal]) // onInterim/phase via refs

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
    connectStartRef.current = 0
    setPhaseSync('idle')
    setVolume(0)
    onInterimRef.current('')
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopBridge()
  }, [stopWebSpeech, stopBridge])

  const start = useCallback(async () => {
    if (activeRef.current) return
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

  return { phase, volume, supported, start, stop, toggle, suppress, unsuppress, ensureRunning, listening: phase === 'listening', connecting: phase === 'connecting' }
}



interface Props {
  open: boolean
  onClose: () => void
  anchor?: { right: number; top: number }
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  onSleepCommand?: () => void
  focusedEvent?: EventWithDetails
}

const SLEEP_PHRASES = /\b(sleep|goodnight|good night|art mode|screen saver|screensaver|night mode)\b/i

export default function AIChatDrawer({ open, onClose, anchor, page, events, family, homeCity, onSleepCommand, focusedEvent }: Props) {
  const [input, setInput] = useState('')
  const interimRef = useRef('')
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { messages, loading, send, reset, session, sessionLoading, startFresh, primeMessages, updateMessageToolStatus } = useAIAssistant({ page, events, family, homeCity, focusedEvent, onSessionEnd: onClose })

  const led = useLedStrip()

  const pendingConfirmRef = useRef<(() => void) | null>(null)
  const pendingCancelRef  = useRef<(() => void) | null>(null)

  // True when the latest assistant message has a pending tool action awaiting confirmation
  const hasPendingToolAction = messages.some(m => m.toolAction?.status === 'pending')

  const sendCurrentInput = useCallback((text: string) => {
    const trimmed = text.trim()
    if (!trimmed || loading) return
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    send(trimmed)
  }, [loading, send])

  const speech = useSpeechInput({
    onInterim: (interim) => {
      interimRef.current = interim
      setInput(interim)
    },
    onFinalTranscript: (text) => {
      if (text === '__SEND__') {
        const msg = interimRef.current || (textareaRef.current?.value ?? '')
        // Check for sleep command before sending to AI
        if (SLEEP_PHRASES.test(msg)) {
          onSleepCommand?.()
          setTimeout(onClose, 300)
          return
        }
        sendCurrentInput(msg)
        interimRef.current = ''
      } else {
        interimRef.current = text
        setInput(text)
      }
    },
    onDismiss: () => {
      // Verbal goodbye — clear session immediately so next open starts fresh
      startFresh()
      setTimeout(onClose, 400)
    },
    onConfirm: () => { led.confirm(); pendingConfirmRef.current?.() },
    onCancel:  () => { led.cancel();  pendingCancelRef.current?.()  },
    hasPendingAction: hasPendingToolAction,
  })

  useEffect(() => {
    if (open) {
      // Start connecting immediately — don't wait for animation.
      // Bridge buffers audio from /start so by the time the user speaks it's ready.
      speech.start()
      // Focus textarea slightly after animation settles (UI only, doesn't affect mic)
      setTimeout(() => textareaRef.current?.focus(), 300)
    } else {
      speech.stop()
      led.off()
      reset()
      setInput('')
      interimRef.current = ''
      setAttachedImage(null)
      freshStartedRef.current = null  // allow fresh start next time this event is opened
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // LED state machine — loading takes priority over speech phase
  useEffect(() => {
    if (!open) {
      led.off()
      return
    }
    if (loading) {
      led.processing()      // amber while AI is thinking
    } else if (speech.phase === 'listening' || speech.phase === 'connecting') {
      led.listening()       // blue when mic is active
    }
    // Otherwise (idle gap between thinking and listening) — leave as-is so
    // we don't flicker to off. Will get corrected on next phase change.
  }, [loading, speech.phase, open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [input])

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
      if (blob) setAttachedImage(await readImageFile(blob))
    }
  }, [readImageFile])

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file && file.type.startsWith('image/')) {
      setAttachedImage(await readImageFile(file))
    }
    e.target.value = ''
  }, [readImageFile])

  const handleSend = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation()
    const text = (textareaRef.current?.value ?? input).trim()
    const img = attachedImage
    if ((!text && !img) || loading) return
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    setAttachedImage(null)
    send(text || '(see attached image)', img ?? undefined)
  }, [input, attachedImage, loading, send])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const hasSession = !sessionLoading && !!session && session.messages.length > 0

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
                        onClick={() => { setInput(s); textareaRef.current?.focus() }}
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
                        body: { tool, args: requestArgs, action_id: messageId, session_id: session?.id ?? null },
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
                    } catch (err) {
                      updateMessageToolStatus(messageId, 'error', { errorMsg: (err as Error).message })
                    }
                  }}
                  onUndoToolAction={async (messageId, actionId) => {
                    updateMessageToolStatus(messageId, 'done', { undoStatus: 'loading', undoErrorMsg: undefined })
                    try {
                      const { data, error } = await supabase.functions.invoke('execute-ai-action', {
                        body: { tool: 'undo_event_edit', args: { action_id: actionId }, action_id: `${messageId}:undo`, session_id: session?.id ?? null },
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

              <div className="flex items-end gap-2 bg-casa-bg rounded-xl border border-casa-border px-3 py-2">
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
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder={speech.listening ? 'Listening… speak now' : attachedImage ? 'Ask about this image…' : "Ask anything or say 'add an event…'"}
                  rows={1}
                  className="flex-1 bg-transparent text-body text-casa-navy placeholder:text-casa-muted outline-none resize-none leading-relaxed"
                  style={{ minHeight: '24px', maxHeight: '120px' }}
                />

                {speech.supported && (
                  <button
                    type="button"
                    onClick={speech.toggle}
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
                {speech.supported
                  ? speech.connecting
                    ? 'Connecting to mic…'
                    : speech.listening
                      ? 'Listening — pause to send · say "goodbye" to close'
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

function MessageBubble({ msg, isLatest, onConfirmToolAction, onUndoToolAction, onCancelToolAction, onRefreshToolAction, registerPendingConfirm, registerPendingCancel }: {
  msg: AIMessage
  isLatest: boolean
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<void>
  onUndoToolAction: (messageId: string, actionId: string) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  onRefreshToolAction: () => void
  registerPendingConfirm: (fn: () => void) => void
  registerPendingCancel:  (fn: () => void) => void
}) {
  const isUser = msg.role === 'user'
  const ta = msg.toolAction
  const hasPendingAction = !!ta && ta.status === 'pending'
  const isStaleError = !!ta?.errorMsg && ta.errorMsg.toLowerCase().includes('changed since')
  const isDestructiveAction = ta?.tool === 'delete_event' || ta?.tool === 'clear_checked_grocery_items'

  const doConfirm = useCallback(() => {
    if (!ta) return
    onConfirmToolAction(msg.id, ta.tool, ta.args)
  }, [msg.id, ta, onConfirmToolAction])

  const doCancel = useCallback(() => {
    onCancelToolAction(msg.id)
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
          <p dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        )}

        {/* Tool action confirmation card */}
        {ta && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {ta.status === 'done' ? (
              <div className="space-y-1">
                <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                  <Check size={13} />
                  {ta.tool === 'create_event' ? 'Created & added to calendar ✓'
                    : ta.tool === 'update_event' ? 'Updated ✓'
                    : ta.tool === 'delete_event' ? 'Deleted ✓'
                    : ta.tool === 'add_grocery_items' ? 'Added to grocery list ✓'
                    : 'Done ✓'}
                </div>
                {ta.tool === 'create_event' && ta.resultEventId && (
                  <p className="text-caption text-casa-muted">Visible on your calendar now</p>
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
  if (tool === 'delete_event') {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 px-2.5 py-2">
        <p className="text-caption text-red-700 font-semibold">Delete this event permanently?</p>
        <p className="text-caption text-red-600 mt-0.5">"{args.title as string}" will be removed from your calendar and synced deletion will follow.</p>
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
}
