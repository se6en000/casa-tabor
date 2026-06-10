import { useCallback, useRef } from 'react'

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

  const setMode = useCallback((mode: LedMode) => {
    if (currentMode.current === mode) return
    currentMode.current = mode
    callLed(mode)
  }, [])

  const setFeedback = useCallback((mode: 'confirm' | 'cancel') => {
    // Lock out phase sync for the duration of the burst
    lockedUntil.current = Date.now() + FEEDBACK_LOCK_MS
    currentMode.current = mode
    callLed(mode)
  }, [])

  const setPhaseMode = useCallback((mode: LedMode) => {
    if (Date.now() < lockedUntil.current) return  // locked — feedback animating
    setMode(mode)
  }, [setMode])

  return {
    listening:  () => setPhaseMode('listening'),
    processing: () => setPhaseMode('processing'),
    confirm:    () => setFeedback('confirm'),
    cancel:     () => setFeedback('cancel'),
    off:        () => setPhaseMode('off'),
  }
}
