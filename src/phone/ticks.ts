import { useEffect, useRef, useState } from 'react'

/**
 * A tick that waits a moment before it's saved (the wall's NEXT UP does the same): crossed out at once, saved after
 * `delay`, and a second tap in that moment takes it back.
 */
export function usePendingTicks(commit: (key: string) => void, delay = 4000) {
  const [pending, setPending] = useState<ReadonlySet<string>>(() => new Set())
  const timers = useRef(new Map<string, number>())
  const latest = useRef(commit)
  useEffect(() => { latest.current = commit })
  useEffect(() => () => { for (const t of timers.current.values()) window.clearTimeout(t) }, [])
  const toggle = (key: string) => {
    const waiting = timers.current.get(key)
    if (waiting) {
      window.clearTimeout(waiting)
      timers.current.delete(key)
      setPending((s) => { const n = new Set(s); n.delete(key); return n })
      return
    }
    setPending((s) => new Set(s).add(key))
    timers.current.set(key, window.setTimeout(() => {
      timers.current.delete(key)
      latest.current(key)
      setPending((s) => { const n = new Set(s); n.delete(key); return n })
    }, delay))
  }
  return { pending, toggle }
}
