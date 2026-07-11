import { useState, useRef, useEffect, useCallback } from 'react'
import { normalizeConfidence as normalizeConfidencePure } from '../lib/sttConfidence.mjs'
import { isIncompleteVoiceFragment } from '../lib/voiceTurnTaking.mjs'

const DISMISS_PHRASES = /\b(thank you|thanks|goodbye|bye|close|dismiss|that'?s all|all done|never mind|nevermind|stop)\b/i
const CONFIRM_PHRASES = /\b(yes|yeah|yep|confirm|ok|okay|go ahead|do it|sounds good|correct|right|affirmative|absolutely|sure|proceed)\b/i
const CANCEL_PHRASES  = /\b(no|nope|cancel|don't|do not|stop|abort|never mind|nevermind|undo)\b/i

/** DeepGram STT bridge — HTTP for probe/display, WS for streaming */
const BRIDGE    = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
export const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

export type VoicePhase = 'idle' | 'connecting' | 'listening' | 'processing'
export type STTMode = 'unknown' | 'bridge' | 'webspeech'

const SILENCE_MS = 2500
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

export function useSpeechInput({
  onInterim,
  onFinalTranscript,
  onDismiss,
  onConfirm,
  onCancel,
  onIncomplete,
  hasPendingAction,
  onTrace,
}: {
  onInterim: (text: string) => void
  onFinalTranscript: (text: string, meta?: { confidence?: number | null }) => void
  onDismiss: () => void
  onConfirm: () => void
  onCancel: () => void
  onIncomplete?: (text: string) => void
  hasPendingAction: boolean
  onTrace?: (event: string, payload?: Record<string, unknown>) => void
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
  const listeningStartRef  = useRef(0)
  const firstInterimRef    = useRef(false)
  const utteranceIdRef     = useRef('')
  const pendingFragmentRef = useRef('')
  const fragmentTimerRef   = useRef<ReturnType<typeof setTimeout> | null>(null)
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
  const onIncompleteRef    = useRef(onIncomplete)
  const onTraceRef         = useRef(onTrace)
  const hasPendingRef      = useRef(hasPendingAction)
  useEffect(() => { onInterimRef.current  = onInterim },        [onInterim])
  useEffect(() => { onFinalRef.current    = onFinalTranscript }, [onFinalTranscript])
  useEffect(() => { onDismissRef.current  = onDismiss },         [onDismiss])
  useEffect(() => { onConfirmRef.current  = onConfirm },         [onConfirm])
  useEffect(() => { onCancelRef.current   = onCancel },          [onCancel])
  useEffect(() => { onIncompleteRef.current = onIncomplete },     [onIncomplete])
  useEffect(() => { onTraceRef.current    = onTrace },           [onTrace])
  useEffect(() => { hasPendingRef.current = hasPendingAction },  [hasPendingAction])

  const normalizeConfidence = useCallback((raw: unknown): number | null => {
    return normalizeConfidencePure(raw)
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
  const stopFragmentTimer = () => { if (fragmentTimerRef.current) clearTimeout(fragmentTimerRef.current); fragmentTimerRef.current = null }
  const newUtteranceId = () => {
    utteranceIdRef.current = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
    return utteranceIdRef.current
  }

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

  const triggerFinal = useCallback((text: string, metadata: { endpointReason?: string } = {}) => {
    stopWS()
    stopSilenceTimer()
    const capturedText = text.trim() || lastInterimRef.current.trim()
    const finalText = [pendingFragmentRef.current, capturedText].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim()
    const asrElapsedMs = listeningStartRef.current > 0 ? Date.now() - listeningStartRef.current : null
    lastInterimRef.current = ''
    lastInterimTimeRef.current = 0
    firstInterimRef.current = false
    if (isIncompleteVoiceFragment(finalText)) {
      pendingFragmentRef.current = finalText
      setPhaseSync('connecting')
      onInterimRef.current(finalText)
      onTraceRef.current?.('asr_fragment_held', {
        utterance_id: utteranceIdRef.current,
        endpoint_reason: metadata.endpointReason ?? 'unknown',
        asr_elapsed_ms: asrElapsedMs,
        word_count: finalText.split(/\s+/).length,
      })
      stopFragmentTimer()
      fragmentTimerRef.current = setTimeout(() => {
        const abandoned = pendingFragmentRef.current
        pendingFragmentRef.current = ''
        fragmentTimerRef.current = null
        onInterimRef.current('')
        onTraceRef.current?.('asr_fragment_discarded', {
          utterance_id: utteranceIdRef.current,
          reason: 'continuation_timeout',
          word_count: abandoned ? abandoned.split(/\s+/).length : 0,
        })
        if (abandoned) onIncompleteRef.current?.(abandoned)
      }, 4500)
      return
    }
    stopFragmentTimer()
    pendingFragmentRef.current = ''
    setPhaseSync('processing')
    onTraceRef.current?.('asr_final', {
      utterance_id: utteranceIdRef.current,
      endpoint_reason: metadata.endpointReason ?? 'unknown',
      asr_elapsed_ms: asrElapsedMs,
      confidence: lastConfidenceRef.current,
      word_count: finalText ? finalText.split(/\s+/).length : 0,
    })
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
    listeningStartRef.current = Date.now()
    newUtteranceId()
    firstInterimRef.current = false
    setPhaseSync('listening')
    onTraceRef.current?.('asr_listening_ready', { connect_ms: 0, mode: 'webspeech', utterance_id: utteranceIdRef.current })

    const recognition = new WebSpeech()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        triggerFinal(finalAccum.trim(), { endpointReason: 'provider_final' })
        if (activeRef.current) setTimeout(() => startWebSpeech(), 300)
        return
      }

      const display = interim.trim()
      if (!display) return

      if (!firstInterimRef.current) {
        firstInterimRef.current = true
        onTraceRef.current?.('asr_first_interim', {
          first_interim_ms: Date.now() - listeningStartRef.current,
          mode: 'webspeech',
        })
      }
      onInterimRef.current(display)
      lastInterimRef.current = display

      // Silence timer fallback for browsers that don't emit isFinal promptly
      stopSilenceTimer()
      silenceTimerRef.current = setTimeout(() => {
        if (lastInterimRef.current && activeRef.current) {
          const toSend = lastInterimRef.current
          lastInterimRef.current = ''
          try { recognition.stop() } catch { /* ignore */ }
          triggerFinal(toSend, { endpointReason: 'client_silence_timeout' })
          if (activeRef.current) setTimeout(() => startWebSpeech(), 300)
        }
      }, SILENCE_MS)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      // 'no-speech' and 'aborted' are expected — no-speech = silence, aborted = we called stop()
      if (e.error === 'no-speech' || e.error === 'aborted') return
      onTraceRef.current?.('asr_error', { mode: 'webspeech', reason: String(e.error ?? 'unknown').slice(0, 120) })
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
    newUtteranceId()
    firstInterimRef.current = false
    onTraceRef.current?.('asr_connect_started', { mode: 'bridge', utterance_id: utteranceIdRef.current })
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
            listeningStartRef.current = Date.now()
            onTraceRef.current?.('asr_listening_ready', {
              connect_ms: connectStartRef.current > 0 ? Date.now() - connectStartRef.current : null,
              mode: 'bridge',
              utterance_id: utteranceIdRef.current,
            })
            setPhaseSync('listening')
            connectStartRef.current = 0
            setBridgeDown(false)
            break
          case 'volume':
            setVolume(msg.level ?? 0)
            break
          case 'interim':
            if (msg.text !== lastInterimRef.current) {
              if (!firstInterimRef.current) {
                firstInterimRef.current = true
                onTraceRef.current?.('asr_first_interim', {
                  first_interim_ms: listeningStartRef.current > 0 ? Date.now() - listeningStartRef.current : null,
                  mode: 'bridge',
                  utterance_id: utteranceIdRef.current,
                })
              }
              lastInterimRef.current = msg.text
              lastInterimTimeRef.current = Date.now()
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              onInterimRef.current(msg.text)
            }
            break
          case 'final':
            if (phaseRef.current !== 'processing') {
              lastConfidenceRef.current = normalizeConfidence(msg.confidence)
              triggerFinal(msg.text, { endpointReason: String(msg.endpoint_reason ?? 'bridge_final') })
              if (activeRef.current) setTimeout(() => startBridge(), 300)
            }
            break
          case 'error':
            onTraceRef.current?.('asr_error', {
              mode: 'bridge',
              reason: String(msg.msg ?? 'bridge_error').slice(0, 120),
            })
            console.warn('[STT] bridge error', msg.msg)
            if (activeRef.current) setTimeout(() => startBridge(), 500)
            break
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => {
      onTraceRef.current?.('asr_error', { mode: 'bridge', reason: 'websocket_error' })
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
    pendingFragmentRef.current = ''
    stopFragmentTimer()
    connectStartRef.current = 0
    listeningStartRef.current = 0
    firstInterimRef.current = false
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
    newUtteranceId()
    onTraceRef.current?.('asr_start_requested', { utterance_id: utteranceIdRef.current })

    // Auto-detect once per component lifetime — don't re-probe on every open
    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
      onTraceRef.current?.('asr_mode_selected', { mode: modeRef.current })
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
    active: activeRef,
    listening: phase === 'listening',
    connecting: phase === 'connecting',
  }
}
