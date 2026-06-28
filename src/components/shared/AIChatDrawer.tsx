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
import {
  readVoiceRuntimeConfig,
  shouldEmitVoiceDebug,
  type VoiceDebugLevel,
  type VoiceRuntimeConfig,
  writeVoiceRuntimeConfig,
} from '../../lib/voiceRuntimeConfig'
import { appendVoiceAudit, clearVoiceAudit, readVoiceAudit, type VoiceAuditEvent } from '../../lib/voiceAudit'
import { enqueueRemoteVoiceTrace } from '../../lib/remoteVoiceTrace'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const STRONG_CONFIRM_PHRASES = new Set([
  'yes',
  'yeah',
  'yep',
  'confirm',
  'ok',
  'okay',
  'go ahead',
  'do it',
  'sounds good',
  'correct',
  'right',
  'affirmative',
  'absolutely',
  'sure',
  'proceed',
])
const STRONG_CANCEL_PHRASES = new Set([
  'cancel',
  'do not',
  "don't",
  'abort',
  'never mind',
  'nevermind',
  'undo',
  'stop',
])

/** DeepGram STT bridge — HTTP for probe/display, WS for streaming */
const BRIDGE    = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing'
type STTMode = 'unknown' | 'bridge' | 'webspeech'
type WebSpeechResult = { isFinal: boolean; 0: { transcript: string } }
type WebSpeechResultEvent = { resultIndex: number; results: ArrayLike<WebSpeechResult> }
type WebSpeechErrorEvent = { error?: string }

const SILENCE_MS = 1500
const CONNECT_TIMEOUT_MS = 5000
const NO_ACTIVITY_AUTO_CLOSE_MS = 30_000
const WAKE_FOLLOWUP_GRACE_MS = 4500
const WAKE_MISFIRE_COOLDOWN_SECS = 6
const TRANSCRIPT_SETTLE_BEFORE_SEND_MS = 250
const FEEDBACK_LOCK_MS = 2800
const MIN_FINAL_CONFIDENCE = 0.55
const VOICE_TELEMETRY_KEY = 'casa-voice-telemetry'
const AI_DEBUG_LOG_KEY = 'casa-ai-debug-log'
const VOICE_DEBUG_DEVICE_ID_KEY = 'casa-voice-debug-device-id'
const MAX_DEBUG_LOG_ENTRIES = 500
const MAX_AUDIT_LOG_ENTRIES = 500

type DebugLogEntry = {
  at: string
  event: string
  detail?: string
  sessionId?: string
  turnId?: string
  seq?: number
  elapsedMs?: number
  page?: string
  turnState?: string
  loading?: boolean
  queueDepth?: number
  correlationId?: string
  actionId?: string
  lane?: string
  payload?: unknown
}

type TraceMeta = Pick<DebugLogEntry, 'correlationId' | 'actionId' | 'lane' | 'payload'>

type VoiceTurnState = 'idle' | 'wake_armed' | 'listening' | 'endpointed' | 'thinking' | 'responding' | 'closed'
const TURN_STATE_TRANSITIONS: Record<VoiceTurnState, readonly VoiceTurnState[]> = {
  idle: ['wake_armed', 'listening', 'thinking', 'closed'],
  wake_armed: ['listening', 'closed'],
  listening: ['endpointed', 'thinking', 'closed'],
  endpointed: ['thinking', 'listening', 'closed'],
  thinking: ['responding', 'listening', 'closed'],
  responding: ['endpointed', 'listening', 'thinking', 'closed'],
  closed: ['idle', 'wake_armed', 'listening'],
}

type VoiceUxProfile = {
  inactivityMs: number
  wakeFollowupGraceMs: number
  wakeMisfireCooldownSecs: number
}

function detectClientBuildFingerprint(): string {
  if (typeof document === 'undefined') return 'unknown'
  const moduleScripts = Array.from(document.querySelectorAll('script[type="module"][src]'))
  const appScript = moduleScripts
    .map((script) => script.getAttribute('src') ?? '')
    .find((src) => src.includes('/assets/index-') || src.includes('index-'))
  if (!appScript) return 'unknown'
  const fileName = appScript.split('/').pop() ?? appScript
  return fileName || 'unknown'
}

function eventDebugLevel(event: string): VoiceDebugLevel {
  if (
    event.startsWith('voice_queued') ||
    event.startsWith('voice_requeued') ||
    event.startsWith('assistant_wake_')
  ) {
    return 'verbose'
  }
  return 'minimal'
}

