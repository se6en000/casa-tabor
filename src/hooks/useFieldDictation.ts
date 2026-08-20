import { useCallback, useEffect, useRef, useState } from 'react'
import { STT_TURN_PROTOCOL } from '../lib/sttTurnProtocol.mjs'

/**
 * Lightweight speech-to-text for dictating into input fields (e.g. quick-add sheets, ambient capture).
 *
 * Dual path:
 *   • Pi kiosk (Chromium/Linux): Local DeepGram/Whisper bridge over WebSocket (ws://127.0.0.1:8767).
 *     Sending {"type":"start", "turn_protocol":"candidate-v1", "utterance_id":"..."}
 *     activates the Pi hardware LED light strip into "Alive Mode".
 *   • Mobile / Mac / PC browsers: Native Web Speech API fallback.
 *
 * Ergonomics:
 *   • Push-to-Talk: Hold down mic -> speak -> release to stop & parse.
 *   • Tap-to-Talk: Tap to start -> speak -> auto-stops after silence (or tap again to stop).
 */

const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'
const INITIAL_SPEECH_TIMEOUT_MS = 10000 // 10s grace period waiting for user to start speaking
const DEFAULT_SILENCE_TIMEOUT_MS = 4500  // 4.5s silence after speech before closing

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
  onFinal,
  onComplete,
  autoSubmitOnSilence = false,
  silenceTimeoutMs = DEFAULT_SILENCE_TIMEOUT_MS,
}: {
  onText: (fullText: string) => void
  onFinal?: (fullText: string) => void
  onComplete?: (fullText: string) => void
  autoSubmitOnSilence?: boolean
  silenceTimeoutMs?: number
}) {
  const [listening, setListening] = useState(false)
  const activeRef = useRef(false)
  const modeRef = useRef<DictationMode>('unknown')
  const baseRef = useRef('')
  const committedRef = useRef('')
  const utteranceIdRef = useRef('')
  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasSpokenRef = useRef(false)

  const onTextRef = useRef(onText)
  const onFinalRef = useRef(onFinal || onComplete)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])
  useEffect(() => {
    onFinalRef.current = onFinal || onComplete
  }, [onFinal, onComplete])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null,
  ).current

  const supported = !IS_SAFE_MODE

  const stopSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
  }, [])

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null } catch { /* ignore */ }
      try { recognitionRef.current.onerror = null } catch { /* ignore */ }
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  const stopWS = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch { /* ignore */ }
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }, [])

  const emit = useCallback((interim = '') => {
    const full = joinWords(baseRef.current, committedRef.current, interim)
    onTextRef.current(full)
    return full
  }, [])

  const stop = useCallback((): string => {
    if (!activeRef.current) return ''
    activeRef.current = false
    setListening(false)
    stopSilenceTimer()

    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopWS()

    const finalFull = emit('')
    onFinalRef.current?.(finalFull)
    return finalFull
  }, [stopSilenceTimer, stopWebSpeech, stopWS, emit])

  const restartSilenceTimer = useCallback((timeout = silenceTimeoutMs) => {
    stopSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (activeRef.current) {
        const finalText = stop()
        if (autoSubmitOnSilence && finalText) {
          onFinalRef.current?.(finalText)
        }
      }
    }, timeout)
  }, [stopSilenceTimer, stop, autoSubmitOnSilence, silenceTimeoutMs])

  const commitFinal = useCallback((text: string) => {
    const clean = text.trim()
    if (!clean) return
    hasSpokenRef.current = true
    committedRef.current = joinWords(committedRef.current, clean)
    emit('')
    restartSilenceTimer(silenceTimeoutMs)
  }, [emit, restartSilenceTimer, silenceTimeoutMs])

  // ── Web Speech API path (mobile / desktop fallback) ──────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
    try {
      const recognition = new WebSpeech()
      recognitionRef.current = recognition
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onresult = (event: any) => {
        hasSpokenRef.current = true
        let interim = ''
        let finalAccum = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const t = event.results[i][0].transcript
          if (event.results[i].isFinal) finalAccum += t
          else interim += t
        }
        if (finalAccum.trim()) commitFinal(finalAccum)
        if (interim.trim()) {
          emit(interim)
          restartSilenceTimer(silenceTimeoutMs)
        }
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recognition.onerror = (e: any) => {
        if (e.error === 'no-speech' || e.error === 'aborted') return
        console.warn('[FieldDictation] webspeech error', e.error)
      }

      recognition.onend = () => {
        if (activeRef.current) {
          try { recognition.start() } catch { /* ignore */ }
        }
      }

      recognition.start()
    } catch (e) {
      console.warn('[FieldDictation] failed to start WebSpeech', e)
    }
  }, [WebSpeech, commitFinal, emit, restartSilenceTimer, silenceTimeoutMs])

  // ── Bridge path (Pi kiosk WebSocket) ───────────────────────────────────
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
        if (!activeRef.current) {
          try { ws.close() } catch { /* ignore */ }
          return
        }
        modeRef.current = 'bridge'
        utteranceIdRef.current = createUtteranceId()
        try {
          ws.send(
            JSON.stringify({
              type: 'start',
              turn_protocol: STT_TURN_PROTOCOL,
              utterance_id: utteranceIdRef.current,
            }),
          )
        } catch { /* ignore */ }
      }

      ws.onmessage = (evt) => {
        if (!activeRef.current) return
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.type === 'speech_started') {
            hasSpokenRef.current = true
            restartSilenceTimer(silenceTimeoutMs)
          } else if (msg.type === 'interim' && typeof msg.text === 'string') {
            hasSpokenRef.current = true
            emit(msg.text)
            restartSilenceTimer(silenceTimeoutMs)
          } else if (msg.type === 'final' && typeof msg.text === 'string') {
            hasSpokenRef.current = true
            committedRef.current = msg.text.trim()
            emit('')
            restartSilenceTimer(silenceTimeoutMs)
          } else if (msg.type === 'turn_candidate' && typeof msg.text === 'string') {
            hasSpokenRef.current = true
            committedRef.current = msg.text.trim()
            emit('')
            restartSilenceTimer(silenceTimeoutMs)
          } else if (msg.type === 'segment_final' && typeof msg.text === 'string') {
            hasSpokenRef.current = true
            committedRef.current = msg.text.trim()
            emit('')
            restartSilenceTimer(silenceTimeoutMs)
          } else if (msg.type === 'transcript' && typeof msg.text === 'string') {
            hasSpokenRef.current = true
            if (msg.is_final) {
              committedRef.current = msg.text.trim()
              emit('')
            } else {
              emit(msg.interim || msg.text)
            }
            restartSilenceTimer(silenceTimeoutMs)
          }
        } catch { /* ignore */ }
      }

      ws.onerror = () => {
        // If WebSocket bridge is not available and we're still in 'unknown' mode, fallback to WebSpeech
        if (modeRef.current === 'unknown' && activeRef.current && WebSpeech) {
          modeRef.current = 'webspeech'
          startWebSpeech()
        }
      }

      ws.onclose = () => {
        wsRef.current = null
      }
    } catch {
      if (modeRef.current === 'unknown' && activeRef.current && WebSpeech) {
        modeRef.current = 'webspeech'
        startWebSpeech()
      }
    }
  }, [emit, restartSilenceTimer, silenceTimeoutMs, WebSpeech, startWebSpeech])

  const start = useCallback((seed: string) => {
    if (activeRef.current || IS_SAFE_MODE) return
    baseRef.current = seed.trim()
    committedRef.current = ''
    hasSpokenRef.current = false
    activeRef.current = true
    setListening(true)

    // Give a generous initial grace period waiting for user to start speaking
    restartSilenceTimer(INITIAL_SPEECH_TIMEOUT_MS)

    if (modeRef.current === 'webspeech') {
      startWebSpeech()
    } else {
      // Default to trying the high-performance Pi hardware bridge first
      startBridge()
    }
  }, [startWebSpeech, startBridge, restartSilenceTimer])

  const toggle = useCallback((seed: string): string | void => {
    if (activeRef.current) return stop()
    void start(seed)
  }, [start, stop])

  const resetBuffer = useCallback((seed = '') => {
    baseRef.current = seed.trim()
    committedRef.current = ''
    hasSpokenRef.current = false
  }, [])

  useEffect(() => {
    return () => {
      activeRef.current = false
      stopSilenceTimer()
      stopWebSpeech()
      stopWS()
    }
  }, [stopSilenceTimer, stopWebSpeech, stopWS])

  return { supported, listening, start, stop, toggle, resetBuffer }
}
