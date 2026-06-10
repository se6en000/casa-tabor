import { useEffect, useRef } from 'react'

/**
 * Fires a `screensaver-on` DOM event after `ms` of inactivity.
 * Resets on any user interaction (touch, mouse, keyboard).
 */
export function useIdleTimer(ms: number) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function reset() {
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => {
        document.dispatchEvent(new CustomEvent('screensaver-on'))
      }, ms)
    }

    const events = ['mousemove', 'mousedown', 'touchstart', 'keydown', 'scroll', 'wheel']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset() // start timer immediately

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      events.forEach(e => window.removeEventListener(e, reset))
    }
  }, [ms])
}
