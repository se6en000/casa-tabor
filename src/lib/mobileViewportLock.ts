/**
 * Mobile Viewport & Gesture Zoom Lock
 *
 * Enforces native app ergonomics on mobile viewports:
 * 1. Blocks WebKit/iOS pinch-to-zoom gesture events (gesturestart / gesturechange / gestureend).
 * 2. Blocks multi-finger touch pinch-zoom while allowing single-finger scrolling & swiping.
 * 3. Blocks double-tap to zoom on non-form elements.
 * 4. Blocks trackpad pinch-to-zoom (Ctrl/Meta + Wheel).
 */

export function initMobileViewportLock(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  // 1. Prevent WebKit / iOS Safari gesture zoom (pinch/rotate)
  const onGesture = (e: Event) => {
    e.preventDefault()
  }

  // 2. Prevent multi-touch pinch zoom (2+ fingers)
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length > 1) {
      e.preventDefault()
    }
  }

  // 3. Prevent double-tap to zoom on non-input UI elements
  let lastTouchEndTime = 0
  const onTouchEnd = (e: TouchEvent) => {
    const now = Date.now()
    if (now - lastTouchEndTime <= 300) {
      const target = e.target as HTMLElement | null
      const isInput = target?.closest('input, textarea, select, [contenteditable="true"]')
      if (!isInput) {
        e.preventDefault()
      }
    }
    lastTouchEndTime = now
  }

  // 4. Prevent Ctrl/Cmd + Wheel zoom (trackpad pinch on macOS)
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
    }
  }

  document.addEventListener('gesturestart', onGesture, { passive: false })
  document.addEventListener('gesturechange', onGesture, { passive: false })
  document.addEventListener('gestureend', onGesture, { passive: false })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('touchend', onTouchEnd, { passive: false })
  window.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    document.removeEventListener('gesturestart', onGesture)
    document.removeEventListener('gesturechange', onGesture)
    document.removeEventListener('gestureend', onGesture)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    window.removeEventListener('wheel', onWheel)
  }
}