function normalizeIntentPhrase(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isStrongConfirmUtterance(value: string): boolean {
  const normalized = normalizeIntentPhrase(value)
  return normalized.length > 0 && STRONG_CONFIRM_PHRASES.has(normalized)
}

function isStrongCancelUtterance(value: string): boolean {
  const normalized = normalizeIntentPhrase(value)
  if (normalized === 'no' || normalized === 'nope' || normalized === 'oh no') return false
  return normalized.length > 0 && STRONG_CANCEL_PHRASES.has(normalized)
}

function getVoiceUxProfile(): VoiceUxProfile {
  if (typeof window === 'undefined') {
    return {
      inactivityMs: NO_ACTIVITY_AUTO_CLOSE_MS,
      wakeFollowupGraceMs: WAKE_FOLLOWUP_GRACE_MS,
      wakeMisfireCooldownSecs: WAKE_MISFIRE_COOLDOWN_SECS,
    }
  }
  const handheld = window.innerWidth < 900
  return handheld
    ? { inactivityMs: 35_000, wakeFollowupGraceMs: 5200, wakeMisfireCooldownSecs: 5 }
    : { inactivityMs: 30_000, wakeFollowupGraceMs: 4500, wakeMisfireCooldownSecs: 6 }
}

function trackVoiceMetric(metric: string): void {
  if (typeof window === 'undefined') return
  try {
    const raw = localStorage.getItem(VOICE_TELEMETRY_KEY)
    const parsed = raw ? JSON.parse(raw) as { counts?: Record<string, number> } : {}
    const counts = parsed.counts ?? {}
    counts[metric] = (counts[metric] ?? 0) + 1
    localStorage.setItem(VOICE_TELEMETRY_KEY, JSON.stringify({
      counts,
      updatedAt: new Date().toISOString(),
    }))
  } catch {
    // ignore local telemetry write failures
  }
}

function isLikelyNoiseTranscript(text: string, confidence?: number | null): boolean {
  const trimmed = text.trim()
  if (!trimmed) return true

  const words = trimmed.split(/\s+/).filter(Boolean)
  const alphaChars = (trimmed.match(/[a-z]/gi) ?? []).length
  const singleWord = words.length === 1
  const single = words[0] ?? ''
  const normalizedWords = words.map(word => word.toLowerCase().replace(/[^a-z0-9']/gi, '')).filter(Boolean)
  const uniqueWords = new Set(normalizedWords).size

  if (singleWord && alphaChars <= 2) return true
  if (singleWord && /^([a-z])\1+$/i.test(single)) return true
  if (words.length <= 4 && uniqueWords <= 1) return true
  if (words.length >= 3 && uniqueWords <= 1) return true

  if (typeof confidence === 'number' && confidence < MIN_FINAL_CONFIDENCE && words.length <= 4) {
    return true
  }

  return false
}

function isMeaningfulInterimSpeech(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (isLikelyNoiseTranscript(trimmed, null)) return false
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length >= 2) return true
  return trimmed.length >= 10
}

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
  keepBridgeAliveBetweenFinals = false,
  onTrace,
}: {
  onInterim: (text: string) => void
  onFinalTranscript: (text: string, confidence?: number | null) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
  hasPendingAction: boolean
  keepBridgeAliveBetweenFinals?: boolean
  onTrace?: (event: string, detail?: string) => void
}) {
  const wsRef              = useRef<WebSocket | null>(null)
  const wsGenerationRef    = useRef(0)
  const activeRef          = useRef(false)
  const suppressRef        = useRef(false)
  const modeRef            = useRef<STTMode>('unknown')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef     = useRef<any>(null)
  const webspeechRestartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const silenceTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastInterimRef     = useRef('')
  const lastInterimTimeRef = useRef(0)
  const connectStartRef    = useRef(0)
  const bridgeReconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bridgeConnectingRef = useRef(false)
  const [phase, setPhase]  = useState<VoicePhase>('idle')
  const phaseRef           = useRef<VoicePhase>('idle')
  const setPhaseSync = (p: VoicePhase) => { phaseRef.current = p; setPhase(p) }
  const [volume, setVolume] = useState(0)
  const [bridgeDown, setBridgeDown] = useState(false)
  const [reconnecting, setReconnecting] = useState(false)
  const [wakeCooldownRemaining, setWakeCooldownRemaining] = useState(0)
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

  // Stable ref — avoids recreating startWebSpeech on every render
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null
  ).current

  const clearBridgeReconnectTimer = useCallback(() => {
    if (bridgeReconnectTimerRef.current) {
      clearTimeout(bridgeReconnectTimerRef.current)
      bridgeReconnectTimerRef.current = null
    }
  }, [])

  const stopWS = useCallback(() => {
    clearBridgeReconnectTimer()
    bridgeConnectingRef.current = false
    wsGenerationRef.current += 1
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }, [clearBridgeReconnectTimer])
  const stopSilenceTimer = () => { if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
  const stopWebSpeechRestartTimer = useCallback(() => {
    if (webspeechRestartTimerRef.current) {
      clearTimeout(webspeechRestartTimerRef.current)
      webspeechRestartTimerRef.current = null
    }
  }, [])

  // No deps — uses only refs, so triggerFinal/startBridge are created once and never stale
  const handleFinalTranscript = useCallback((transcript: string, confidence?: number | null) => {
    if (!transcript.trim()) return
    if (suppressRef.current) return
    if (DISMISS_PHRASES.test(transcript)) {
      activeRef.current = false  // prevent poll-scheduled restart from re-firing
      onDismissRef.current()
      return
    }
    const isShort = transcript.trim().split(/\s+/).length <= 5
    if (isShort && hasPendingRef.current && isStrongConfirmUtterance(transcript)) {
      onConfirmRef.current(); onInterimRef.current('')
      return
    }
    if (isShort && hasPendingRef.current && isStrongCancelUtterance(transcript)) {
      onCancelRef.current(); onInterimRef.current('')
      return
    }
    onFinalRef.current(transcript.trim(), confidence); onFinalRef.current('__SEND__', confidence)
  }, [])

  const triggerFinal = useCallback((text: string, confidence?: number | null) => {
    const keepBridgeStreamAlive =
      keepBridgeAliveBetweenFinals &&
      modeRef.current === 'bridge' &&
      activeRef.current
    if (!keepBridgeStreamAlive) {
      stopWS()
    }
    stopSilenceTimer()
    stopWebSpeechRestartTimer()
    setPhaseSync('processing')
    const finalText = text.trim() || lastInterimRef.current.trim()
    onTrace?.('speech_trigger_final', `${finalText.slice(0, 140)}${typeof confidence === 'number' ? ` (conf=${confidence.toFixed(2)})` : ''}`)
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    handleFinalTranscript(finalText, confidence)
  }, [handleFinalTranscript, keepBridgeAliveBetweenFinals, onTrace, stopWebSpeechRestartTimer, stopWS])

  // ── Web Speech API path (Safari / iOS) ──────────────────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    if (recognitionRef.current) return
    stopWebSpeechRestartTimer()
    setPhaseSync('listening')
    onTrace?.('speech_webspeech_start')

    const recognition = new WebSpeech()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    const scheduleRecognitionRestart = (delayMs: number) => {
      if (webspeechRestartTimerRef.current) return
      webspeechRestartTimerRef.current = setTimeout(() => {
        webspeechRestartTimerRef.current = null
        if (!activeRef.current || phaseRef.current === 'processing') return
        if (recognitionRef.current !== recognition) {
          recognitionRef.current = recognition
        }
        try {
          recognition.start()
        } catch {
          if (recognitionRef.current === recognition) {
            recognitionRef.current = null
          }
        }
      }, delayMs)
    }

    recognition.onresult = (event: WebSpeechResultEvent) => {
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
        try { recognition.stop() } catch { /* ignore */ }
        triggerFinal(finalAccum.trim())
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
        }
      }, SILENCE_MS)
    }

    recognition.onerror = (e: WebSpeechErrorEvent) => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      // 'no-speech' and 'aborted' are expected — no-speech = silence, aborted = we called stop()
      if (e.error === 'no-speech' || e.error === 'aborted') return
      onTrace?.('speech_webspeech_error', e.error ?? 'unknown')
      console.warn('[WebSpeech] error', e.error)
      if (
        activeRef.current &&
        phaseRef.current !== 'processing' &&
        !webspeechRestartTimerRef.current
      ) {
        scheduleRecognitionRestart(500)
      }
    }

    recognition.onend = () => {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      onTrace?.('speech_webspeech_end')
      // continuous=true can still stop on silence — restart transparently
      // Use phaseRef (not phase) to avoid stale closure
      if (
        activeRef.current &&
        phaseRef.current !== 'processing' &&
        !webspeechRestartTimerRef.current
      ) {
        onTrace?.('speech_webspeech_restart_scheduled', 'onend:150ms')
        scheduleRecognitionRestart(150)
      } else {
        onTrace?.(
          'speech_webspeech_restart_skipped',
          `active=${activeRef.current ? 1 : 0} phase=${phaseRef.current} timer=${webspeechRestartTimerRef.current ? 1 : 0}`,
        )
      }
    }

    try {
      recognition.start()
    } catch (err) {
      if (recognitionRef.current === recognition) {
        recognitionRef.current = null
      }
      onTrace?.('speech_webspeech_start_failed', (err as Error).message ?? 'unknown')
      console.warn('[WebSpeech] start failed', err)
      if (
        activeRef.current &&
        phaseRef.current !== 'processing' &&
        !webspeechRestartTimerRef.current
      ) {
        scheduleRecognitionRestart(300)
      }
    }
  }, [WebSpeech, triggerFinal, stopWebSpeechRestartTimer, onTrace]) // all state accessed via refs

  const stopWebSpeech = useCallback(() => {
    stopSilenceTimer()
    stopWebSpeechRestartTimer()
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [stopWebSpeechRestartTimer])

  // ── Bridge path (Pi / Chromium) ─────────────────────────────────────────
  const startBridge = useCallback(() => {
    if (!activeRef.current) return
    const existing = wsRef.current
    if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
      return
    }
    if (bridgeConnectingRef.current) return
    const connectBridge = () => {
      clearBridgeReconnectTimer()
      bridgeConnectingRef.current = true
      lastInterimRef.current = ''
      lastInterimTimeRef.current = 0
      connectStartRef.current = Date.now()
      setPhaseSync('connecting')
      const generation = wsGenerationRef.current + 1
      wsGenerationRef.current = generation

      const ws = new WebSocket(BRIDGE_WS)
      onTrace?.('speech_bridge_connect_start')
      wsRef.current = ws

      const scheduleReconnect = (delayMs: number) => {
        if (bridgeReconnectTimerRef.current) return
        if (!activeRef.current || phaseRef.current === 'processing') return
        bridgeReconnectTimerRef.current = setTimeout(() => {
          bridgeReconnectTimerRef.current = null
          if (!activeRef.current || phaseRef.current === 'processing') return
          connectBridge()
        }, delayMs)
      }

      ws.onopen = () => {
        if (wsGenerationRef.current !== generation || wsRef.current !== ws) return
        bridgeConnectingRef.current = false
        setReconnecting(false)
        setBridgeDown(false)
        onTrace?.('speech_bridge_ws_open')
        ws.send(JSON.stringify({ type: 'start' }))
      }

      ws.onmessage = (evt) => {
        if (wsGenerationRef.current !== generation || wsRef.current !== ws) return
        if (!activeRef.current) return
        try {
          const msg = JSON.parse(evt.data as string)
          switch (msg.type) {
            case 'ready':
              setPhaseSync('listening')
              onTrace?.('speech_bridge_ready')
              connectStartRef.current = 0
              setBridgeDown(false)
              setReconnecting(false)
              break
            case 'volume':
              setVolume(msg.level ?? 0)
              break
            case 'interim':
              if (phaseRef.current === 'processing') break
              if (msg.text !== lastInterimRef.current) {
                lastInterimRef.current = msg.text
                lastInterimTimeRef.current = Date.now()
                onInterimRef.current(msg.text)
              }
              break
            case 'final':
              if (phaseRef.current !== 'processing') {
                onTrace?.('speech_bridge_final', `${String(msg.text ?? '').slice(0, 140)}${typeof msg.confidence === 'number' ? ` (conf=${Number(msg.confidence).toFixed(2)})` : ''}`)
                triggerFinal(msg.text, typeof msg.confidence === 'number' ? msg.confidence : null)
              }
              break
            case 'error':
              onTrace?.('speech_bridge_error', String(msg.msg ?? 'unknown'))
              console.warn('[STT] bridge error', msg.msg)
              stopWS()
              scheduleReconnect(350)
              break
          }
        } catch {
          // ignore
        }
      }

      ws.onerror = () => {
        if (wsGenerationRef.current !== generation || wsRef.current !== ws) return
        onTrace?.('speech_bridge_ws_error')
        console.warn('[STT] WS connection error')
      }

      ws.onclose = () => {
        if (wsGenerationRef.current !== generation || wsRef.current !== ws) return
        bridgeConnectingRef.current = false
        wsRef.current = null
        setVolume(0)
        onTrace?.('speech_bridge_ws_closed')
        if (activeRef.current && phaseRef.current !== 'processing') {
          setReconnecting(true)
        }
        if (connectStartRef.current > 0 && Date.now() - connectStartRef.current > CONNECT_TIMEOUT_MS) {
          console.warn('[STT] connect timeout, retrying')
          setBridgeDown(true)
        }
        scheduleReconnect(500)
      }
    }

    connectBridge()
  }, [triggerFinal, onTrace, clearBridgeReconnectTimer, stopWS]) // onInterim/phase via refs

  const stopBridge = useCallback(() => {
    clearBridgeReconnectTimer()
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch { /* ignore */ }
    }
    stopWS()
  }, [clearBridgeReconnectTimer, stopWS])

  // ── Unified start / stop ─────────────────────────────────────────────────
  const stop = useCallback(async () => {
    activeRef.current = false
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    connectStartRef.current = 0
    setPhaseSync('idle')
    setVolume(0)
    setReconnecting(false)
    onTrace?.('speech_stop')
    onInterimRef.current('')
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopBridge()
  }, [stopWebSpeech, stopBridge, onTrace])

  const start = useCallback(async () => {
    if (activeRef.current) return
    if (IS_SAFE_MODE) return
    activeRef.current = true
    setPhaseSync('connecting')
    onTrace?.('speech_start_requested')

    // Auto-detect once per component lifetime — don't re-probe on every open
    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
      onTrace?.('speech_mode_selected', modeRef.current)
      console.log(`[STT] mode: ${modeRef.current}`)
    }

    if (modeRef.current === 'webspeech') startWebSpeech()
    else startBridge()
  }, [startWebSpeech, startBridge, WebSpeech, onTrace])

  const toggle = useCallback(() => {
    if (activeRef.current) stop()
    else start()
  }, [start, stop])

  // Suppress/unsuppress without stopping the mic — used during AI loading
  const suppress  = useCallback(() => { suppressRef.current = true  }, [])
  const unsuppress = useCallback(() => { suppressRef.current = false }, [])

  // Ensure mic is running — robust re-arm for iOS/WebSpeech after turn handoff.
  // Reads refs (not state) to avoid stale closure.
  const ensureRunning = useCallback(() => {
    if (!activeRef.current) return  // fully stopped (drawer closed), don't restart
    onTrace?.('speech_ensure_running', `mode=${modeRef.current} phase=${phaseRef.current}`)

    if (modeRef.current === 'webspeech') {
      // On iOS Safari, phase can claim "listening" while the recognizer ended.
      // Re-arm whenever the recognizer instance is missing OR we're not actively listening.
      if (!recognitionRef.current || (phaseRef.current !== 'listening' && phaseRef.current !== 'connecting')) {
        onTrace?.('speech_ensure_running_rearm', 'webspeech')
        startWebSpeech()
      } else {
        onTrace?.('speech_ensure_running_ok', 'webspeech')
      }
      return
    }

    // Bridge mode: recover whenever socket is missing.
    // If we're stuck in processing (final transcript closed WS), reconnect anyway
    // so wake + follow-up turns continue without requiring a drawer reopen.
    if (!wsRef.current) {
      onTrace?.('speech_ensure_running_rearm', 'bridge')
      startBridge()
    } else {
      onTrace?.('speech_ensure_running_ok', 'bridge')
    }
  }, [startWebSpeech, startBridge, onTrace]) // phase/resources read via refs

  // Ensure bridge/webspeech resources are always torn down on component unmount.
  useEffect(() => {
    return () => {
      activeRef.current = false
      stopSilenceTimer()
      stopWebSpeech()
      stopBridge()
    }
  }, [stopWebSpeech, stopBridge])

  useEffect(() => {
    if (!activeRef.current) {
      setWakeCooldownRemaining(0)
      return
    }
    if (modeRef.current !== 'bridge') return
    const timer = setInterval(() => {
      fetch(`${BRIDGE}/status`)
        .then((res) => res.ok ? res.json() : null)
        .then((status: { wake_cooldown_remaining?: number } | null) => {
          const next = typeof status?.wake_cooldown_remaining === 'number'
            ? Math.max(0, status.wake_cooldown_remaining)
            : 0
          setWakeCooldownRemaining(next)
        })
        .catch(() => {})
    }, 1200)
    return () => clearInterval(timer)
  }, [phase])

  return {
    phase,
    volume,
    supported,
    bridgeDown,
    reconnecting,
    wakeCooldownRemaining,
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
  launchRequest?: { prompt: string; autoSend: boolean; nonce: string }
  wakeSessionNonce?: string
  page: string
  events: EventWithDetails[]
  family: FamilyMember[]
  homeCity?: string
  onSleepCommand?: () => void
  focusedEvent?: EventWithDetails
}

