import { useCallback, useEffect, useRef, useState } from 'react'
import { STT_TURN_PROTOCOL } from '../lib/sttTurnProtocol.mjs'

/**
 * Lightweight speech-to-text for filling a single text field (e.g. the grocery
 * quick-add input).
 *
 * Dual path, matching the rest of the app:
 *   • Pi kiosk (Chromium/X11): DeepGram bridge over WebSocket (127.0.0.1:8767).
 *     Sending {"type":"start", "turn_protocol":"candidate-v1", "utterance_id":"..."}
 *     activates the Pi hardware LED light strip into "Alive Mode".
 *   • Mobile / desktop browsers: the native Web Speech API.
 *
 * The consumer passes an `onText(fullText)` callback; the hook seeds from the
 * field's current value on start, then emits base + dictated (committed finals +
 * live interim) so the field updates in real time while active.
 */

const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

type DictationMode = 'unknown' | 'bridge' | 'webspeech'

function createUtteranceId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`
}

function joinWords(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ')
}

export function useFieldDictation({
  onText,
  onComplete,
  autoSubmitOnSilence = false,
  silenceTimeoutMs = 1500,
}: {
  onText: (fullText: string) => void
  onComplete?: (fullText: string) => void
  autoSubmitOnSilence?: boolean
  silenceTimeoutMs?: number
}) {
  const [listening, setListening] = useState(false)
  const activeRef = useRef(false)
  const modeRef = useRef<DictationMode>('unknown')
  const baseRef = useRef('')
  const committedRef = useRef('')
  const lastInterimRef = useRef('')
  const utteranceIdRef = useRef('')
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const onTextRef = useRef(onText)
  const onCompleteRef = useRef(onComplete)
  useEffect(() => {
    onTextRef.current = onText
    onCompleteRef.current = onComplete
  }, [onText, onComplete])

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null,
  ).current

  const supported = !IS_SAFE_MODE

  const triggerAutoSubmitIfReady = useCallback(() => {
    if (!autoSubmitOnSilence || !activeRef.current) return
    clearSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (!activeRef.current) return
      const fullText = joinWords(baseRef.current, committedRef.current, lastInterimRef.current).trim()
      if (fullText) {
        stopWebSpeech()
        stopWS()
        activeRef.current = false
        setListening(false)
        emit('')
        onCompleteRef.current?.(fullText)
      }
    }, silenceTimeoutMs)
  }, [autoSubmitOnSilence, clearSilenceTimer, silenceTimeoutMs])

  const emit = useCallback((interim = '') => {
    lastInterimRef.current = interim
    onTextRef.current(joinWords(baseRef.current, committedRef.current, interim))
    if (interim.trim()) {
      triggerAutoSubmitIfReady()
    }
  }, [triggerAutoSubmitIfReady])

  const commitFinal = useCallback((text: string) => {
    const clean = text.trim()
    if (!clean) return
    committedRef.current = joinWords(committedRef.current, clean)
    lastInterimRef.current = ''
    emit('')
    triggerAutoSubmitIfReady()
  }, [emit, triggerAutoSubmitIfReady])

  // ── Web Speech API path (mobile / desktop fallback) ──────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    modeRef.current = 'webspeech'
    const recognition = new WebSpeech()
    recognitionRef.current = recognition
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onresult = (event: any) => {
      let interim = ''
      let finalAccum = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const t = event.results[i][0].transcript
        if (event.results[i].isFinal) finalAccum += t
        else interim += t
      }
      if (finalAccum.trim()) commitFinal(finalAccum)
      if (interim.trim()) emit(interim)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      clearSilenceTimer()
      activeRef.current = false
      setListening(false)
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.warn('[FieldDictation] webspeech error', e.error)
    }

    recognition.onend = () => {
      clearSilenceTimer()
      const wasActive = activeRef.current
      activeRef.current = false
      setListening(false)
      emit('')
      if (autoSubmitOnSilence && wasActive) {
        const fullText = joinWords(baseRef.current, committedRef.current).trim()
        if (fullText) {
          onCompleteRef.current?.(fullText)
        }
      }
    }

    try { recognition.start() } catch { /* ignore */ }
  }, [WebSpeech, autoSubmitOnSilence, clearSilenceTimer, commitFinal, emit])

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null } catch { /* ignore */ }
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  // ── Bridge path (Pi kiosk with hardware LED Alive Mode) ───────────────────
  const stopWS = useCallback(() => {
    if (wsRef.current) {
      try {
        if (wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(JSON.stringify({ type: 'stop' }))
        }
      } catch { /* ignore */ }
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }, [])

  const startBridgeRef = useRef<() => void>(() => {})
  const startBridge = useCallback(() => {
    if (!activeRef.current) return
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }

    try {
      const ws = new WebSocket(BRIDGE_WS)
      wsRef.current = ws

      ws.onopen = () => {
        modeRef.current = 'bridge'
        // Sending this packet tells the Pi daemon to trigger the hardware LED light strip "Alive Mode"
        try {
          ws.send(JSON.stringify({
            type: 'start',
            turn_protocol: STT_TURN_PROTOCOL,
            utterance_id: utteranceIdRef.current,
          }))
        } catch { /* ignore */ }
      }

      ws.onmessage = (evt) => {
        if (!activeRef.current) return
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.type === 'interim' && typeof msg.text === 'string') {
            emit(msg.text)
          } else if (msg.type === 'turn') {
            const combined = joinWords(msg.committed ?? '', msg.interim ?? '')
            emit(combined)
          } else if (msg.type === 'segment_final' && typeof msg.text === 'string') {
            commitFinal(msg.text)
          } else if (msg.type === 'final' && typeof msg.text === 'string') {
            commitFinal(msg.text)
          }
        } catch { /* ignore */ }
      }

      ws.onerror = () => {
        // If bridge is unreachable (non-Pi device like phone/Mac), fall back to WebSpeech
        if (activeRef.current && modeRef.current !== 'bridge') {
          modeRef.current = 'webspeech'
          startWebSpeech()
        }
      }

      ws.onclose = () => {
        wsRef.current = null
        if (activeRef.current && modeRef.current === 'bridge') {
          setTimeout(() => startBridgeRef.current(), 400)
        }
      }
    } catch {
      // Direct WS creation error fallback
      modeRef.current = 'webspeech'
      startWebSpeech()
    }
  }, [commitFinal, emit, startWebSpeech])

  useEffect(() => {
    startBridgeRef.current = startBridge
  }, [startBridge])

  // ── Unified control ──────────────────────────────────────────────────────
  const stop = useCallback((): string => {
    clearSilenceTimer()
    const captured = joinWords(baseRef.current, committedRef.current, lastInterimRef.current).trim()
    if (!activeRef.current) return captured
    activeRef.current = false
    setListening(false)
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopWS()
    emit('') // settle field to base + committed, drop trailing interim
    return captured
  }, [clearSilenceTimer, stopWebSpeech, stopWS, emit])

  const start = useCallback(async (seed: string) => {
    if (activeRef.current || IS_SAFE_MODE) return
    clearSilenceTimer()
    baseRef.current = seed.trim()
    committedRef.current = ''
    lastInterimRef.current = ''
    utteranceIdRef.current = createUtteranceId()
    activeRef.current = true
    setListening(true)

    // If we know mode is webspeech (e.g. previously confirmed no bridge on client), use it directly
    if (modeRef.current === 'webspeech') {
      startWebSpeech()
    } else {
      // Prioritize the Pi WebSocket bridge (activates hardware LED Alive Mode)
      startBridge()
    }
  }, [clearSilenceTimer, startBridge, startWebSpeech])

  const toggle = useCallback((seed: string) => {
    if (activeRef.current) stop()
    else void start(seed)
  }, [start, stop])

  const resetBuffer = useCallback((seed = '') => {
    clearSilenceTimer()
    baseRef.current = seed.trim()
    committedRef.current = ''
    lastInterimRef.current = ''
  }, [clearSilenceTimer])

  useEffect(() => {
    return () => {
      clearSilenceTimer()
      activeRef.current = false
      stopWebSpeech()
      stopWS()
    }
  }, [clearSilenceTimer, stopWebSpeech, stopWS])

  return { supported, listening, start, stop, toggle, resetBuffer }
}
