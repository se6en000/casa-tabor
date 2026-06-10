import { useCallback, useRef } from 'react'

const SENSOR_BRIDGE = 'http://127.0.0.1:8765'

type LedMode = 'listening' | 'processing' | 'confirm' | 'cancel' | 'off'

function callLed(mode: LedMode) {
  fetch(`${SENSOR_BRIDGE}/led/${mode}`, { method: 'POST' }).catch(() => {})
}

/**
 * Controls the WS2812B LED strip via sensor-bridge.
 * Silently no-ops when the bridge isn't reachable (non-Pi environments).
 */
export function useLedStrip() {
  const currentMode = useRef<LedMode>('off')

  const setMode = useCallback((mode: LedMode) => {
    if (currentMode.current === mode) return
    currentMode.current = mode
    callLed(mode)
  }, [])

  return {
    listening:  () => setMode('listening'),
    processing: () => setMode('processing'),
    confirm:    () => setMode('confirm'),
    cancel:     () => setMode('cancel'),
    off:        () => setMode('off'),
  }
}
