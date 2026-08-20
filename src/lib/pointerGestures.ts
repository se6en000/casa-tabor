/**
 * Pointer-gesture fallback for touchscreens that deliver touch as MOUSE events.
 *
 * Some kiosk setups (e.g. Chromium on labwc/Wayland with an ILITEK USB panel)
 * never forward real `touch` events to the page — a finger drag arrives as
 * mousedown/mousemove/mouseup. Native scrolling and swipe therefore break,
 * because a mouse-drag does not scroll a page.
 *
 * This module re-implements the two gestures we need on top of mouse/pointer
 * input: drag-to-scroll (with inertia) and horizontal swipe-to-navigate.
 *
 * It is DORMANT by default and only activates on platforms that lack real
 * touch. The instant a genuine `touchstart` fires, it tears itself down so
 * native touch (e.g. an Xorg session) is never interfered with.
 */

const DRAG_THRESHOLD = 8 // px of movement before a press becomes a drag
const SWIPE_DISTANCE = 60 // px horizontal travel to trigger calendar nav
const INERTIA_FRICTION = 0.94
const INERTIA_MIN_VELOCITY = 0.4

type ScrollDir = 'vertical' | 'horizontal'

function isScrollable(el: Element, dir: ScrollDir): boolean {
  const style = getComputedStyle(el)
  if (dir === 'vertical') {
    const oy = style.overflowY
    return (oy === 'auto' || oy === 'scroll') && el.scrollHeight > el.clientHeight + 1
  }
  const ox = style.overflowX
  return (ox === 'auto' || ox === 'scroll') && el.scrollWidth > el.clientWidth + 1
}

function findScrollable(start: Element | null, dir: ScrollDir): HTMLElement | null {
  let el: Element | null = start
  while (el && el !== document.body && el !== document.documentElement) {
    if (el instanceof HTMLElement && isScrollable(el, dir)) return el
    el = el.parentElement
  }
  if (document.scrollingElement instanceof HTMLElement) {
    const se = document.scrollingElement
    if (dir === 'vertical' && se.scrollHeight > se.clientHeight + 1) return se
    if (dir === 'horizontal' && se.scrollWidth > se.clientWidth + 1) return se
  }
  return null
}

function isInteractive(el: Element | null): boolean {
  return !!el?.closest('input, textarea, select, [contenteditable="true"], [data-native-drag]')
}

