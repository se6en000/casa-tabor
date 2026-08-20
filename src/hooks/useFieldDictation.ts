import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Lightweight speech-to-text for dictating into input fields (e.g. quick-add sheets).
 *
 * Dual path:
 *   • Pi kiosk (Chromium/Linux): Local DeepGram/Whisper bridge over WebSocket (ws://127.0.0.1:8767).
 *   • Mobile / Mac / PC browsers: Native Web Speech API.
 *
 * Ergonomics:
 *   • Push-to-Talk: Hold down mic (pointerdown) -> speak -> release (pointerup) to stop & parse.
 *   • Tap-to-Talk: Click to start -> speak -> auto-stops after 1.8s silence (or tap again to stop).
 */

const BRIDGE = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'
const SILENCE_TIMEOUT_MS = 1800

type DictationMode = 'unknown' | 'bridge' | 'webspeech'

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

function joinWords(...parts: string[]): string {
  return parts.map((p) => p.trim()).filter(Boolean).join(' ')
}

export function useFieldDictation({
  onText,
  onFinal,
}: {
  onText: (fullText: string) => void
  onFinal?: (fullText: string) => void
}) {
  const [listening, setListening] = useState(false)
  const activeRef = useRef(false)
  const modeRef = useRef<DictationMode>('unknown')
  const baseRef = useRef('')
  const committedRef = useRef('')
  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const onTextRef = useRef(onText)
  const onFinalRef = useRef(onFinal)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])
  useEffect(() => {
    onFinalRef.current = onFinal
  }, [onFinal])

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

  // ── Unified control ──────────────────────────────────────────────────────
  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null } catch { /* ignore */ }
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

  const stop = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setListening(false)
    stopSilenceTimer()

    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopWS()

    const finalFull = emit('')
    onFinalRef.current?.(finalFull)
  }, [stopSilenceTimer, stopWebSpeech, stopWS, emit])

  const restartSilenceTimer = useCallback(() => {
    stopSilenceTimer()
    silenceTimerRef.current = setTimeout(() => {
      if (activeRef.current) {
        stop()
      }
    }, SILENCE_TIMEOUT_MS)
  }, [stopSilenceTimer, stop])

  const commitFinal = useCallback((text: string) => {
    const clean = text.trim()
    if (!clean) return
    committedRef.current = joinWords(committedRef.current, clean)
    emit('')
    restartSilenceTimer()
  }, [emit, restartSilenceTimer])

  // ── Web Speech API path (mobile / desktop) ──────────────────────────────
  const startWebSpeech = useCallback(() => {
    if (!WebSpeech || !activeRef.current) return
    if (recognitionRef.current) {
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
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
      if (interim.trim()) {
        emit(interim)
        restartSilenceTimer()
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.warn('[FieldDictation] webspeech error', e.error)
    }

    recognition.onend = () => {
      // continuous can still end on silence — if user is still active, restart
      if (activeRef.current) {
        try { recognition.start() } catch { /* ignore */ }
      }
    }

    try { recognition.start() } catch { /* ignore */ }
  }, [WebSpeech, commitFinal, emit, restartSilenceTimer])

  // ── Bridge path (Pi kiosk) ───────────────────────────────────────────────
  const startBridgeRef = useRef<() => void>(() => {})
  const startBridge = useCallback(() => {
    if (!activeRef.current) return
    if (wsRef.current) {
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
    const ws = new WebSocket(BRIDGE_WS)
    wsRef.current = ws

    ws.onopen = () => {
      try { ws.send(JSON.stringify({ type: 'start' })) } catch { /* ignore */ }
    }

    ws.onmessage = (evt) => {
      if (!activeRef.current) return
      try {
        const msg = JSON.parse(evt.data as string)
        if (msg.type === 'interim' && typeof msg.text === 'string') {
          emit(msg.text)
          restartSilenceTimer()
        } else if (msg.type === 'final' && typeof msg.text === 'string') {
          // If bridge returns cumulative text in legacy mode, replace committedRef
          committedRef.current = msg.text.trim()
          emit('')
          restartSilenceTimer()
        } else if (msg.type === 'transcript' && typeof msg.text === 'string') {
          if (msg.is_final) {
            committedRef.current = msg.text.trim()
            emit('')
          } else {
            emit(msg.interim || msg.text)
          }
          restartSilenceTimer()
        }
      } catch { /* ignore */ }
    }

    ws.onerror = () => { /* surfaced via close/retry */ }

    ws.onclose = () => {
      wsRef.current = null
      if (activeRef.current) setTimeout(() => startBridgeRef.current(), 400)
    }
  }, [emit, restartSilenceTimer])
  useEffect(() => { startBridgeRef.current = startBridge }, [startBridge])

  const start = useCallback(async (seed: string) => {
    if (activeRef.current || IS_SAFE_MODE) return
    baseRef.current = seed.trim()
    committedRef.current = ''
    activeRef.current = true
    setListening(true)
    restartSilenceTimer()

    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
    }
    if (!activeRef.current) return

    if (modeRef.current === 'webspeech') startWebSpeech()
    else startBridge()
  }, [WebSpeech, startWebSpeech, startBridge, restartSilenceTimer])

  const toggle = useCallback((seed: string) => {
    if (activeRef.current) stop()
    else void start(seed)
  }, [start, stop])

  const resetBuffer = useCallback((seed = '') => {
    baseRef.current = seed.trim()
    committedRef.current = ''
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
