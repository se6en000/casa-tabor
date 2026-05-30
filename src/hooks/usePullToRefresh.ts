import { useRef, useCallback, useEffect } from 'react'

interface Options {
  threshold?: number
  onRefresh: () => Promise<void> | void
  onPull?: (distance: number) => void
  onReset?: () => void
}

/**
 * Returns a `ref` callback — attach it to the scrollable container.
 * Uses imperative addEventListener({ passive: false }) so we can
 * call e.preventDefault() during a pull without browser warnings.
 */
export function usePullToRefresh({ threshold = 64, onRefresh, onPull, onReset }: Options) {
  const startY      = useRef<number | null>(null)
  const lastTravel  = useRef(0)
  const active      = useRef(false)

  // Keep latest callbacks in refs so the event listeners don't go stale
  const onRefreshRef = useRef(onRefresh)
  const onPullRef    = useRef(onPull)
  const onResetRef   = useRef(onReset)
  useEffect(() => { onRefreshRef.current = onRefresh }, [onRefresh])
  useEffect(() => { onPullRef.current    = onPull    }, [onPull])
  useEffect(() => { onResetRef.current   = onReset   }, [onReset])

  const elRef = useRef<HTMLElement | null>(null)

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const el = elRef.current
    if (!el || el.scrollTop > 2) return
    startY.current     = e.touches[0].clientY
    lastTravel.current = 0
    active.current     = false
  }, [])

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (startY.current === null) return
    const el = elRef.current
    if (!el || el.scrollTop > 2) {
      startY.current = null
      lastTravel.current = 0
      onResetRef.current?.()
      return
    }
    const delta = e.touches[0].clientY - startY.current
    if (delta <= 0) {
      lastTravel.current = 0
      onResetRef.current?.()
      return
    }
    const travel = Math.min(delta * 0.4, threshold * 1.5)
    lastTravel.current = travel
    active.current = true
    onPullRef.current?.(travel)
    if (travel > 4 && e.cancelable) e.preventDefault()   // only cancel if browser allows it
  }, [threshold])

  const handleTouchEnd = useCallback(async () => {
    if (!active.current) return
    const travel = lastTravel.current
    active.current     = false
    startY.current     = null
    lastTravel.current = 0
    onResetRef.current?.()
    if (travel >= threshold) {
      await onRefreshRef.current()
    }
  }, [threshold])

  // Attach/detach listeners when the element mounts/unmounts
  const containerRef = useCallback((el: HTMLElement | null) => {
    if (elRef.current) {
      elRef.current.removeEventListener('touchstart', handleTouchStart)
      elRef.current.removeEventListener('touchmove',  handleTouchMove)
      elRef.current.removeEventListener('touchend',   handleTouchEnd)
    }
    elRef.current = el
    if (el) {
      el.addEventListener('touchstart', handleTouchStart, { passive: true })
      el.addEventListener('touchmove',  handleTouchMove,  { passive: false })
      el.addEventListener('touchend',   handleTouchEnd,   { passive: true })
    }
  }, [handleTouchStart, handleTouchMove, handleTouchEnd])

  return containerRef
}
