import { useEffect, useRef, useState } from 'react'
import { planAdds, type ShopItem } from './groceries'
import type { PhoneGroceriesData } from './PhoneGroceries'

// What the phone's Groceries and the Wall's Grocery page share (canvas 33d, 35a–d): adding what was typed or said, a tick
// that waits like iPhone Reminders before the ticked ones leave together, and holding an item to move it to its aisle.

/** How long a press is before it lifts the item to move (a tap ticks it). */
export const LIFT_MS = 450

/** How long ticked items stay in place after the last tick. */
export const HOLD_MS = 2500

/**
 * Put what was typed or said on the list: each new one added (in its aisle), one already got un-ticked, one already on
 * it left be. All at once — each shows straight away and saves behind. Says what happened ("Added milk, eggs").
 */
export function addSaid(data: PhoneGroceriesData, value: string, spoken: boolean): { said: string; added: string[]; saving: Promise<unknown> } | null {
  const plan = planAdds(value, data.items, { spoken })
  if (plan.length === 0) return null
  const added: string[] = []
  const already: string[] = []
  const saving: Array<Promise<void> | void> = []
  for (const p of plan) {
    if (p.kind === 'new') { saving.push(data.add(p)); added.push(p.name) }
    else if (p.kind === 'again') { saving.push(data.tick(p.id, false)); added.push(p.name) }
    else already.push(p.name)
  }
  return {
    said: [added.length ? `Added ${added.map((n) => n.toLowerCase()).join(', ')}` : '', already.length ? `${already.join(', ')} ${already.length > 1 ? 'were' : 'was'} on already` : ''].filter(Boolean).join(' · '),
    added,
    saving: Promise.all(saving),
  }
}

/** A tick stays where it is until HOLD_MS after the last one ("the check stays for a moment like it does on reminders"). */
export function useTickHold(data: PhoneGroceriesData, onTap?: () => void) {
  const [held, setHeld] = useState<Set<string>>(() => new Set())
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const tap = (item: ShopItem) => {
    onTap?.()
    if (item.checked) {
      void data.tick(item.id, false)
      setHeld((was) => { const next = new Set(was); next.delete(item.id); return next })
      return
    }
    void data.tick(item.id, true)
    setHeld((was) => new Set(was).add(item.id))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; setHeld(new Set()) }, HOLD_MS)
  }
  return { held, tap }
}

/**
 * Hold an item and let go on its aisle (Jake, Oct 2: "hold and drag items on grocery to move to the right category"): a
 * hold lifts it and the aisles come up as targets (`data-aisle-key`); let go on one — or tap one — and it moves there.
 */
export function useLiftToMove(data: PhoneGroceriesData, onLift?: () => void) {
  const [lifted, setLifted] = useState<ShopItem | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const press = useRef<{ x: number; y: number; timer: number; lifted: boolean } | null>(null)
  const swallowTap = useRef(false)
  const aisleAt = (x: number, y: number) => (document.elementFromPoint(x, y)?.closest('[data-aisle-key]') as HTMLElement | null)?.dataset.aisleKey ?? null
  const cancel = () => { setLifted(null); setOver(null) }
  const moveTo = (item: ShopItem, key: string) => {
    cancel()
    if (key !== item.category) { onLift?.(); void data.move?.(item.id, key) }
  }
  const pressHandlers = (item: ShopItem) => data.move ? {
    onPointerDown: (e: React.PointerEvent) => {
      swallowTap.current = false
      // The let-go comes back to this row wherever it happens (a finger does this anyway; a mouse needs asking).
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      const p = { x: e.clientX, y: e.clientY, timer: 0, lifted: false }
      p.timer = window.setTimeout(() => { p.lifted = true; swallowTap.current = true; onLift?.(); setLifted(item) }, LIFT_MS)
      press.current = p
    },
    onPointerMove: (e: React.PointerEvent) => {
      const p = press.current
      if (!p) return
      if (!p.lifted && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 10) { window.clearTimeout(p.timer); press.current = null; return }
      if (p.lifted) setOver(aisleAt(e.clientX, e.clientY))
    },
    onPointerUp: (e: React.PointerEvent) => {
      const p = press.current
      press.current = null
      if (!p) return
      window.clearTimeout(p.timer)
      if (!p.lifted) return
      const key = aisleAt(e.clientX, e.clientY)
      if (key) moveTo(item, key) // else the aisles stay up: tap one
    },
    onPointerCancel: () => { const p = press.current; press.current = null; if (p) window.clearTimeout(p.timer) },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  } : {}
  /** True once for the tap that ends a hold, so it doesn't also tick. */
  const swallowed = () => { if (!swallowTap.current) return false; swallowTap.current = false; return true }
  return { lifted, over, cancel, moveTo, pressHandlers, swallowed }
}
