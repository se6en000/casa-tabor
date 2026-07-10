import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Lightweight speech-to-text for filling a single text field (e.g. the grocery
 * quick-add input). Unlike useSpeechInput — which is built for the conversational
 * AI drawer (confirm/cancel/dismiss phrases, auto-send) — this hook just streams
 * recognized words into a field and stays out of the way.
 *
 * Dual path, matching the rest of the app:
 *   • Pi kiosk (Chromium/X11): DeepGram bridge over WebSocket (127.0.0.1:8767).
 *   • Mobile / desktop browsers: the native Web Speech API.
 *
 * The consumer passes an `onText(fullText)` callback; the hook seeds from the
 * field's current value on start, then emits base + dictated (committed finals +
 * live interim) so the field updates in real time while the sheet stays open.
 */

const BRIDGE = 'http://127.0.0.1:8766'
const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

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

export function useFieldDictation({ onText }: { onText: (fullText: string) => void }) {
  const [listening, setListening] = useState(false)
  const activeRef = useRef(false)
  const modeRef = useRef<DictationMode>('unknown')
  const baseRef = useRef('')
  const committedRef = useRef('')
  const wsRef = useRef<WebSocket | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null)

  const onTextRef = useRef(onText)
  useEffect(() => {
    onTextRef.current = onText
  }, [onText])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const WebSpeech = useRef<any>(
    typeof window !== 'undefined'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition ?? null)
      : null,
  ).current

  const supported = !IS_SAFE_MODE

  const emit = useCallback((interim = '') => {
    onTextRef.current(joinWords(baseRef.current, committedRef.current, interim))
  }, [])

  const commitFinal = useCallback((text: string) => {
    const clean = text.trim()
    if (!clean) return
    committedRef.current = joinWords(committedRef.current, clean)
    emit('')
  }, [emit])

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
      if (interim.trim()) emit(interim)
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recognition.onerror = (e: any) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return
      console.warn('[FieldDictation] webspeech error', e.error)
    }

    recognition.onend = () => {
      // continuous can still end on silence — restart while the user is holding
      // the mic open so a paused speaker can keep going.
      if (activeRef.current) {
        try { recognition.start() } catch { /* ignore */ }
      }
    }

    try { recognition.start() } catch { /* ignore */ }
  }, [WebSpeech, commitFinal, emit])

  const stopWebSpeech = useCallback(() => {
    if (recognitionRef.current) {
      try { recognitionRef.current.onend = null } catch { /* ignore */ }
      try { recognitionRef.current.stop() } catch { /* ignore */ }
      recognitionRef.current = null
    }
  }, [])

  // ── Bridge path (Pi kiosk) ───────────────────────────────────────────────
  const stopWS = useCallback(() => {
    if (wsRef.current) {
      try { wsRef.current.send(JSON.stringify({ type: 'stop' })) } catch { /* ignore */ }
      try { wsRef.current.close() } catch { /* ignore */ }
      wsRef.current = null
    }
  }, [])

  // Ref indirection lets ws.onclose re-invoke the latest startBridge for
  // reconnect without a self-referential closure (which the compiler rejects).
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
        if (msg.type === 'interim' && typeof msg.text === 'string') emit(msg.text)
        else if (msg.type === 'final' && typeof msg.text === 'string') commitFinal(msg.text)
      } catch { /* ignore */ }
    }

    ws.onerror = () => { /* surfaced via close/retry */ }

    ws.onclose = () => {
      wsRef.current = null
      // Reconnect while the user is still dictating.
      if (activeRef.current) setTimeout(() => startBridgeRef.current(), 400)
    }
  }, [commitFinal, emit])
  useEffect(() => { startBridgeRef.current = startBridge }, [startBridge])

  // ── Unified control ──────────────────────────────────────────────────────
  const stop = useCallback(() => {
    if (!activeRef.current) return
    activeRef.current = false
    setListening(false)
    if (modeRef.current === 'webspeech') stopWebSpeech()
    else stopWS()
    emit('') // settle field to base + committed, drop trailing interim
  }, [stopWebSpeech, stopWS, emit])

  const start = useCallback(async (seed: string) => {
    if (activeRef.current || IS_SAFE_MODE) return
    baseRef.current = seed.trim()
    committedRef.current = ''
    activeRef.current = true
    setListening(true)

    if (modeRef.current === 'unknown') {
      const hasBridge = await probeBridge()
      modeRef.current = hasBridge ? 'bridge' : (WebSpeech ? 'webspeech' : 'bridge')
    }
    // A late stop() during the async probe should abort the launch.
    if (!activeRef.current) return

    if (modeRef.current === 'webspeech') startWebSpeech()
    else startBridge()
  }, [WebSpeech, startWebSpeech, startBridge])

  const toggle = useCallback((seed: string) => {
    if (activeRef.current) stop()
    else void start(seed)
  }, [start, stop])

  useEffect(() => {
    return () => {
      activeRef.current = false
      stopWebSpeech()
      stopWS()
    }
  }, [stopWebSpeech, stopWS])

  return { supported, listening, start, stop, toggle }
}
