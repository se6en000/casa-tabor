import { Check } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { haptic } from './haptic'
import { swipeAxis, swipeOutcome } from './swipe'

const SNOOZE_W = 148

interface Drag { x: number; y: number; base: number; id: number; axis: 'x' | 'y' | null; lastX: number; lastT: number; v: number }

/**
 * A to-do or chore on Today you swipe (canvas 46c; Jake, Oct 5: "can we do the swipe 46c? … right to done, swipe left
 * to snooze a day?"). Right: "Done" shows under it and turns brass (with a tick of haptic) at the point where letting
 * go finishes it — a third of the way, or a quick flick; less springs back. Left: Tomorrow and Later, tapped (a to-do
 * only). A tap is the card's own. Pointer events, so a finger, a mouse or a trackpad all swipe; up and down still
 * scroll the day.
 *
 * On an iPhone the day pager around it took the sideways drag (Jake, Oct 5, a screen recording: "the touch swipe
 * experience kinda sucks"): Safari doesn't let the card's touch-action stop a scroller beyond the day's own. So a
 * finger's move is also watched as a touch, and once it's plainly sideways the touch is kept from scrolling anything.
 */
export default function SwipeRow({ children, ticked, onDone, onSnooze, label, title, hint = false, onSwiped }: {
  children: ReactNode
  /** The to-do's name, for the done control a screen reader (or a test) uses in place of the swipe. */
  title: string
  /** The first one while the tip shows: it slides a little way right and back, showing what a swipe does. */
  hint?: boolean
  /** Any swipe that did something (the tip's done once one has). */
  onSwiped?: () => void
  ticked: boolean
  onDone: () => void
  onSnooze?: (days: number) => void
  label: string
}) {
  const ref = useRef<HTMLDivElement>(null)
  const drag = useRef<Drag | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  // A swipe ends with a click on what's under the finger: that click is the swipe's, not a tap.
  const swiped = useRef(false)
  const armedRef = useRef(false)
  const base = open ? -SNOOZE_W : 0
  const shown = dragging ? dx : base
  const width = () => ref.current?.offsetWidth ?? 360
  // The card's width, read when a swipe starts.
  const [w, setW] = useState(360)
  const armed = dragging && dx >= w / 3

  // The finger as a touch: decide sideways or not from where it started, and once sideways keep the page still.
  // Non-passive, so it can; React's touch handlers are passive.
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let start: { x: number; y: number } | null = null
    let axis: 'x' | 'y' | null = null
    const down = (e: TouchEvent) => { const t = e.touches[0]; start = t && e.touches.length === 1 ? { x: t.clientX, y: t.clientY } : null; axis = null }
    const move = (e: TouchEvent) => {
      const t = e.touches[0]
      if (!start || !t) return
      const mx = t.clientX - start.x
      const my = t.clientY - start.y
      axis ??= swipeAxis(mx, my)
      // Sideways, or not yet decided but leaning sideways: nothing else may scroll with it.
      if ((axis === 'x' || (axis === null && Math.abs(mx) > Math.abs(my))) && e.cancelable) e.preventDefault()
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: false })
    return () => { el.removeEventListener('touchstart', down); el.removeEventListener('touchmove', move) }
  }, [])

  useEffect(() => {
    if (armed !== armedRef.current) { armedRef.current = armed; if (armed) haptic() }
  }, [armed])

  return (
    <div className="relative overflow-hidden rounded-[16px]" aria-label={label}>
      <button type="button" role="checkbox" aria-checked={ticked} aria-label={`Done: ${title}`} onClick={onDone} className="sr-only" />
      {(shown > 0 || hint) && (
        <div aria-hidden="true" className={`absolute inset-0 flex items-center gap-[8px] rounded-[16px] pl-[22px] text-phone-body font-bold transition-colors duration-150 ${armed || hint ? 'bg-wall-brass text-wall-on-pigment' : 'bg-wall-stone text-wall-ink-2'}`}>
          <Check size={20} strokeWidth={3} className={`transition-transform duration-150 ${armed ? 'scale-125' : ''}`} /> {ticked ? 'Not done' : 'Done'}
        </div>
      )}
      {onSnooze && (shown < 0 || open) && (
        <div className="absolute inset-y-0 right-0 flex">
          <button type="button" onClick={() => { setOpen(false); onSnooze(1) }} className="flex w-[74px] items-center justify-center border-0 bg-wall-brass p-0 text-phone-label font-bold text-wall-on-pigment">Tomorrow</button>
          <button type="button" onClick={() => { setOpen(false); onSnooze(7) }} className="flex w-[74px] items-center justify-center rounded-r-[16px] border-0 bg-wall-ink-2 p-0 text-phone-label font-bold text-wall-on-pigment">Later</button>
        </div>
      )}
      <div
        ref={ref}
        data-swipe-row
        className={`relative touch-pan-y select-none [-webkit-touch-callout:none] ${dragging ? '' : 'transition-transform duration-[260ms] ease-[cubic-bezier(0.2,0.9,0.3,1.15)]'} ${hint && !shown ? 'motion-safe:animate-[swipe-hint_2.4s_ease-in-out_0.6s_2]' : ''}`}
        style={{ transform: shown ? `translateX(${shown}px)` : undefined }}
        onPointerDown={(e) => {
          swiped.current = false
          drag.current = { x: e.clientX, y: e.clientY, base, id: e.pointerId, axis: null, lastX: e.clientX, lastT: e.timeStamp, v: 0 }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const mx = e.clientX - d.x
          if (!d.axis) {
            d.axis = swipeAxis(mx, e.clientY - d.y)
            if (!d.axis) return
            if (d.axis === 'y') { drag.current = null; return }
            setDragging(true)
            setW(width())
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
          const dt = e.timeStamp - d.lastT
          if (dt > 0) d.v = 0.6 * ((e.clientX - d.lastX) / dt) + 0.4 * d.v
          d.lastX = e.clientX
          d.lastT = e.timeStamp
          const w = width()
          const raw = d.base + mx
          // Past the ends it gives, but less (a rubber band).
          const max = w * 0.75
          const min = onSnooze ? -SNOOZE_W : 0
          setDx(raw > max ? max + (raw - max) * 0.3 : raw < min ? min + (raw - min) * 0.3 : raw)
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (!d?.axis) return
          e.preventDefault()
          swiped.current = true
          // A finger that stopped before letting go isn't a flick.
          const v = e.timeStamp - d.lastT > 80 ? 0 : d.v
          const outcome = swipeOutcome(dx, width(), Boolean(onSnooze), SNOOZE_W, v)
          setDragging(false)
          setDx(0)
          if (outcome !== 'none') onSwiped?.()
          if (outcome === 'done') { setOpen(false); onDone() } else setOpen(outcome === 'snooze')
        }}
        onPointerCancel={() => { drag.current = null; setDragging(false); setDx(0) }}
        onClickCapture={(e) => { if (swiped.current || open) { e.stopPropagation(); e.preventDefault(); swiped.current = false; if (open) setOpen(false) } }}
      >
        {children}
      </div>
    </div>
  )
}
