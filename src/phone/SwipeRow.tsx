import { Check } from 'lucide-react'
import { useRef, useState, type ReactNode } from 'react'
import { swipeOutcome } from './swipe'

const SNOOZE_W = 148

/**
 * A to-do or chore on Today you swipe (canvas 46c; Jake, Oct 5: "can we do the swipe 46c? … right to done, swipe left
 * to snooze a day?"). Right: brass "Done" shows under it, and let go past a third it's done (a short swipe springs
 * back). Left: Tomorrow and Later, tapped (a to-do only). A tap is the card's own. Pointer events, so a finger, a mouse
 * or a trackpad all swipe; up and down still scroll the day.
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
  const drag = useRef<{ x: number; y: number; on: boolean; base: number; id: number } | null>(null)
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [open, setOpen] = useState(false)
  // A swipe ends with a click on what's under the finger: that click is the swipe's, not a tap.
  const swiped = useRef(false)
  const base = open ? -SNOOZE_W : 0
  const shown = dragging ? dx : base
  return (
    <div className="relative overflow-hidden rounded-[16px]" aria-label={label}>
      <button type="button" role="checkbox" aria-checked={ticked} aria-label={`Done: ${title}`} onClick={onDone} className="sr-only" />
      {(shown > 0 || hint) && (
        <div aria-hidden="true" className="absolute inset-0 flex items-center gap-[8px] rounded-[16px] bg-wall-brass pl-[22px] text-phone-body font-bold text-wall-on-pigment">
          <Check size={20} strokeWidth={3} /> {ticked ? 'Not done' : 'Done'}
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
        className={`relative touch-pan-y ${dragging ? '' : 'transition-transform duration-200'} ${hint && !shown ? 'motion-safe:animate-[swipe-hint_2.4s_ease-in-out_0.6s_2]' : ''}`}
        style={{ transform: shown ? `translateX(${shown}px)` : undefined }}
        onPointerDown={(e) => { swiped.current = false; drag.current = { x: e.clientX, y: e.clientY, on: false, base, id: e.pointerId } }}
        onPointerMove={(e) => {
          const d = drag.current
          if (!d || d.id !== e.pointerId) return
          const mx = e.clientX - d.x
          if (!d.on) {
            if (Math.abs(mx) < 10) return
            if (Math.abs(e.clientY - d.y) > Math.abs(mx)) { drag.current = null; return }
            d.on = true
            setDragging(true)
            e.currentTarget.setPointerCapture?.(e.pointerId)
          }
          const width = ref.current?.offsetWidth ?? 360
          setDx(Math.max(onSnooze ? -SNOOZE_W - 20 : 0, Math.min(width * 0.8, d.base + mx)))
        }}
        onPointerUp={(e) => {
          const d = drag.current
          drag.current = null
          if (!d?.on) return
          e.preventDefault()
          swiped.current = true
          const width = ref.current?.offsetWidth ?? 360
          const outcome = swipeOutcome(dx, width, Boolean(onSnooze), SNOOZE_W)
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
