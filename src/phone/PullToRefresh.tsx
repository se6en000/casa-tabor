import { useEffect, useState, type RefObject } from 'react'
import { RefreshCw } from 'lucide-react'

// Pull down to refresh (canvas 30, motion): from the top of the list, a pull past THRESHOLD re-reads the day. The mark
// follows the finger at half speed (the rubber band) and spins while the day comes back.

const THRESHOLD = 70

export default function PullToRefresh({ scrollRef, onRefresh }: { scrollRef: RefObject<HTMLElement | null>; onRefresh?: () => Promise<void> }) {
  const [pull, setPull] = useState(0)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !onRefresh) return
    let start: number | null = null
    let distance = 0
    const down = (e: TouchEvent) => { start = el.scrollTop <= 0 ? e.touches[0].clientY : null; distance = 0 }
    const move = (e: TouchEvent) => {
      if (start == null) return
      distance = Math.max(0, e.touches[0].clientY - start)
      if (el.scrollTop > 0) { start = null; distance = 0 }
      setPull(Math.min(110, distance * 0.5))
    }
    const up = () => {
      if (start != null && distance * 0.5 >= THRESHOLD) {
        setBusy(true)
        void onRefresh().finally(() => { setBusy(false); setPull(0) })
      } else setPull(0)
      start = null
    }
    el.addEventListener('touchstart', down, { passive: true })
    el.addEventListener('touchmove', move, { passive: true })
    el.addEventListener('touchend', up, { passive: true })
    return () => {
      el.removeEventListener('touchstart', down)
      el.removeEventListener('touchmove', move)
      el.removeEventListener('touchend', up)
    }
  }, [scrollRef, onRefresh])
  if (!onRefresh || (pull === 0 && !busy)) return null
  const shown = busy ? THRESHOLD * 0.7 : pull
  return (
    <div aria-live="polite" aria-label={busy ? 'Refreshing' : 'Pull to refresh'} className="pointer-events-none flex justify-center overflow-hidden transition-[height] duration-200" style={{ height: shown }}>
      <RefreshCw
        size={22}
        aria-hidden="true"
        className={`mt-[8px] text-wall-brass-ink ${busy ? 'animate-spin' : ''}`}
        style={busy ? undefined : { transform: `rotate(${pull * 4}deg)`, opacity: Math.min(1, pull / THRESHOLD) }}
      />
    </div>
  )
}
