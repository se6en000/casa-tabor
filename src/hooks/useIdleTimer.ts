import { useEffect, useRef } from 'react'

const BRIDGE = 'http://127.0.0.1:8766'

/**
 * Fires `screensaver-on` after `screensaverMs` idle.
 * Fires display sleep (bridge /display/off) after `displayOffMs` idle.
 * Resets on any user interaction (touch, mouse, keyboard).
 */
export function useIdleTimer(screensaverMs: number, displayOffMs: number) {
  const ssTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const dispTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reset() {
      if (ssTimerRef.current)   clearTimeout(ssTimerRef.current)
      if (dispTimerRef.current) clearTimeout(dispTimerRef.current)

      if (isFinite(screensaverMs)) {
        ssTimerRef.current = setTimeout(() => {
          document.dispatchEvent(new CustomEvent('screensaver-on'))
        }, screensaverMs)
      }

      if (isFinite(displayOffMs)) {
        dispTimerRef.current = setTimeout(() => {
          fetch(`${BRIDGE}/display/off`, { method: 'POST' }).catch(() => {})
        }, displayOffMs)
      }
    }

    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll', 'wheel']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      if (ssTimerRef.current)   clearTimeout(ssTimerRef.current)
      if (dispTimerRef.current) clearTimeout(dispTimerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [screensaverMs, displayOffMs])
}
