import { useRef, type PointerEvent, type TouchEvent } from 'react'
import { isSwipeDown } from './assistant'

/**
 * A swipe down to close (the band, the email review). Jake, 2026-09-30: "swiping down on the AI drawer doesn't do
 * anything" — on the wall's touchscreen Chromium takes a finger's drag over as a pan and sends pointercancel, not
 * pointerup, so the pointer alone never saw the end of the swipe. Touch is read from touch events (touchend still
 * comes); a mouse from pointer events. Put `touch-none` on the element too, so the browser doesn't claim the drag.
 */
export function useSwipeDown(onSwipe: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const end = (x: number, y: number) => {
    const s = start.current
    start.current = null
    if (s && isSwipeDown(s, { x, y, t: Date.now() })) onSwipe()
  }
  return {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== 'touch') start.current = { x: e.clientX, y: e.clientY, t: Date.now() } },
    onPointerUp: (e: PointerEvent) => { if (e.pointerType !== 'touch') end(e.clientX, e.clientY) },
    onTouchStart: (e: TouchEvent) => { const p = e.touches[0]; if (p) start.current = { x: p.clientX, y: p.clientY, t: Date.now() } },
    onTouchEnd: (e: TouchEvent) => { const p = e.changedTouches[0]; if (p) end(p.clientX, p.clientY) },
    onTouchCancel: () => { start.current = null },
  }
}
