import { useEffect, useRef, type TouchEvent } from 'react'

// The phone as an app (backlog "The phone as a real app", pass 1; Jake's screen recording, Oct 1: the bottom bar
// floated above the edge and dropped as he swiped). The frame is pinned to the screen, but the page under it could
// still rubber-band on iPhone and drag the frame — bar included — with it. While the phone screen is up, the page
// itself is locked (html.phone-app in index.css): only the middle scrolls. The keyboard's height is kept in
// --phone-kb: the frame ends at the keyboard's top, so sheets and typing lines sit above it, and the tab bar steps aside.

/** How far a sheet is dragged down before letting go closes it. */
export const SWIPE_CLOSE_PX = 90

/** The keyboard's height from the visual viewport (0 when it's down; small differences are the toolbar). */
export function keyboardHeight(innerHeight: number, viewport: { height: number; offsetTop: number } | null): number {
  if (!viewport) return 0
  const kb = Math.round(innerHeight - viewport.height - viewport.offsetTop)
  return kb > 80 ? kb : 0
}

export function usePhoneShell() {
  useEffect(() => {
    const root = document.documentElement
    root.classList.add('phone-app')
    const vv = window.visualViewport
    const update = () => {
      const kb = keyboardHeight(window.innerHeight, vv)
      root.style.setProperty('--phone-kb', `${kb}px`)
      if (kb) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
      // iOS scrolls the locked page to show a field; put it back so nothing behind the sheet moves.
      if (window.scrollY) window.scrollTo(0, 0)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    return () => {
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      root.classList.remove('phone-app')
      root.style.removeProperty('--phone-kb')
      delete root.dataset.keyboard
    }
  }, [])
}

/**
 * A sheet that follows the finger down from its top and closes past SWIPE_CLOSE_PX, as an iPhone sheet does. Only
 * from the top of its own scroll, and only a mostly vertical drag, so lists inside still scroll and pills still tap.
 */
export function useSheetSwipe(onClose: () => void) {
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  const sheet = (e: TouchEvent<HTMLElement>) => e.currentTarget
  const reset = (el: HTMLElement) => {
    el.style.transition = 'transform 180ms ease-out'
    el.style.transform = ''
  }
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0]
      start.current = sheet(e).scrollTop <= 0 ? { x: t.clientX, y: t.clientY, dragging: false } : null
    },
    onTouchMove: (e: TouchEvent<HTMLElement>) => {
      const s = start.current
      if (!s) return
      const t = e.touches[0]
      const dy = t.clientY - s.y
      const dx = Math.abs(t.clientX - s.x)
      if (!s.dragging) {
        if (dy < 8 || dx > dy) {
          if (dy < -4 || dx > 12) start.current = null
          return
        }
        s.dragging = true
      }
      const el = sheet(e)
      el.style.transition = 'none'
      el.style.transform = `translateY(${Math.max(0, dy)}px)`
    },
    onTouchEnd: (e: TouchEvent<HTMLElement>) => {
      const s = start.current
      start.current = null
      if (!s?.dragging) return
      const dy = e.changedTouches[0].clientY - s.y
      const el = sheet(e)
      if (dy > SWIPE_CLOSE_PX) {
        el.style.transition = 'transform 160ms ease-in'
        el.style.transform = 'translateY(100%)'
        window.setTimeout(onClose, 150)
      } else reset(el)
    },
  }
}