const SLEEP_PHRASES = /\b(sleep|goodnight|good night|art mode|screen saver|screensaver|night mode)\b/i

export default function AIChatDrawer({ open, onClose, anchor, launchRequest, wakeSessionNonce, page, events, family, homeCity, onSleepCommand, focusedEvent }: Props) {
  const [input, setInput] = useState('')
  const interimRef = useRef('')
  const ignoreInterimUntilRef = useRef(0)
  const [attachedImage, setAttachedImage] = useState<{ dataUrl: string; mimeType: string } | null>(null)
  const lastActivityAtRef = useRef(0)
  const hadMeaningfulProgressRef = useRef(false)
  const wakeSessionActiveRef = useRef(false)
  const wakeStartedRef = useRef(false)
  const autoDismissingRef = useRef(false)
  const handledWakeNonceRef = useRef<string | null>(null)
  const bridgeDownLoggedRef = useRef(false)
  const voiceProfileRef = useRef<VoiceUxProfile>(getVoiceUxProfile())
  const [inactivityCountdown, setInactivityCountdown] = useState<number | null>(null)
  const [voiceConfig, setVoiceConfig] = useState<VoiceRuntimeConfig>(() => readVoiceRuntimeConfig())
  const [showDebugLog, setShowDebugLog] = useState(false)
  const [debugLog, setDebugLog] = useState<DebugLogEntry[]>(() => {
    if (typeof window === 'undefined') return []
    try {
      const raw = localStorage.getItem(AI_DEBUG_LOG_KEY)
      if (!raw) return []
      const parsed = JSON.parse(raw) as DebugLogEntry[]
      return Array.isArray(parsed) ? parsed.slice(-MAX_DEBUG_LOG_ENTRIES) : []
    } catch {
      return []
    }
  })
  const [auditLog, setAuditLog] = useState<VoiceAuditEvent[]>(() => {
    const all = readVoiceAudit()
    return all.slice(-MAX_AUDIT_LOG_ENTRIES)
  })
  const bottomRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const qc = useQueryClient()

  const { messages, loading, send, retryLast, reset, session, sessionLoading, startFresh, primeMessages, updateMessageToolStatus } = useAIAssistant({ page, events, family, homeCity, focusedEvent, onSessionEnd: onClose })

  const led = useLedStrip()

  const pendingConfirmRef = useRef<(() => Promise<boolean>) | null>(null)
  const pendingCancelRef  = useRef<(() => Promise<boolean>) | null>(null)
  const pendingVoiceQueueRef = useRef<string[]>([])
  const voiceSendInFlightRef = useRef(false)
  const voiceSendSeqRef = useRef(0)
  const autoSendTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const traceSessionIdRef = useRef<string | null>(null)
  const traceBuildFingerprintRef = useRef('unknown')
  const traceStartedAtMsRef = useRef(0)
  const traceSeqRef = useRef(0)
  const traceHasFinalRef = useRef(false)
  const traceHasSendRef = useRef(false)
  const traceSpeechEndCountRef = useRef(0)
  const listeningStartedAtRef = useRef<number | null>(null)
  const speechStallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const turnIdRef = useRef<string>('turn-idle')
  const turnStateRef = useRef<VoiceTurnState>('idle')
  const closeReasonRef = useRef('unknown')
  const [uiFeedback, setUiFeedback] = useState<'none' | 'confirm' | 'cancel'>('none')

  useEffect(() => {
    const sync = () => setVoiceConfig(readVoiceRuntimeConfig())
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === 'casa-voice-runtime-config-v1') sync()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const buildTraceEntry = useCallback((event: string, detail?: string, meta?: TraceMeta): VoiceAuditEvent => {
    const now = Date.now()
    const started = traceStartedAtMsRef.current > 0 ? traceStartedAtMsRef.current : now
    const sessionId = traceSessionIdRef.current ?? 'voice-session-unknown'
    const entry: VoiceAuditEvent = {
      at: new Date(now).toISOString(),
      event,
      detail,
      sessionId,
      turnId: turnIdRef.current,
      seq: (traceSeqRef.current += 1),
      elapsedMs: Math.max(0, now - started),
      page,
      turnState: turnStateRef.current,
      loading,
      queueDepth: pendingVoiceQueueRef.current.length,
      correlationId: meta?.correlationId,
      actionId: meta?.actionId,
      lane: meta?.lane,
      payload: meta?.payload,
    }
    return entry
  }, [loading, page])

  const appendDebugLog = useCallback((event: string, detail?: string, meta?: TraceMeta) => {
    if (event === 'voice_final' && detail && detail !== '__SEND__') traceHasFinalRef.current = true
    if (event === 'send_current_input') traceHasSendRef.current = true
    if (event === 'speech_webspeech_end') traceSpeechEndCountRef.current += 1
    const entry = buildTraceEntry(event, detail, meta)
    enqueueRemoteVoiceTrace(entry, 'debug', voiceConfig)
    if (voiceConfig.auditEnabled) {
      enqueueRemoteVoiceTrace(entry, 'audit', voiceConfig)
      console.info('[casa-ai-audit]', JSON.stringify(entry))
      const updated = appendVoiceAudit(entry)
      setAuditLog(updated.slice(-MAX_AUDIT_LOG_ENTRIES))
    }
    if (!shouldEmitVoiceDebug(voiceConfig.debugLevel, eventDebugLevel(event))) return
    const nextEntry: DebugLogEntry = {
      ...entry,
    }
    console.info('[casa-ai-debug]', JSON.stringify(nextEntry))
    setDebugLog((prev) => {
      const next = [...prev, nextEntry].slice(-MAX_DEBUG_LOG_ENTRIES)
      try {
        localStorage.setItem(AI_DEBUG_LOG_KEY, JSON.stringify(next))
      } catch {
        // ignore storage failures
      }
      return next
    })
  }, [buildTraceEntry, voiceConfig])

  const transitionTurnState = useCallback((next: VoiceTurnState, reason: string) => {
    const previous = turnStateRef.current
    if (previous === next) return
    if (!TURN_STATE_TRANSITIONS[previous].includes(next)) {
      appendDebugLog('turn_state_invalid', `${previous} -> ${next} (${reason})`)
      return
    }
    turnStateRef.current = next
    if (next === 'listening') listeningStartedAtRef.current = Date.now()
    else if (previous === 'listening') listeningStartedAtRef.current = null
    appendDebugLog('turn_state', `${previous} -> ${next} (${reason})`)
  }, [appendDebugLog])

  const beginTraceSession = useCallback(() => {
    traceSessionIdRef.current = `voice-${Date.now().toString(36)}`
    traceBuildFingerprintRef.current = detectClientBuildFingerprint()
    traceStartedAtMsRef.current = Date.now()
    traceSeqRef.current = 0
    traceHasFinalRef.current = false
    traceHasSendRef.current = false
    traceSpeechEndCountRef.current = 0
    listeningStartedAtRef.current = null
    turnIdRef.current = `turn-${Date.now().toString(36)}`
    turnStateRef.current = 'idle'
    closeReasonRef.current = 'unknown'
  }, [])

  const requestClose = useCallback((reason: string) => {
    closeReasonRef.current = reason
    transitionTurnState('closed', reason)
    appendDebugLog('drawer_close_requested', reason)
    onClose()
  }, [appendDebugLog, onClose, transitionTurnState])

  useEffect(() => {
    const onAssistantDebug = (rawEvent: Event) => {
      const event = rawEvent as CustomEvent<{ event?: string; detail?: string; meta?: TraceMeta }>
      const name = event.detail?.event?.trim()
      if (!name) return
      appendDebugLog(`assistant_${name}`, event.detail?.detail?.slice(0, 1200), event.detail?.meta)
    }
    window.addEventListener('casa:ai-debug', onAssistantDebug as EventListener)
    return () => {
      window.removeEventListener('casa:ai-debug', onAssistantDebug as EventListener)
    }
  }, [appendDebugLog])

  const clearDebugLog = useCallback(() => {
    setDebugLog([])
    try {
      localStorage.removeItem(AI_DEBUG_LOG_KEY)
    } catch {
      // ignore storage failures
    }
  }, [])

  const copyDebugLog = useCallback(async () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), entries: debugLog }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      appendDebugLog('debug_log_copied', `entries=${debugLog.length}`)
    } catch (err) {
      appendDebugLog('debug_log_copy_failed', (err as Error).message ?? 'unknown error')
    }
  }, [debugLog, appendDebugLog])

  const clearAuditLog = useCallback(() => {
    clearVoiceAudit()
    setAuditLog([])
    appendDebugLog('audit_log_cleared')
  }, [appendDebugLog])

  const copyAuditLog = useCallback(async () => {
    const payload = JSON.stringify({ exportedAt: new Date().toISOString(), entries: auditLog }, null, 2)
    try {
      await navigator.clipboard.writeText(payload)
      appendDebugLog('audit_log_copied', `entries=${auditLog.length}`)
    } catch (err) {
      appendDebugLog('audit_log_copy_failed', (err as Error).message ?? 'unknown error')
    }
  }, [auditLog, appendDebugLog])

  const pingWakeMisfireCooldown = useCallback((seconds = voiceProfileRef.current.wakeMisfireCooldownSecs) => {
    void fetch('http://127.0.0.1:8766/wake-misfire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ seconds }),
    }).catch(() => {})
  }, [])

  const markConversationProgress = useCallback((meaningful = true) => {
    lastActivityAtRef.current = Date.now()
    if (meaningful) hadMeaningfulProgressRef.current = true
  }, [])

  const autoDismissDrawer = useCallback((wakeMisfire: boolean) => {
    if (autoDismissingRef.current) return
    autoDismissingRef.current = true
    trackVoiceMetric(wakeMisfire ? 'wake_misfire_autodismiss' : 'inactivity_autodismiss')
    if (wakeMisfire) pingWakeMisfireCooldown()
    startFresh()
    requestClose(wakeMisfire ? 'wake_misfire_auto_dismiss' : 'inactivity_auto_dismiss')
  }, [pingWakeMisfireCooldown, requestClose, startFresh])

  const markUserInteraction = useCallback(() => {
    markConversationProgress(true)
  }, [markConversationProgress])

  const clearAutoSendTimer = useCallback(() => {
    if (autoSendTimerRef.current) {
      clearTimeout(autoSendTimerRef.current)
      autoSendTimerRef.current = null
    }
  }, [])

  // True when the latest assistant message has a pending tool action awaiting confirmation
  const hasPendingToolAction = messages.some(m => m.toolAction?.status === 'pending')
  const isWakeAssistantMode = page === 'grocery' && Boolean(wakeSessionNonce)

  const triggerUiFeedback = useCallback((mode: 'confirm' | 'cancel') => {
    setUiFeedback(mode)
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = setTimeout(() => {
      setUiFeedback('none')
      feedbackTimerRef.current = null
    }, FEEDBACK_LOCK_MS)
  }, [])

  const sendCurrentInput = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) {
      appendDebugLog('voice_send_skipped_empty')
      return false
    }
    if (loading || voiceSendInFlightRef.current) {
      appendDebugLog(
        'voice_send_blocked',
        `loading=${loading ? '1' : '0'} inflight=${voiceSendInFlightRef.current ? '1' : '0'} depth=${pendingVoiceQueueRef.current.length}`
      )
      return false
    }
    voiceSendInFlightRef.current = true
    turnIdRef.current = `turn-${Date.now().toString(36)}`
    transitionTurnState('thinking', 'input_sent_for_assistant')
    const sendSeq = ++voiceSendSeqRef.current
    appendDebugLog('send_current_input', `#${sendSeq} depth=${pendingVoiceQueueRef.current.length} ${trimmed.slice(0, 140)}`)
    clearAutoSendTimer()
    ignoreInterimUntilRef.current = Date.now() + 1200
    markUserInteraction()
    queueMicrotask(() => setInput(''))
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    await send(trimmed, undefined, {
      disableFastGroceryLane: isWakeAssistantMode,
      traceId: traceSessionIdRef.current ?? session?.id ?? undefined,
    })
    return true
  }, [loading, send, markUserInteraction, clearAutoSendTimer, appendDebugLog, transitionTurnState, isWakeAssistantMode, session?.id])

  const queueOrSendVoiceInput = useCallback(async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed) return
    if (loading || voiceSendInFlightRef.current) {
      pendingVoiceQueueRef.current.push(trimmed)
      appendDebugLog(
        'voice_queued',
        `reason=${loading ? 'loading' : 'inflight'} depth=${pendingVoiceQueueRef.current.length} ${trimmed.slice(0, 110)}`
      )
      return
    }
    const sent = await sendCurrentInput(trimmed)
    if (!sent) {
      pendingVoiceQueueRef.current.push(trimmed)
      appendDebugLog('voice_requeued', `depth=${pendingVoiceQueueRef.current.length} ${trimmed.slice(0, 110)}`)
    }
  }, [loading, sendCurrentInput, appendDebugLog])

  const speech = useSpeechInput({
    onInterim: (interim) => {
      if (Date.now() < ignoreInterimUntilRef.current) return
      interimRef.current = interim
      setInput(interim)
      if (wakeSessionActiveRef.current && isMeaningfulInterimSpeech(interim)) {
        markConversationProgress(true)
      }
    },
    onFinalTranscript: (text, confidence) => {
      appendDebugLog('voice_final', text === '__SEND__' ? '__SEND__' : `${text.slice(0, 140)}${typeof confidence === 'number' ? ` (conf=${confidence.toFixed(2)})` : ''}`)
      if (text === '__SEND__') {
        transitionTurnState('endpointed', 'speech_final_received')
        ignoreInterimUntilRef.current = Date.now() + 1200
        const msg = interimRef.current || (textareaRef.current?.value ?? '')
        const finalized = msg.trim()
        if (!finalized) {
          appendDebugLog('voice_send_skipped_empty', 'finalized transcript empty')
          return
        }
        interimRef.current = finalized
        setInput(finalized)
        const normalizedIntent = normalizeIntentPhrase(finalized)
        const shouldConfirmShortCircuit = hasPendingToolAction && isStrongConfirmUtterance(finalized)
        const shouldCancelShortCircuit = hasPendingToolAction && isStrongCancelUtterance(finalized)
        if (hasPendingToolAction && !shouldConfirmShortCircuit && !shouldCancelShortCircuit && normalizedIntent.length > 0) {
          appendDebugLog('voice_confirm_short_circuit_miss', normalizedIntent.slice(0, 80))
        }
        if (hasPendingToolAction && shouldConfirmShortCircuit) {
          appendDebugLog('voice_confirm_budget_short_circuit', finalized.slice(0, 80))
          const run = pendingConfirmRef.current
          if (run) {
            triggerUiFeedback('confirm')
            led.confirm()
            void Promise.resolve(run()).then((confirmed) => {
              if (!confirmed) return
              appendDebugLog('voice_confirm_completed', 'keeping session open for follow-up')
            })
            return
          }
          // No pending callback: fall through to Phase 1
        }
        if (hasPendingToolAction && shouldCancelShortCircuit) {
          appendDebugLog('voice_cancel_budget_short_circuit', finalized.slice(0, 80))
          const run = pendingCancelRef.current
          if (run) {
            triggerUiFeedback('cancel')
            led.cancel()
            void Promise.resolve(run()).then((cancelled) => {
              if (!cancelled) return
              appendDebugLog('voice_cancel_completed', 'keeping session open for follow-up')
            })
            return
          }
          // No pending callback: fall through to Phase 1
        }
        if (isLikelyNoiseTranscript(msg, confidence)) {
          appendDebugLog('voice_noise_filtered', msg.slice(0, 140))
          interimRef.current = ''
          queueMicrotask(() => setInput(''))
          if (wakeSessionActiveRef.current && !hadMeaningfulProgressRef.current) {
            autoDismissDrawer(true)
          }
          return
        }
        // Check for sleep command before sending to AI
        if (SLEEP_PHRASES.test(msg)) {
          appendDebugLog('voice_sleep_command', msg.slice(0, 140))
          onSleepCommand?.()
          setTimeout(() => requestClose('sleep_command'), 300)
          return
        }
        clearAutoSendTimer()
        autoSendTimerRef.current = setTimeout(() => {
          autoSendTimerRef.current = null
          queueOrSendVoiceInput(finalized)
          interimRef.current = ''
        }, TRANSCRIPT_SETTLE_BEFORE_SEND_MS)
      } else {
        interimRef.current = text
        setInput(text)
      }
    },
    onDismiss: () => {
      markUserInteraction()
      // Verbal goodbye — clear session immediately so next open starts fresh
      startFresh()
      setTimeout(() => requestClose('voice_dismiss_phrase'), 400)
    },
    onConfirm: () => {
      markUserInteraction()
      triggerUiFeedback('confirm')
      led.confirm()
      const run = pendingConfirmRef.current
      if (!run) return
      void Promise.resolve(run()).then((confirmed) => {
        if (!confirmed) return
        appendDebugLog('voice_confirm_completed', 'keeping session open for follow-up')
      })
    },
    onCancel:  () => {
      markUserInteraction()
      triggerUiFeedback('cancel')
      led.cancel()
      const run = pendingCancelRef.current
      if (!run) return
      void Promise.resolve(run()).then((cancelled) => {
        if (!cancelled) return
        appendDebugLog('voice_cancel_completed', 'keeping session open for follow-up')
      })
    },
    hasPendingAction: hasPendingToolAction,
    keepBridgeAliveBetweenFinals: page === 'grocery' && !isWakeAssistantMode,
    onTrace: appendDebugLog,
  })

  useEffect(() => {
    if (loading) return
    if (voiceSendInFlightRef.current) {
      voiceSendInFlightRef.current = false
      appendDebugLog('voice_send_complete', `pending=${pendingVoiceQueueRef.current.length}`)
    }
    const next = pendingVoiceQueueRef.current.shift()
    if (!next) return
    appendDebugLog('voice_dequeued', `depth=${pendingVoiceQueueRef.current.length} ${next.slice(0, 110)}`)
    
    // Fire async send without awaiting (queue processing will wait for loading to clear)
    void sendCurrentInput(next).then((sent) => {
      if (!sent) {
        pendingVoiceQueueRef.current.unshift(next)
        appendDebugLog('voice_requeued', `depth=${pendingVoiceQueueRef.current.length} ${next.slice(0, 110)}`)
      }
    })
  }, [loading, sendCurrentInput, appendDebugLog])

  useEffect(() => {
    return () => {
      if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current)
      if (speechStallTimerRef.current) clearTimeout(speechStallTimerRef.current)
      clearAutoSendTimer()
      led.off()
    }
  }, [clearAutoSendTimer]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    if (speechStallTimerRef.current) {
      clearTimeout(speechStallTimerRef.current)
      speechStallTimerRef.current = null
    }
    queueMicrotask(() => appendDebugLog('speech_phase', speech.phase))
    if (speech.phase === 'listening') {
      speechStallTimerRef.current = setTimeout(() => {
        if (!open || speech.phase !== 'listening' || traceHasFinalRef.current) return
        const since = listeningStartedAtRef.current ? Date.now() - listeningStartedAtRef.current : 0
        appendDebugLog('speech_listening_stall', `elapsed=${since}`)
      }, 7000)
    }
  }, [open, speech.phase, appendDebugLog])

  useEffect(() => {
    if (!open) return
    queueMicrotask(() => appendDebugLog('loading_state', loading ? 'loading' : 'idle'))
  }, [open, loading, appendDebugLog])

  useEffect(() => {
    if (!open || messages.length === 0) return
    const latest = messages[messages.length - 1]
    const summary = latest.toolAction
      ? `${latest.role}:tool:${latest.toolAction.tool}:${latest.toolAction.status}`
      : `${latest.role}:${latest.content.slice(0, 120)}`
    queueMicrotask(() => {
      appendDebugLog('message', summary)
      if (latest.role === 'assistant') {
        transitionTurnState('responding', 'assistant_message_received')
      }
    })
  }, [open, messages, appendDebugLog, transitionTurnState])

  useEffect(() => {
    queueMicrotask(() => {
      if (open) appendDebugLog('drawer_opened', page)
      else appendDebugLog('drawer_closed', closeReasonRef.current)
    })
  }, [open, page, appendDebugLog])

  useEffect(() => {
    if (open) {
      beginTraceSession()
      autoDismissingRef.current = false
      wakeSessionActiveRef.current = Boolean(wakeSessionNonce)
      wakeStartedRef.current = Boolean(wakeSessionNonce)
      hadMeaningfulProgressRef.current = false
      queueMicrotask(() => {
        appendDebugLog('trace_started', wakeSessionNonce ? 'source=wake' : 'source=manual')
        appendDebugLog(
          'trace_context',
          `page=${page} debug=${voiceConfig.debugLevel} audit=${voiceConfig.auditEnabled ? 1 : 0} build=${traceBuildFingerprintRef.current}`,
          { payload: { client_build: traceBuildFingerprintRef.current } },
        )
      })
      transitionTurnState('wake_armed', wakeSessionNonce ? 'wake_open' : 'manual_open')
      if (wakeSessionNonce) trackVoiceMetric('wake_session_started')
      markConversationProgress(false)
      if (IS_SAFE_MODE) return
      // Start connecting immediately — don't wait for animation.
      // Bridge buffers audio from /start so by the time the user speaks it's ready.
      speech.start()
      transitionTurnState('listening', 'speech_start')
      // Focus textarea slightly after animation settles (UI only, doesn't affect mic)
      setTimeout(() => textareaRef.current?.focus(), 300)
    } else {
      const outcome = traceHasSendRef.current
        ? 'completed'
        : traceHasFinalRef.current
          ? 'final_no_send'
          : traceSpeechEndCountRef.current > 0
            ? 'asr_end_no_final'
            : 'no_input'
      appendDebugLog(
        'trace_outcome',
        `status=${outcome} final=${traceHasFinalRef.current ? 1 : 0} sent=${traceHasSendRef.current ? 1 : 0} speechEnd=${traceSpeechEndCountRef.current}`,
      )
      if (outcome === 'completed') appendDebugLog('turn_completed', 'source=trace_outcome')
      else if (outcome === 'final_no_send') appendDebugLog('turn_aborted', 'reason=final_without_send')
      else if (outcome === 'asr_end_no_final') appendDebugLog('asr_no_final', 'reason=speech_ended_without_final')
      else appendDebugLog('turn_timeout', 'reason=no_input_detected')
      appendDebugLog(
        'trace_closed',
        `reason=${closeReasonRef.current} pending=${pendingVoiceQueueRef.current.length} inflight=${voiceSendInFlightRef.current ? 1 : 0}`,
      )
      clearAutoSendTimer()
      if (feedbackTimerRef.current) {
        clearTimeout(feedbackTimerRef.current)
        feedbackTimerRef.current = null
      }
      queueMicrotask(() => setUiFeedback('none'))
      ignoreInterimUntilRef.current = 0
      speech.stop()
      led.off()
      reset()
      queueMicrotask(() => setInput(''))
      interimRef.current = ''
      pendingVoiceQueueRef.current = []
      voiceSendInFlightRef.current = false
      traceStartedAtMsRef.current = 0
      traceSeqRef.current = 0
      traceHasFinalRef.current = false
      traceHasSendRef.current = false
      traceSpeechEndCountRef.current = 0
      listeningStartedAtRef.current = null
      queueMicrotask(() => setAttachedImage(null))
      freshStartedRef.current = null  // allow fresh start next time this event is opened
      traceSessionIdRef.current = null
    }
  }, [open, markConversationProgress, wakeSessionNonce, clearAutoSendTimer, beginTraceSession, appendDebugLog, transitionTurnState]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return
    if (speech.bridgeDown && !bridgeDownLoggedRef.current) {
      trackVoiceMetric('bridge_offline')
      bridgeDownLoggedRef.current = true
    }
    if (!speech.bridgeDown) {
      bridgeDownLoggedRef.current = false
    }
  }, [open, speech.bridgeDown])

  useEffect(() => {
    if (!open) return
    const interval = setInterval(() => {
      const elapsed = Date.now() - lastActivityAtRef.current
      const remaining = voiceProfileRef.current.inactivityMs - elapsed
      if (remaining > 0) {
        if (remaining <= 3000) {
          setInactivityCountdown(Math.max(1, Math.ceil(remaining / 1000)))
        } else {
          setInactivityCountdown(null)
        }
        return
      }
      const wakeMisfire = wakeSessionActiveRef.current && !hadMeaningfulProgressRef.current
      autoDismissDrawer(wakeMisfire)
    }, 1000)
    return () => clearInterval(interval)
  }, [open, autoDismissDrawer])

  useEffect(() => {
    if (!open || !wakeSessionNonce) return
    wakeSessionActiveRef.current = true
    if (handledWakeNonceRef.current === wakeSessionNonce) return
    handledWakeNonceRef.current = wakeSessionNonce
    hadMeaningfulProgressRef.current = false
    markConversationProgress(false)
    const timer = setTimeout(() => {
      if (!open) return
      if (!hadMeaningfulProgressRef.current) {
        autoDismissDrawer(true)
      }
    }, voiceProfileRef.current.wakeFollowupGraceMs)
    return () => clearTimeout(timer)
  }, [open, wakeSessionNonce, autoDismissDrawer, markConversationProgress])

  useEffect(() => {
    if (!open || messages.length === 0) return
    markConversationProgress(true)
    if (wakeStartedRef.current) {
      trackVoiceMetric('wake_session_success')
      wakeStartedRef.current = false
    }
  }, [open, messages.length, markConversationProgress])

  useEffect(() => {
    if (!open) return
    const timer = setInterval(() => {
      appendDebugLog('device_heartbeat', `phase=${speech.phase} loading=${loading ? 1 : 0}`)
    }, 10000)
    return () => clearInterval(timer)
  }, [open, speech.phase, loading, appendDebugLog])

  const buildCorrelationId = useCallback((suffix: string) => {
    const sessionPart = session?.id ?? 'no-session'
    return `${sessionPart}:${suffix}:${Date.now().toString(36)}`
  }, [session?.id])
  const getVoiceDebugDeviceId = useCallback((): string | null => {
    try {
      return localStorage.getItem(VOICE_DEBUG_DEVICE_ID_KEY)
    } catch {
      return null
    }
  }, [])

  // When in event-edit mode, always start a fresh session so old conversations don't bleed in.
  const firedEventGreetRef = useRef<string | null>(null)
  const freshStartedRef = useRef<string | null>(null)
  const handledLaunchRef = useRef<string | null>(null)
  useEffect(() => {
    if (!open || !focusedEvent) return
    if (freshStartedRef.current === focusedEvent.id) return
    // eslint-disable-next-line react-hooks/immutability
    freshStartedRef.current = focusedEvent.id
    firedEventGreetRef.current = null  // reset so greet fires after fresh start
    startFresh()
  }, [open, focusedEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || !launchRequest || !launchRequest.prompt) return
    if (handledLaunchRef.current === launchRequest.nonce) return
    handledLaunchRef.current = launchRequest.nonce
    // Treat AI-launched drafts as active interaction so the idle auto-close timer doesn't shut the drawer.
    markUserInteraction()
    ignoreInterimUntilRef.current = Date.now() + 1500
    startFresh()
    if (launchRequest.autoSend) {
      setTimeout(() => send(launchRequest.prompt, undefined, {
        skipGoodbyeCheck: true,
        disableFastGroceryLane: isWakeAssistantMode,
        traceId: traceSessionIdRef.current ?? session?.id ?? undefined,
      }), 120)
    }
  }, [open, launchRequest, send, startFresh, markUserInteraction, isWakeAssistantMode, session?.id])

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
    if (loading && page !== 'grocery') {
      speech.suppress()
    } else {
      speech.unsuppress()
      // Auto re-arm for active wake sessions and explicit confirmation follow-ups.
      // Grocery voice add should also stay hot between turns (manual mic sessions),
      // so users can chain multiple items without re-tapping the mic.
      const keepVoiceHot = hasPendingToolAction || wakeSessionActiveRef.current || page === 'grocery' || page === 'app'
      if (open && keepVoiceHot) {
        setTimeout(() => speech.ensureRunning(), 220)
        setTimeout(() => speech.ensureRunning(), 950)
      }
    }
  }, [loading, open, hasPendingToolAction, page, speech])

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
    turnIdRef.current = `turn-${Date.now().toString(36)}`
    transitionTurnState('thinking', 'typed_input_sent')
    setInput('')
    interimRef.current = ''
    if (textareaRef.current) textareaRef.current.value = ''
    setAttachedImage(null)
    send(text || '(see attached image)', img ?? undefined, {
      disableFastGroceryLane: isWakeAssistantMode,
      traceId: traceSessionIdRef.current ?? session?.id ?? undefined,
    })
  }, [input, attachedImage, loading, send, markUserInteraction, transitionTurnState, isWakeAssistantMode, session?.id])

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
  }, [markUserInteraction, speech])

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
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const showRetryLast = !!latestAssistant && /try again|something went wrong|timed out|quota/i.test(latestAssistant.content)
  const modeLabel = page === 'grocery'
    ? (isWakeAssistantMode ? 'Assistant mode' : 'Grocery rapid mode')
    : 'Assistant mode'
  const cooldownSeconds = Math.ceil(speech.wakeCooldownRemaining ?? 0)
  const diagnosticsLabel = IS_SAFE_MODE
    ? 'Safe mode'
    : !voiceConfig.coreV2Enabled
      ? 'Voice core disabled'
    : speech.bridgeDown
      ? 'Bridge offline'
      : cooldownSeconds > 0
        ? `Wake cooldown ${cooldownSeconds}s`
        : speech.reconnecting
          ? 'Reconnecting mic'
          : speech.connecting
            ? 'Connecting mic'
            : loading || speech.phase === 'processing'
              ? 'Processing'
              : speech.listening
                ? 'Listening'
                : hasTypedInput
                  ? 'Typing'
                  : 'Idle'
  const aiPresence: 'off' | 'idle' | 'listening' | 'voice_active' | 'processing' | 'typing' | 'confirm' | 'cancel' =
    !open
      ? 'off'
      : uiFeedback === 'confirm'
        ? 'confirm'
        : uiFeedback === 'cancel'
          ? 'cancel'
          : loading || speech.phase === 'processing'
            ? 'processing'
        : hasTypedInput
          ? 'typing'
          : isVoiceActive
            ? 'voice_active'
            : speech.listening || speech.connecting
              ? 'listening'
              : 'idle'
  const presenceStyle = { ['--voice-level' as const]: String(voiceLevel) } as React.CSSProperties

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[65] max-sm:bg-black/40 sm:bg-transparent"
            onClick={() => requestClose('backdrop_tap')}
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
                  onClick={() => requestClose('header_close_button')}
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
                  onConfirmToolAction={async (messageId, tool, args) => {
                    updateMessageToolStatus(messageId, 'loading')
                    try {
                      const isCalendarWrite = tool === 'create_event' || tool === 'update_event' || tool === 'delete_event'
                      const matchedEvent = tool === 'update_event'
                        ? events.find((event) => event.id === String(args.id ?? ''))
                        : undefined
                      const requestArgs = tool === 'update_event' && matchedEvent && args.expected_updated_at === undefined
                        ? { ...args, expected_updated_at: matchedEvent.updated_at }
                        : args
                      const invokeExecute = async (payloadArgs: Record<string, unknown>) => supabase.functions.invoke('execute-ai-action', {
                        body: {
                          tool,
                          args: payloadArgs,
                          action_id: messageId,
                          session_id: session?.id ?? null,
                          correlation_id: buildCorrelationId(messageId),
                          trace_id: traceSessionIdRef.current ?? session?.id ?? null,
                          turn_id: turnIdRef.current,
                          lane: 'tool_action',
                          device_id: getVoiceDebugDeviceId(),
                          client_trace_present: true,
                          client_build: traceBuildFingerprintRef.current,
                          client_trace_source: 'ai-chat-drawer',
                          sync_mode: isCalendarWrite ? 'async' : undefined,
                        },
                      })

                      let { data, error } = await invokeExecute(requestArgs)
                      let executeFailure = error ?? (data?.success === false ? new Error(data.error ?? 'Action failed') : null)

                      if (executeFailure && tool === 'update_event' && /changed since/i.test((executeFailure as Error).message ?? '')) {
                        const eventId = String(args.id ?? '')
                        if (eventId) {
                          appendDebugLog('tool_action_retry_stale', `update_event:${eventId}`)
                          const { data: latestEvent, error: latestEventError } = await supabase
                            .from('events')
                            .select('updated_at')
                            .eq('id', eventId)
                            .single()
                          if (latestEventError) throw executeFailure
                          const retryArgs = {
                            ...requestArgs,
                            expected_updated_at: latestEvent.updated_at,
                          }
                          const retryResult = await invokeExecute(retryArgs)
                          data = retryResult.data
                          error = retryResult.error
                          executeFailure = error ?? (data?.success === false ? new Error(data.error ?? 'Action failed') : null)
                        }
                      }

                      if (executeFailure) throw executeFailure
                      const normalizedSyncStatus = data?.sync_status === 'queued'
                        ? 'queued'
                        : data?.sync_status === 'failed'
                          ? 'failed'
                          : data?.sync_status === 'synced'
                            ? 'synced'
                            : undefined
                      const syncStatus = isCalendarWrite ? (normalizedSyncStatus ?? 'failed') : undefined
                      const syncWarning = data?.sync_warning
                        ?? (isCalendarWrite && syncStatus === 'failed'
                          ? 'Saved in Casa Tabor, but sync verification is unavailable right now.'
                          : undefined)
                      appendDebugLog('tool_action_success', `${tool}`)
                      updateMessageToolStatus(messageId, 'done', {
                        actionId: data?.action_id,
                        resultEventId: data?.event_id,
                        syncWarning,
                        syncStatus,
                        undoStatus: 'idle',
                        undoErrorMsg: undefined,
                      })
                      qc.invalidateQueries({ queryKey: ['events'] })
                      qc.invalidateQueries({ queryKey: ['grocery'] })
                      return true
                    } catch (err) {
                      appendDebugLog('tool_action_error', `${tool}: ${(err as Error).message}`)
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
                          trace_id: traceSessionIdRef.current ?? session?.id ?? null,
                          turn_id: turnIdRef.current,
                          lane: 'tool_action',
                          device_id: getVoiceDebugDeviceId(),
                          client_trace_present: true,
                          client_build: traceBuildFingerprintRef.current,
                          client_trace_source: 'ai-chat-drawer',
                          sync_mode: 'async',
                        },
                      })
                      if (error) throw error
                      if (data?.success === false) throw new Error(data.error ?? 'Undo failed')
                      const normalizedSyncStatus = data?.sync_status === 'queued'
                        ? 'queued'
                        : data?.sync_status === 'failed'
                          ? 'failed'
                          : data?.sync_status === 'synced'
                            ? 'synced'
                            : 'failed'
                      updateMessageToolStatus(messageId, 'done', {
                        syncWarning: data?.sync_warning ?? (normalizedSyncStatus === 'failed'
                          ? 'Undo applied in Casa Tabor, but sync verification is unavailable right now.'
                          : undefined),
                        syncStatus: normalizedSyncStatus,
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
                  <span className="text-caption">Got it — working on that…</span>
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
                  'ai-presence-composer relative flex items-end gap-2 bg-casa-bg rounded-xl border border-casa-border px-3 py-2 transition-all duration-300',
                  aiPresence === 'listening' && 'ai-presence-listening',
                  aiPresence === 'voice_active' && 'ai-presence-voice',
                  aiPresence === 'processing' && 'ai-presence-processing',
                  aiPresence === 'typing' && 'ai-presence-typing',
                  aiPresence === 'confirm' && 'ai-presence-confirm',
                  aiPresence === 'cancel' && 'ai-presence-cancel',
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

                {speech.supported && voiceConfig.coreV2Enabled && (
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
                  : !voiceConfig.coreV2Enabled
                    ? 'Voice core disabled in AI Settings — text input still works'
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
              <div className="mt-1 flex items-center justify-center gap-2 text-[11px] text-casa-muted/80">
                <span className="inline-flex items-center rounded-full border border-casa-border/70 bg-casa-bg px-2 py-0.5">
                  {modeLabel}
                </span>
                <span className="inline-flex items-center gap-1 rounded-full border border-casa-border/70 px-2 py-0.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-casa-gold/80" />
                  {diagnosticsLabel}
                </span>
                {inactivityCountdown !== null && (
                  <span className="inline-flex items-center rounded-full border border-casa-border/70 px-2 py-0.5">
                    Auto-close in {inactivityCountdown}s
                  </span>
                )}
                {showRetryLast && (
                  <button
                    type="button"
                    onClick={() => {
                      trackVoiceMetric('retry_last_clicked')
                      void retryLast()
                    }}
                    className="inline-flex items-center rounded-full border border-casa-border bg-casa-bg px-2 py-0.5 hover:bg-white transition-colors"
                  >
                    Retry last
                  </button>
                )}
                {shouldEmitVoiceDebug(voiceConfig.debugLevel, 'minimal') && (
                  <button
                    type="button"
                    onClick={() => setShowDebugLog((prev) => !prev)}
                    className="inline-flex items-center rounded-full border border-casa-border bg-casa-bg px-2 py-0.5 hover:bg-white transition-colors"
                  >
                    {showDebugLog ? 'Hide debug' : 'Show debug'}
                  </button>
                )}
                {voiceConfig.auditEnabled && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = writeVoiceRuntimeConfig({ auditEnabled: false })
                      setVoiceConfig(next)
                    }}
                    className="inline-flex items-center rounded-full border border-casa-border bg-casa-bg px-2 py-0.5 hover:bg-white transition-colors"
                  >
                    Disable audit
                  </button>
                )}
              </div>
              {showDebugLog && shouldEmitVoiceDebug(voiceConfig.debugLevel, 'minimal') && (
                <div className="mt-2 rounded-xl border border-casa-border bg-casa-bg/70 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-casa-muted">AI/Voice debug log</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void copyDebugLog() }}
                        className="text-[11px] text-casa-muted hover:text-casa-navy"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={clearDebugLog}
                        className="text-[11px] text-casa-muted hover:text-casa-navy"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
                    {debugLog.length === 0 ? (
                      <p className="text-[11px] text-casa-muted">No debug events yet.</p>
                    ) : (
                      debugLog.slice().reverse().map((entry, idx) => (
                        <div key={`${entry.at}-${idx}`} className="font-mono text-[10px] text-casa-muted break-words">
                          <span className="text-casa-navy/80">{new Date(entry.at).toLocaleTimeString()}</span>
                          {' · '}
                          <span>{entry.event}</span>
                          {entry.turnId ? ` · ${entry.turnId}` : ''}
                          {entry.detail ? ` · ${entry.detail}` : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
              {voiceConfig.auditEnabled && showDebugLog && (
                <div className="mt-2 rounded-xl border border-casa-border bg-casa-bg/70 p-2">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-[11px] font-semibold text-casa-muted">Wake-to-close audit trail</p>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => { void copyAuditLog() }}
                        className="text-[11px] text-casa-muted hover:text-casa-navy"
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        onClick={clearAuditLog}
                        className="text-[11px] text-casa-muted hover:text-casa-navy"
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                  <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                    {auditLog.length === 0 ? (
                      <p className="text-[11px] text-casa-muted">No audit events yet.</p>
                    ) : (
                      auditLog.slice().reverse().slice(0, 120).map((entry, idx) => (
                        <div key={`${entry.at}-${idx}`} className="font-mono text-[10px] text-casa-muted break-words">
                          <span className="text-casa-navy/80">{new Date(entry.at).toLocaleTimeString()}</span>
                          {' · '}
                          <span>{entry.event}</span>
                          {entry.turnId ? ` · ${entry.turnId}` : ''}
                          {entry.detail ? ` · ${entry.detail}` : ''}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}


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
  onConfirmToolAction: (messageId: string, tool: string, args: Record<string, unknown>) => Promise<boolean>
  onUndoToolAction: (messageId: string, actionId: string) => Promise<void>
  onCancelToolAction: (messageId: string) => void
  onRefreshToolAction: () => void
  registerPendingConfirm: (fn: () => Promise<boolean>) => void
  registerPendingCancel:  (fn: () => Promise<boolean>) => void
}) {
  const isUser = msg.role === 'user'
  const ta = msg.toolAction
  const hasPendingAction = !!ta && ta.status === 'pending'
  const isCalendarWrite = !!ta && (ta.tool === 'create_event' || ta.tool === 'update_event' || ta.tool === 'delete_event')
  const calendarSyncStatus = isCalendarWrite ? (ta.syncStatus ?? 'failed') : null
  const isStaleError = !!ta?.errorMsg && ta.errorMsg.toLowerCase().includes('changed since')
  const isDestructiveAction = ta?.tool === 'delete_event' || ta?.tool === 'clear_checked_grocery_items'

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
          <p dangerouslySetInnerHTML={{ __html: msg.content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
        )}

        {/* Tool action confirmation card */}
        {ta && (
          <div className="mt-2.5 pt-2.5 border-t border-casa-divider">
            {ta.status === 'done' ? (
              <div className="space-y-1">
                {isCalendarWrite && calendarSyncStatus !== 'synced' ? (
                  <div className={cn(
                    'flex items-center gap-1.5 text-caption font-semibold',
                    calendarSyncStatus === 'queued' ? 'text-amber-600' : 'text-red-600',
                  )}>
                    {calendarSyncStatus === 'queued' ? <Loader2 size={13} className="animate-spin" /> : <XCircle size={13} />}
                    {calendarSyncStatus === 'queued'
                      ? 'Saved in Casa — Google sync in progress'
                      : 'Saved in Casa — Google sync not confirmed'}
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-emerald-600 text-caption font-semibold">
                    <Check size={13} />
                    {ta.tool === 'create_event' ? 'Created and verified ✓'
                      : ta.tool === 'update_event' ? 'Updated and verified ✓'
                      : ta.tool === 'delete_event' ? 'Deleted and verified ✓'
                      : ta.tool === 'add_grocery_items' ? 'Added to grocery list ✓'
                      : 'Completed ✓'}
                  </div>
                )}
                {ta.tool === 'create_event' && ta.resultEventId && (
                  <p className="text-caption text-casa-muted">Visible on your calendar now</p>
                )}
                {ta.syncWarning && (
                  <p className="text-caption text-amber-600">{ta.syncWarning}</p>
                )}
                {isCalendarWrite && calendarSyncStatus && (
                  <SyncStatusPill status={calendarSyncStatus} />
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
