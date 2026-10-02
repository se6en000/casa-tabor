import { useEffect, useLayoutEffect, useRef, type ReactNode } from 'react'

// Days you can throw (premium plan, Phase A; Jake, Oct 2: "real swipe movements when swiping left and right on the
// days where the whole day slides to the next with a bounce"). A row of whole-day pages in a native scroll-snap
// scroller: the day is under your thumb, a flick carries on with iOS's own momentum and settles on the next day, the
// ends rubber-band — all on the compositor, at the screen's 120 Hz. As a page leaves the middle it eases back a
// little (scale and fade), so the move reads as depth, not a flat slide. Each page scrolls up and down on its own.
// Only the day in view and its neighbours are drawn in full; the rest are their shape until you reach them.

export default function PhoneDayPager({ count, index, onIndex, renderPage, onActivePage, pageClassName }: {
  count: number
  index: number
  /** The day settled on after a swipe. */
  onIndex: (index: number) => void
  renderPage: (index: number) => ReactNode
  /** The page in view (its own scroller): for scroll-to-now, pull to refresh and the tab bar. */
  onActivePage?: (el: HTMLElement | null) => void
  pageClassName: string
}) {
  const row = useRef<HTMLDivElement>(null)
  const pages = useRef<Array<HTMLElement | null>>([])
  const settled = useRef(index)
  const first = useRef(true)

  // Arrive on the day asked for: at once the first time, gliding after (Today, the month, a tab tap).
  useLayoutEffect(() => {
    const el = row.current
    if (!el) return
    const left = index * el.clientWidth
    if (Math.abs(el.scrollLeft - left) > 2) el.scrollTo({ left, behavior: first.current ? 'instant' : 'smooth' })
    first.current = false
    settled.current = index
    onActivePage?.(pages.current.at(index) ?? null)
  }, [index, onActivePage])

  useEffect(() => {
    const el = row.current
    if (!el) return
    let frame = 0
    let idle = 0
    const depth = () => {
      frame = 0
      const w = el.clientWidth || 1
      for (const [i, page] of pages.current.entries()) {
        const inner = page?.firstElementChild as HTMLElement | null
        if (!inner) continue
        const off = Math.min(1, Math.abs(i * w - el.scrollLeft) / w)
        inner.style.transform = off ? `scale(${1 - 0.06 * off})` : ''
        inner.style.opacity = off ? String(1 - 0.35 * off) : ''
      }
    }
    const settle = () => {
      const i = Math.round(el.scrollLeft / (el.clientWidth || 1))
      if (i !== settled.current && i >= 0 && i < count) {
        settled.current = i
        onIndex(i)
      }
    }
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(depth)
      window.clearTimeout(idle)
      idle = window.setTimeout(settle, 120)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('scrollend', settle)
    return () => {
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('scrollend', settle)
      window.cancelAnimationFrame(frame)
      window.clearTimeout(idle)
    }
  }, [count, onIndex])

  return (
    <div ref={row} data-day-pager className="flex h-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {Array.from({ length: count }, (_, i) => (
        <section
          key={i}
          ref={(node) => { pages.current[i] = node }}
          aria-hidden={i !== index}
          className={`h-full w-full shrink-0 snap-center snap-always overflow-y-auto overscroll-y-contain ${pageClassName}`}
        >
          <div className="origin-top will-change-transform">{renderPage(i)}</div>
        </section>
      ))}
    </div>
  )
}
