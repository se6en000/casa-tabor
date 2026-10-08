import { useCallback, useEffect, useMemo, useRef } from 'react'

const SENSOR_BRIDGE = 'http://127.0.0.1:8765'
const FEEDBACK_LOCK_MS = 2800  // how long confirm/cancel block phase sync

type LedMode = 'listening' | 'closing' | 'processing' | 'waiting' | 'glow' | 'confirm' | 'cancel' | 'off'

/** `night`: the same moment in dim amber (the Family Wall's evening; P3.14). */
function callLed(mode: LedMode, night = false, glowLevel = 1) {
  // "closing": the listening light fading out over the follow-up window's last seconds (CLOSING_FADE_MS).
  // "glow": how bright, from Settings › The wall › Glow brightness (1 as designed).
  const params = [night ? 'night=true' : '', mode === 'closing' ? 'ms=5000' : '', mode === 'glow' ? `level=${glowLevel}` : ''].filter(Boolean).join('&')
  fetch(`${SENSOR_BRIDGE}/led/${mode}${params ? `?${params}` : ''}`, { method: 'POST' }).catch(() => {})
}

/**
 * Controls the WS2812B LED strip via sensor-bridge.
 * confirm() and cancel() lock out phase-driven updates for FEEDBACK_LOCK_MS
 * so the burst animation always completes before returning to listening.
 */
export function useLedStrip() {
  // What the strip is showing, day or night ("listening:night").
  const currentMode  = useRef<string>('off')
  const nightRef     = useRef(false)
  const lockedUntil  = useRef<number>(0)
  const desiredMode  = useRef<LedMode>('off')
  const unlockTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const glowLevel    = useRef(1)

  const setMode = useCallback((mode: LedMode) => {
    const shown = `${mode}${nightRef.current ? ':night' : ''}${mode === 'glow' ? `:${glowLevel.current}` : ''}`
    if (currentMode.current === shown) return
    currentMode.current = shown
    callLed(mode, nightRef.current, glowLevel.current)
  }, [])

  const setFeedback = useCallback((mode: 'confirm' | 'cancel') => {
    // Lock out phase sync for the duration of the burst
    lockedUntil.current = Date.now() + FEEDBACK_LOCK_MS
    setMode(mode)
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    unlockTimer.current = setTimeout(() => {
      lockedUntil.current = 0
      setMode(desiredMode.current)
    }, FEEDBACK_LOCK_MS + 25)
  }, [setMode])

  const setPhaseMode = useCallback((mode: LedMode) => {
    desiredMode.current = mode
    if (Date.now() < lockedUntil.current) return  // locked — feedback animating
    setMode(mode)
  }, [setMode])

  const off = useCallback(() => {
    desiredMode.current = 'off'
    lockedUntil.current = 0
    if (unlockTimer.current) clearTimeout(unlockTimer.current)
    unlockTimer.current = null
    setMode('off')
  }, [setMode])

  useEffect(() => {
    return () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current)
    }
  }, [])

  /** Day or night colours for what follows. */
  const setNight = useCallback((night: boolean) => { nightRef.current = night }, [])
  const waiting = useCallback(() => setPhaseMode('waiting'), [setPhaseMode])
  const glow = useCallback((level = 1) => { glowLevel.current = level; setPhaseMode('glow') }, [setPhaseMode])
  const listening = useCallback(() => setPhaseMode('listening'), [setPhaseMode])
  const processing = useCallback(() => setPhaseMode('processing'), [setPhaseMode])
  const closing = useCallback(() => setPhaseMode('closing'), [setPhaseMode])
  const confirm = useCallback(() => setFeedback('confirm'), [setFeedback])
  const cancel = useCallback(() => setFeedback('cancel'), [setFeedback])

  return useMemo(() => ({
    listening,
    closing,
    processing,
    waiting,
    glow,
    confirm,
    cancel,
    off,
    setNight,
  }), [listening, closing, processing, waiting, glow, confirm, cancel, off, setNight])
}
