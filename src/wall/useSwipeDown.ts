import { useRef, useState, type MouseEvent, type PointerEvent, type TouchEvent, type WheelEvent } from 'react'
import { isSwipeDown } from './assistant'
import { paperDrag, paperSwipe } from './paper'
import { wheelSwipe, type WheelState } from '../lib/daySwipe'

/**
 * A swipe down to close (the band, the email review). Jake, 2026-09-30: "swiping down on the AI drawer doesn't do
 * anything" — on the wall's touchscreen Chromium takes a finger's drag over as a pan and sends pointercancel, not
 * pointerup, so the pointer alone never saw the end of the swipe. Touch is read from touch events (touchend still
 * comes); a mouse from pointer events. Put `touch-none` on the element too, so the browser doesn't claim the drag.
 *
 * `dragY`: how far it's being pulled down right now (canvas 37a-3, Jake Oct 3: the band follows your hand, and springs
 * back if you let go early). Under 8 px it stays put, so a tap never wobbles it.
 */
export function useDragDown(onSwipe: () => void) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const [dragY, setDragY] = useState(0)
  const move = (y: number) => {
    const s = start.current
    if (!s) return
    const dy = y - s.y
    setDragY(dy > 8 ? dy : 0)
  }
  const end = (x: number, y: number) => {
    const s = start.current
    start.current = null
    setDragY(0)
    if (s && isSwipeDown(s, { x, y, t: Date.now() })) onSwipe()
  }
  const handlers = {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== 'touch') start.current = { x: e.clientX, y: e.clientY, t: Date.now() } },
    onPointerMove: (e: PointerEvent) => { if (e.pointerType !== 'touch') move(e.clientY) },
    onPointerUp: (e: PointerEvent) => { if (e.pointerType !== 'touch') end(e.clientX, e.clientY) },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType !== 'touch' && start.current) end(e.clientX, e.clientY) },
    onTouchStart: (e: TouchEvent) => { const p = e.touches[0]; if (p) start.current = { x: p.clientX, y: p.clientY, t: Date.now() } },
    onTouchMove: (e: TouchEvent) => { const p = e.touches[0]; if (p) move(p.clientY) },
    onTouchEnd: (e: TouchEvent) => { const p = e.changedTouches[0]; if (p) end(p.clientX, p.clientY) },
    onTouchCancel: () => { start.current = null; setDragY(0) },
  }
  return { handlers, dragY }
}

/** The swipe alone, for what doesn't follow the hand (the email review). */
export function useSwipeDown(onSwipe: () => void) {
  return useDragDown(onSwipe).handlers
}

/**
 * The paper's pages, turned sideways (canvas 72; Jake, Oct 8: "a left right swipe … I want to see how it will be on the
 * pi"). Touch from touch events and a mouse from pointer events, as above; `dragX` follows the hand (paperDrag), and a
 * drag never counts as a tap on what it started over.
 */
export function useDragSide(onTurn: (step: 1 | -1) => void, page: number, pages: number) {
  const start = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragged = useRef(false)
  const wheel = useRef<WheelState | null>(null)
  const [dragX, setDragX] = useState(0)
  const begin = (x: number, y: number) => { start.current = { x, y, t: Date.now() }; dragged.current = false }
  const move = (x: number, y: number) => {
    const s = start.current
    if (!s) return
    const d = paperDrag(x - s.x, y - s.y, page, pages)
    if (d) dragged.current = true
    setDragX(d)
  }
  const end = (x: number, y: number) => {
    const s = start.current
    start.current = null
    setDragX(0)
    if (!s) return
    const step = paperSwipe(s, { x, y, t: Date.now() })
    if (step && page + step >= 0 && page + step < pages) onTurn(step)
  }
  const handlers = {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== 'touch') begin(e.clientX, e.clientY) },
    onPointerMove: (e: PointerEvent) => { if (e.pointerType !== 'touch') move(e.clientX, e.clientY) },
    onPointerUp: (e: PointerEvent) => { if (e.pointerType !== 'touch') end(e.clientX, e.clientY) },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType !== 'touch' && start.current) end(e.clientX, e.clientY) },
    onTouchStart: (e: TouchEvent) => { const p = e.touches[0]; if (p) begin(p.clientX, p.clientY) },
    onTouchMove: (e: TouchEvent) => { const p = e.touches[0]; if (p) move(p.clientX, p.clientY) },
    onTouchEnd: (e: TouchEvent) => { const p = e.changedTouches[0]; if (p) end(p.clientX, p.clientY) },
    onTouchCancel: () => { start.current = null; setDragX(0) },
    // A trackpad's two-finger swipe (Jake tries the wall from his Mac), counted as the day swipe counts it.
    onWheel: (e: WheelEvent) => {
      const r = wheelSwipe(wheel.current, { deltaX: e.deltaX, deltaY: e.deltaY, t: e.timeStamp })
      wheel.current = r.state
      if (r.step && page + r.step >= 0 && page + r.step < pages) onTurn(r.step)
    },
    // The click a drag ends in (the mouse lets go over a button) isn't a tap.
    onClickCapture: (e: MouseEvent) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false } },
  }
  return { handlers, dragX }
}
