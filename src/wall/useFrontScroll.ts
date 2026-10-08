import { useCallback, useEffect, useRef, type MouseEvent, type PointerEvent, type TouchEvent, type WheelEvent } from 'react'
import { flingStep, rubberBand } from './paper'

/**
 * The paper's front page, scrolled by the wall itself (canvas 73A; Jake, Oct 8: "the shrink / expand should be very smooth
 * and very cool feeling"). The Pi's own touch scrolling janks, so the words move as the pages turn: a transform on the
 * GPU layer, written straight to the element each frame — no React render per frame. A finger (touch events) or the
 * mouse (pointer events) drags it, locked to up-and-down once it's clearly so, then it coasts and settles softly at the
 * ends (flingStep); a trackpad or wheel moves it directly. `onY` hears every position (the cards slim on it).
 */
export function useFrontScroll(max: number, onY: (y: number) => void) {
  const content = useRef<HTMLDivElement | null>(null)
  const y = useRef(0)
  const frame = useRef(0)
  const drag = useRef<{ x: number; y: number; from: number; axis: 'v' | 'h' | null; samples: Array<{ t: number; y: number }> } | null>(null)
  const dragged = useRef(false)
  const maxRef = useRef(max)
  const onYRef = useRef(onY)
  useEffect(() => { onYRef.current = onY }, [onY])

  const set = useCallback((v: number) => {
    y.current = v
    if (content.current) content.current.style.transform = `translate3d(0, ${-v}px, 0)`
    onYRef.current(v)
  }, [])
  const stop = useCallback(() => { if (frame.current) cancelAnimationFrame(frame.current); frame.current = 0 }, [])
  const coast = (v0: number) => {
    stop()
    let s = { y: y.current, v: v0 }
    let last = performance.now()
    const tick = (now: number) => {
      s = flingStep(s, now - last, maxRef.current)
      last = now
      set(s.y)
      frame.current = s.v === 0 && s.y >= 0 && s.y <= maxRef.current ? 0 : requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }
  /** Glide to a place (the arrow keys): a soft ease-out. */
  const glideTo = useCallback((target: number) => {
    stop()
    const from = y.current
    const to = Math.max(0, Math.min(maxRef.current, target))
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 420)
      set(from + (to - from) * (1 - Math.pow(1 - p, 3)))
      frame.current = p < 1 ? requestAnimationFrame(tick) : 0
    }
    frame.current = requestAnimationFrame(tick)
  }, [set, stop])
  const at = useCallback(() => y.current, [])

  // A shorter page (a new day, a resize): back inside it.
  useEffect(() => {
    maxRef.current = max
    if (y.current > max) glideTo(max)
  }, [max, glideTo])
  useEffect(() => stop, [stop])

  const begin = (px: number, py: number) => {
    stop()
    dragged.current = false
    drag.current = { x: px, y: py, from: y.current, axis: null, samples: [{ t: performance.now(), y: y.current }] }
  }
  const move = (px: number, py: number) => {
    const d = drag.current
    if (!d || maxRef.current <= 0) return
    const dx = px - d.x
    const dy = py - d.y
    // Sideways is the page turn's; up and down is this.
    if (!d.axis && Math.hypot(dx, dy) > 8) d.axis = Math.abs(dy) > Math.abs(dx) ? 'v' : 'h'
    if (d.axis !== 'v') return
    dragged.current = true
    const v = rubberBand(d.from - dy, maxRef.current)
    set(v)
    const now = performance.now()
    d.samples.push({ t: now, y: d.from - dy })
    while (d.samples.length > 2 && now - d.samples[0].t > 90) d.samples.shift()
  }
  const end = () => {
    const d = drag.current
    drag.current = null
    if (!d || d.axis !== 'v') return
    const a = d.samples[0]
    const b = d.samples[d.samples.length - 1]
    const v = b.t - a.t > 0 && performance.now() - b.t < 80 ? (b.y - a.y) / (b.t - a.t) : 0
    coast(Math.max(-4, Math.min(4, v)))
  }

  const handlers = {
    onPointerDown: (e: PointerEvent) => { if (e.pointerType !== 'touch') begin(e.clientX, e.clientY) },
    onPointerMove: (e: PointerEvent) => { if (e.pointerType !== 'touch' && drag.current) move(e.clientX, e.clientY) },
    onPointerUp: (e: PointerEvent) => { if (e.pointerType !== 'touch') end() },
    onPointerLeave: (e: PointerEvent) => { if (e.pointerType !== 'touch' && drag.current) end() },
    onTouchStart: (e: TouchEvent) => { const p = e.touches[0]; if (p) begin(p.clientX, p.clientY) },
    onTouchMove: (e: TouchEvent) => { const p = e.touches[0]; if (p) move(p.clientX, p.clientY) },
    onTouchEnd: () => end(),
    onTouchCancel: () => end(),
    onWheel: (e: WheelEvent) => {
      if (maxRef.current <= 0 || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      stop()
      set(Math.max(0, Math.min(maxRef.current, y.current + e.deltaY)))
    },
    // A scroll that ends over a button isn't a tap on it.
    onClickCapture: (e: MouseEvent) => { if (dragged.current) { e.stopPropagation(); e.preventDefault(); dragged.current = false } },
  }
  return { content, handlers, glideTo, at }
}
