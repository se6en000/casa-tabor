import { useEffect, useRef, type RefObject } from 'react'
import { swipeStep, wheelSwipe, type DayStep, type TouchPoint, type WheelState } from './daySwipe'

/**
 * Swipe between days on an element: a touch (the wall's touchscreen, a phone) decided when the
 * finger lifts, and a trackpad's two-finger swipe (the desktop). Only start and end are listened
 * to — no move handler — and the click a swipe would otherwise leave behind is swallowed, so a
 * swipe that began on an event never opens it.
 */
export function useDaySwipe(ref: RefObject<HTMLElement | null>, onStep: (step: DayStep) => void, { enabled, minDistance }: { enabled: boolean; minDistance: number }) {
  const latest = useRef(onStep)
  useEffect(() => { latest.current = onStep })

  useEffect(() => {
    const el = ref.current
    if (!el || !enabled) return
    let start: TouchPoint | null = null
    let swallowUntil = 0
    let wheel: WheelState | null = null

    const onTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      start = e.touches.length === 1 && touch ? { x: touch.clientX, y: touch.clientY, t: e.timeStamp } : null
    }
    const onTouchEnd = (e: TouchEvent) => {
      const touch = e.changedTouches[0]
      if (!start || !touch) return
      const step = swipeStep(start, { x: touch.clientX, y: touch.clientY, t: e.timeStamp }, { minDistance })
      start = null
      if (!step) return
      swallowUntil = e.timeStamp + 450
      latest.current(step)
    }
    const onClick = (e: MouseEvent) => {
      if (e.timeStamp > swallowUntil) return
      e.stopPropagation()
      e.preventDefault()
    }
    const onWheel = (e: WheelEvent) => {
      const r = wheelSwipe(wheel, { deltaX: e.deltaX, deltaY: e.deltaY, t: e.timeStamp })
      wheel = r.state
      if (r.step) latest.current(r.step)
    }

    el.addEventListener('touchstart', onTouchStart, { passive: true })
    el.addEventListener('touchend', onTouchEnd, { passive: true })
    el.addEventListener('click', onClick, { capture: true })
    el.addEventListener('wheel', onWheel, { passive: true })
    return () => {
      el.removeEventListener('touchstart', onTouchStart)
      el.removeEventListener('touchend', onTouchEnd)
      el.removeEventListener('click', onClick, { capture: true })
      el.removeEventListener('wheel', onWheel)
    }
  }, [ref, enabled, minDistance])
}
