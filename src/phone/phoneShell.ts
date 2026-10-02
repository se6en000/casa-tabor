import { useEffect, useRef, type TouchEvent } from 'react'

// The phone as an app (backlog "The phone as a real app", pass 1; Jake's screen recording, Oct 1: the bottom bar
// floated above the edge and dropped as he swiped). The frame is pinned to the screen, but the page under it could
// still rubber-band on iPhone and drag the frame — bar included — with it. While the phone screen is up, the page
// itself is locked (html.phone-app in index.css): only the middle scrolls. The keyboard's height is kept in
// --phone-kb: the frame ends at the keyboard's top, so sheets and typing lines sit above it, and the tab bar steps aside.

/** How far a sheet is dragged down before letting go closes it. */
export const SWIPE_CLOSE_PX = 90

/**
 * The keyboard's height from the visual viewport — only while something is being typed in. On a fresh load iOS can
 * report the visual viewport shorter than the window with no keyboard up (Jake's phone, Oct 2: the frame stopped short
 * and the bar floated over a strip of page), so a gap counts only when a field has focus.
 */
export function keyboardHeight(innerHeight: number, viewport: { height: number; offsetTop: number } | null, typing = true): number {
  if (!viewport || !typing) return 0
  const kb = Math.round(innerHeight - viewport.height - viewport.offsetTop)
  return kb > 80 ? kb : 0
}

/** A field the keyboard is for. */
export function isTyping(el: Element | null): boolean {
  if (!el) return false
  const tag = el.tagName
  return tag === 'TEXTAREA' || (tag === 'INPUT' && !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color'].includes((el as HTMLInputElement).type)) || (el as HTMLElement).isContentEditable === true
}

/**
 * What the phone itself says about its screen, sent once a session (Jake's phone, Oct 2: the bar sat ~60 pt above
 * the bottom edge and the cause wasn't visible from here). Lands in ai_drawer_debug_events as "phone_layout".
 */
function reportLayout() {
  try {
    if (sessionStorage.getItem('casa-phone-layout-sent')) return
    sessionStorage.setItem('casa-phone-layout-sent', '1')
  } catch { /* private mode: send anyway */ }
  const probe = document.createElement('div')
  probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0;height:100lvh;width:1px'
  document.body.appendChild(probe)
  const cs = getComputedStyle(probe)
  const lvh = probe.getBoundingClientRect().height
  probe.style.height = '100svh'
  const svh = probe.getBoundingClientRect().height
  probe.style.height = '100dvh'
  const dvh = probe.getBoundingClientRect().height
  const insets = { top: cs.paddingTop, bottom: cs.paddingBottom }
  probe.remove()
  const rect = (sel: string) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) } : null }
  const vv = window.visualViewport
  const payload = {
    innerHeight: window.innerHeight, innerWidth: window.innerWidth, outerHeight: window.outerHeight,
    screen: { width: screen.width, height: screen.height }, dpr: window.devicePixelRatio,
    visualViewport: vv ? { height: vv.height, width: vv.width, offsetTop: vv.offsetTop, pageTop: vv.pageTop, scale: vv.scale } : null,
    docClientHeight: document.documentElement.clientHeight, bodyRect: rect('body'), htmlRect: rect('html'),
    frame: rect('[data-phone-frame]'), nav: rect('nav[aria-label="Sections"]'),
    phoneKb: getComputedStyle(document.documentElement).getPropertyValue('--phone-kb').trim(),
    keyboardAttr: document.documentElement.dataset.keyboard ?? null,
    active: document.activeElement?.tagName ?? null,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    units: { lvh, svh, dvh }, insets, scrollY: window.scrollY, ua: navigator.userAgent,
  }
  void import('../lib/remoteVoiceTrace').then(({ sendBugReport }) => sendBugReport({ event: 'phone_layout', detail: `inner ${window.innerHeight} · screen ${screen.height} · vv ${vv?.height} · frame ${JSON.stringify(payload.frame)}`, page: '/phone', payload })).catch(() => {})
}

export function usePhoneShell() {
  useEffect(() => {
    const layoutTimer = window.setTimeout(reportLayout, 2000)
    const root = document.documentElement
    root.classList.add('phone-app')
    const vv = window.visualViewport
    const update = () => {
      const kb = keyboardHeight(window.innerHeight, vv, isTyping(document.activeElement))
      root.style.setProperty('--phone-kb', `${kb}px`)
      if (kb) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
      // iOS scrolls the locked page to show a field; put it back so nothing behind the sheet moves.
      if (window.scrollY) window.scrollTo(0, 0)
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    // Leaving a field drops the keyboard: back to full height at once, not on the viewport's next event.
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      window.clearTimeout(layoutTimer)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      document.removeEventListener('focusin', update)
      document.removeEventListener('focusout', update)
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
