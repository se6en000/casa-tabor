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

/**
 * The window's full height, to measure the keyboard against. While typing, iOS shrinks the window to the visual viewport
 * for a moment as the keyboard comes up (Jake's iPhone, Oct 2: 873 → 460, then back), so a shorter window then is ignored;
 * with nothing typed it's the window as it is (a turn to landscape).
 */
export function fullHeight(was: number, innerHeight: number, typing: boolean): number {
  return typing ? Math.max(was, innerHeight) : innerHeight
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
/** The screenshot fixture's runs aren't anyone's phone: they never write to the live debug log. */
const testRun = () => (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_VISUAL_TEST_MODE === 'true'

function reportLayout() {
  if (testRun()) return
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
    phoneDead: getComputedStyle(document.documentElement).getPropertyValue('--phone-dead').trim(),
    keyboardAttr: document.documentElement.dataset.keyboard ?? null,
    active: document.activeElement?.tagName ?? null,
    standalone: window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true,
    units: { lvh, svh, dvh }, insets, scrollY: window.scrollY, ua: navigator.userAgent,
  }
  void import('../lib/remoteVoiceTrace').then(({ sendBugReport }) => sendBugReport({ event: 'phone_layout', detail: `inner ${window.innerHeight} · screen ${screen.height} · vv ${vv?.height} · frame ${JSON.stringify(payload.frame)}`, page: '/phone', payload })).catch(() => {})
}

/**
 * The keyboard, measured on the phone (Jake, Oct 2: in Ask Casa "the keyboard makes everything jump around and can't see
 * what you are typing"). Once a session for each field (by its label: the Casa box, What to add…), every change from the
 * tap until a moment after the keyboard goes is recorded — the window, the visual viewport, the page's scroll, the frame,
 * the field and the list above it — and sent as "phone_keyboard". Only changes are kept, so a still screen fills nothing.
 */
const kbTrace: { on: boolean; key: string; t0: number; samples: Array<Record<string, unknown>>; last: string; stop: number | null } = { on: false, key: '', t0: 0, samples: [], last: '', stop: null }
const fieldKey = (el: Element | null) => (el?.getAttribute('aria-label') || el?.getAttribute('placeholder') || el?.tagName || 'field').slice(0, 40)
function sampleKeyboard(why: string) {
  if (!kbTrace.on || kbTrace.samples.length >= 150) return
  const vv = window.visualViewport
  const r = (el: Element | null | undefined) => { const b = el?.getBoundingClientRect(); return b ? [Math.round(b.top), Math.round(b.bottom)] : null }
  const field = document.activeElement
  const list = field?.closest('section')?.querySelector('[data-ask-scroll], .overflow-y-auto') as HTMLElement | null
  const sample = {
    ih: window.innerHeight, vh: vv ? Math.round(vv.height) : null, vt: vv ? Math.round(vv.offsetTop) : null, sy: Math.round(window.scrollY),
    kb: document.documentElement.style.getPropertyValue('--phone-kb'), frame: r(document.querySelector('[data-phone-frame]')),
    field: r(field), tag: field?.tagName ?? null, list: list ? { top: Math.round(list.scrollTop), h: list.scrollHeight, ch: list.clientHeight } : null,
  }
  const same = JSON.stringify(sample)
  if (same === kbTrace.last && why !== 'focusout' && why !== 'after') return
  kbTrace.last = same
  kbTrace.samples.push({ t: Math.round(performance.now() - kbTrace.t0), why, ...sample })
}
function startKeyboardTrace() {
  if (testRun() || kbTrace.on) return
  const key = fieldKey(document.activeElement)
  try { if (sessionStorage.getItem(`casa-phone-keyboard:${key}`)) return } catch { /* send anyway */ }
  Object.assign(kbTrace, { on: true, key, t0: performance.now(), samples: [], last: '' })
  // Every frame for the first 1.2 s: the keyboard's own animation.
  const until = kbTrace.t0 + 1200
  const tick = () => { sampleKeyboard('frame'); if (performance.now() < until) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
}
function endKeyboardTrace() {
  if (!kbTrace.on) return
  if (kbTrace.stop) window.clearTimeout(kbTrace.stop)
  kbTrace.stop = window.setTimeout(() => {
    sampleKeyboard('after')
    kbTrace.on = false
    const { key, samples } = kbTrace
    try { sessionStorage.setItem(`casa-phone-keyboard:${key}`, '1') } catch { /* fine */ }
    void import('../lib/remoteVoiceTrace').then(({ sendBugReport }) => sendBugReport({ event: 'phone_keyboard', detail: `${key} · ${samples.length} changes`, page: '/phone', payload: { field: key, samples, screen: { w: screen.width, h: screen.height }, ua: navigator.userAgent } })).catch(() => {})
  }, 1500)
}

export function usePhoneShell() {
  // Instant start (premium plan, Phase C): the app's code cached on the phone by the service worker, so it opens
  // without waiting on the network (the day itself comes from the saved cache, eventsCachePersister.ts). Only here: the
  // wall's kiosk isn't changed.
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return
    void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => {})
  }, [])
  useEffect(() => {
    const layoutTimer = window.setTimeout(reportLayout, 2000)
    const root = document.documentElement
    root.classList.add('phone-app')
    const vv = window.visualViewport
    // iOS 26 installed on the home screen: the band at the bottom the web view never draws (screen height minus the
    // window's, in portrait; 0 anywhere it isn't short). The tab bar floats above it rather than under it.
    // Only when the page runs under the status bar (a top inset): with a solid status bar the window starts below it,
    // and a window shorter than the screen by the status bar is simply right.
    const dead = () => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
      const probe = document.createElement('div')
      probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top)'
      document.body.appendChild(probe)
      const underStatusBar = parseFloat(getComputedStyle(probe).paddingTop) > 0
      probe.remove()
      const gap = screen.height - window.innerHeight
      root.style.setProperty('--phone-dead', `${standalone && underStatusBar && window.innerWidth < window.innerHeight && gap > 20 && gap < 100 ? gap : 0}px`)
    }
    dead()
    window.addEventListener('resize', dead)
    let full = window.innerHeight
    let settle = 0
    const update = (e?: Event) => {
      const typing = isTyping(document.activeElement)
      if (e?.type === 'focusin' && typing) startKeyboardTrace()
      sampleKeyboard(e?.type ?? 'start')
      if (e?.type === 'focusout') endKeyboardTrace()
      full = fullHeight(full, window.innerHeight, typing)
      const kb = keyboardHeight(full, vv, typing)
      root.style.setProperty('--phone-kb', `${kb}px`)
      if (kb) root.dataset.keyboard = 'open'
      else delete root.dataset.keyboard
      // iOS scrolls the locked page to show a field; put it back so nothing behind the sheet moves, then measure again.
      if (window.scrollY) { window.scrollTo(0, 0); requestAnimationFrame(() => update()) }
      // The keyboard's own animation doesn't always end with a viewport event: look again every frame for a moment.
      if (e?.type === 'focusin' || e?.type === 'focusout') {
        const until = performance.now() + 900
        const again = () => { update(); if (performance.now() < until) settle = requestAnimationFrame(again) }
        cancelAnimationFrame(settle)
        settle = requestAnimationFrame(again)
      }
    }
    update()
    vv?.addEventListener('resize', update)
    vv?.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    // Leaving a field drops the keyboard: back to full height at once, not on the viewport's next event.
    document.addEventListener('focusin', update)
    document.addEventListener('focusout', update)
    return () => {
      window.clearTimeout(layoutTimer)
      window.removeEventListener('resize', dead)
      root.style.removeProperty('--phone-dead')
      cancelAnimationFrame(settle)
      vv?.removeEventListener('resize', update)
      vv?.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
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
export function useSheetSwipe(onClose: () => void, { handle }: { handle?: number } = {}) {
  const start = useRef<{ x: number; y: number; dragging: boolean } | null>(null)
  const sheet = (e: TouchEvent<HTMLElement>) => e.currentTarget
  const reset = (el: HTMLElement) => {
    el.style.transition = 'transform 180ms ease-out'
    el.style.transform = ''
  }
  return {
    onTouchStart: (e: TouchEvent<HTMLElement>) => {
      const t = e.touches[0]
      // `handle`: only a drag that starts within this many px of the sheet's top (a tall sheet whose inside scrolls).
      const onHandle = handle == null || t.clientY - sheet(e).getBoundingClientRect().top <= handle
      start.current = onHandle && sheet(e).scrollTop <= 0 ? { x: t.clientX, y: t.clientY, dragging: false } : null
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

/**
 * iPhone only raises the keyboard for a field focused inside the tap itself. A sheet's field mounts a moment later, so
 * the tap focuses a stand-in field first and the sheet's own field takes the focus over, keyboard and all.
 */
export function primeKeyboard(): void {
  if (typeof document === 'undefined') return
  const stand = document.createElement('input')
  stand.setAttribute('aria-hidden', 'true')
  stand.tabIndex = -1
  stand.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none'
  document.body.appendChild(stand)
  stand.focus()
  window.setTimeout(() => stand.remove(), 1000)
}
