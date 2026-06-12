import { useCallback, useEffect, useRef } from 'react'

const SENSOR_BRIDGE = 'http://127.0.0.1:8765'
const FEEDBACK_LOCK_MS = 2800  // how long confirm/cancel block phase sync

type LedMode = 'listening' | 'processing' | 'confirm' | 'cancel' | 'off'

function callLed(mode: LedMode) {
  fetch(`${SENSOR_BRIDGE}/led/${mode}`, { method: 'POST' }).catch(() => {})
}

/**
 * Controls the WS2812B LED strip via sensor-bridge.
 * confirm() and cancel() lock out phase-driven updates for FEEDBACK_LOCK_MS
 * so the burst animation always completes before returning to listening.
 */
export function useLedStrip() {
  const currentMode  = useRef<LedMode>('off')
  const lockedUntil  = useRef<number>(0)
  const desiredMode  = useRef<LedMode>('off')
  const unlockTimer  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setMode = useCallback((mode: LedMode) => {
    if (currentMode.current === mode) return
    currentMode.current = mode
    callLed(mode)
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

  useEffect(() => {
    return () => {
      if (unlockTimer.current) clearTimeout(unlockTimer.current)
    }
  }, [])

  return {
    listening:  () => setPhaseMode('listening'),
    processing: () => setPhaseMode('processing'),
    confirm:    () => setFeedback('confirm'),
    cancel:     () => setFeedback('cancel'),
    off:        () => {
      desiredMode.current = 'off'
      lockedUntil.current = 0
      if (unlockTimer.current) clearTimeout(unlockTimer.current)
      unlockTimer.current = null
      setMode('off')
    },
  }
}
