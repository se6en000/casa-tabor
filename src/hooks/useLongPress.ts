import { useRef, useCallback } from 'react'

interface LongPressOptions {
  delay?: number          // ms before firing (default 500)
  moveThreshold?: number  // px movement that cancels (default 10)
  onFire: (x: number, y: number) => void
}

/**
 * Returns touch handlers that fire `onFire` after holding for `delay` ms
 * without moving more than `moveThreshold` px. Tap (quick lift) is not fired.
 */
export function useLongPress({ delay = 500, moveThreshold = 10, onFire }: LongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const origin = useRef<{ x: number; y: number } | null>(null)
  const fired = useRef(false)

  const cancel = () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    origin.current = null
    fired.current = false
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const t = e.touches[0]
    origin.current = { x: t.clientX, y: t.clientY }
    fired.current = false
    timer.current = setTimeout(() => {
      timer.current = null
      fired.current = true
      navigator.vibrate?.(30)
      if (origin.current) onFire(origin.current.x, origin.current.y)
    }, delay)
  }, [delay, onFire])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!timer.current || !origin.current) return
    const t = e.touches[0]
    const dist = Math.hypot(t.clientX - origin.current.x, t.clientY - origin.current.y)
    if (dist > moveThreshold) cancel()
  }, [moveThreshold])

  const onTouchEnd = useCallback(() => {
    cancel()
  }, [])

  return { onTouchStart, onTouchMove, onTouchEnd, wasFired: () => fired.current }
}