export function initPointerGestures(): () => void {
  // If the device has a real touchscreen the browser exposes, do nothing —
  // native scrolling/swiping already works.
  let active = true

  let startX = 0
  let startY = 0
  let lastX = 0
  let lastY = 0
  let lastT = 0
  let velY = 0
  let velX = 0
  let dragging = false
  let axisLocked: ScrollDir | null = null
  let scrollEl: HTMLElement | null = null
  let swipeTarget: HTMLElement | null = null
  let pointerId: number | null = null
  let inertiaRAF = 0
  let suppressNextClick = false

  function teardown() {
    active = false
    cancelAnimationFrame(inertiaRAF)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('pointermove', onPointerMove, true)
    document.removeEventListener('pointerup', onPointerUp, true)
    document.removeEventListener('pointercancel', onPointerUp, true)
    document.removeEventListener('click', onClickCapture, true)
    window.removeEventListener('touchstart', onRealTouch, true)
  }

  function onRealTouch() {
    // A genuine touch device exists — disable the fallback entirely.
    teardown()
  }

  function onClickCapture(e: MouseEvent) {
    if (suppressNextClick) {
      suppressNextClick = false
      e.stopPropagation()
      e.preventDefault()
    }
  }

  function onPointerDown(e: PointerEvent) {
    if (!active) return
    if (e.pointerType === 'touch') return // real touch handled natively
    if (e.button !== 0) return
    if (isInteractive(e.target as Element)) return

    cancelAnimationFrame(inertiaRAF)
    pointerId = e.pointerId
    startX = lastX = e.clientX
    startY = lastY = e.clientY
    lastT = e.timeStamp
    velX = velY = 0
    dragging = false
    axisLocked = null
    scrollEl = null
    swipeTarget = (e.target as Element)?.closest('[data-swipe-nav]') as HTMLElement | null
  }

  function onPointerMove(e: PointerEvent) {
    if (!active || pointerId === null || e.pointerId !== pointerId) return

    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    const totalDx = e.clientX - startX
    const totalDy = e.clientY - startY

    if (!dragging) {
      if (Math.abs(totalDx) < DRAG_THRESHOLD && Math.abs(totalDy) < DRAG_THRESHOLD) return
      dragging = true
      // Lock the gesture axis on first real movement.
      if (Math.abs(totalDx) > Math.abs(totalDy)) {
        axisLocked = 'horizontal'
        const horizEl = findScrollable(e.target as Element, 'horizontal')
        if (horizEl) {
          scrollEl = horizEl
          swipeTarget = null // Prefer scrolling the horizontal container over page swipe
        } else if (!swipeTarget) {
          scrollEl = null
        }
      } else {
        axisLocked = 'vertical'
        scrollEl = findScrollable(e.target as Element, 'vertical')
      }
      document.body.style.userSelect = 'none'
    }

    const dt = Math.max(1, e.timeStamp - lastT)

    if (axisLocked === 'vertical' && scrollEl) {
      scrollEl.scrollTop -= dy
      velY = dy / dt
      e.preventDefault()
    } else if (axisLocked === 'horizontal' && !swipeTarget && scrollEl) {
      scrollEl.scrollLeft -= dx
      velX = dx / dt
      e.preventDefault()
    }
    // horizontal + swipeTarget: accumulate only, resolved on pointerup

    lastX = e.clientX
    lastY = e.clientY
    lastT = e.timeStamp
  }

  function onPointerUp(e: PointerEvent) {
    if (pointerId === null || e.pointerId !== pointerId) return
    pointerId = null
    document.body.style.userSelect = ''

    if (!dragging) return
    suppressNextClick = true
    setTimeout(() => (suppressNextClick = false), 350)

    const totalDx = e.clientX - startX

    // Horizontal swipe over a nav target → fire calendar navigation.
    if (axisLocked === 'horizontal' && swipeTarget && Math.abs(totalDx) > SWIPE_DISTANCE) {
      const dir = totalDx < 0 ? 'next' : 'prev'
      swipeTarget.dispatchEvent(
        new CustomEvent('casa:swipe', { detail: { dir }, bubbles: true }),
      )
      return
    }

    // Inertial fling for scroll gestures.
    if (scrollEl && (axisLocked === 'vertical' || axisLocked === 'horizontal')) {
      let v = axisLocked === 'vertical' ? velY : velX
      v *= 16 // approx px per frame at 60fps
      const el = scrollEl
      const vertical = axisLocked === 'vertical'
      const step = () => {
        if (Math.abs(v) < INERTIA_MIN_VELOCITY) return
        if (vertical) el.scrollTop -= v
        else el.scrollLeft -= v
        v *= INERTIA_FRICTION
        inertiaRAF = requestAnimationFrame(step)
      }
      inertiaRAF = requestAnimationFrame(step)
    }
  }

  // Detect a real touchscreen as early as possible.
  if ('ontouchstart' in window && navigator.maxTouchPoints > 0) {
    // Capability is present AND the browser claims touch points — but on the
    // broken kiosk path maxTouchPoints is forced via a flag while real touch
    // events never fire. So we still arm the fallback and let the first real
    // `touchstart` tear it down.
  }

  window.addEventListener('touchstart', onRealTouch, true)
  document.addEventListener('pointerdown', onPointerDown, true)
  document.addEventListener('pointermove', onPointerMove, { capture: true, passive: false })
  document.addEventListener('pointerup', onPointerUp, true)
  document.addEventListener('pointercancel', onPointerUp, true)
  document.addEventListener('click', onClickCapture, true)

  return teardown
}
