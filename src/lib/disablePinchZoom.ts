/**
 * Disables pinch-to-zoom and multi-touch zoom gestures across mobile browsers
 * (iOS Safari, Android Chrome, and touch/trackpad devices).
 */
export function initDisablePinchZoom(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  // 1. Prevent Safari gesture events (iOS WebKit proprietary gesture events for pinch/zoom)
  const onGestureEvent = (e: Event) => {
    e.preventDefault()
  }

  // 2. Prevent multi-touch pinch on touchmove (when 2 or more fingers are active)
  const onTouchMove = (e: TouchEvent) => {
    if (e.touches && e.touches.length > 1) {
      e.preventDefault()
    }
  }

  // 3. Prevent Ctrl + wheel zoom (pinch-to-zoom on desktop/laptop trackpads)
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault()
    }
  }

  document.addEventListener('gesturestart', onGestureEvent, { passive: false })
  document.addEventListener('gesturechange', onGestureEvent, { passive: false })
  document.addEventListener('gestureend', onGestureEvent, { passive: false })
  document.addEventListener('touchmove', onTouchMove, { passive: false })
  document.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    document.removeEventListener('gesturestart', onGestureEvent)
    document.removeEventListener('gesturechange', onGestureEvent)
    document.removeEventListener('gestureend', onGestureEvent)
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('wheel', onWheel)
  }
}
