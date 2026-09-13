/**
 * Disables pinch-to-zoom and multi-touch zoom gestures across mobile browsers
 * (iOS Safari, Android Chrome, and touch/trackpad devices).
 *
 * Multi-touch pinch itself is blocked declaratively via `touch-action: pan-x
 * pan-y` on html/body/#root (src/index.css) -- that alone tells the browser,
 * off the main thread, to never treat two fingers as a pinch gesture. This
 * used to ALSO run a non-passive `touchmove` listener on `document` to catch
 * the same case in JS, but a non-passive touchmove listener anywhere on the
 * page forces every touch-scroll gesture app-wide onto the slow path: the
 * browser can't hand scrolling to the compositor until it synchronously
 * confirms the handler won't call preventDefault(), on every single
 * touchmove, even though it almost never does (real pinch gestures are
 * exceedingly rare). Root-caused as the reason touch-scroll consistently
 * trailed a dragging finger by ~400ms on heavier pages like the kiosk home
 * screen, while lighter pages (e.g. Meals & Kitchen) hid the same tax well
 * enough to feel fine (2026-09-13). Removed since the CSS rule already does
 * the job with zero main-thread cost.
 */
export function initDisablePinchZoom(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return () => {}
  }

  // 1. Prevent Safari gesture events (iOS WebKit proprietary gesture events for pinch/zoom).
  // These are a distinct event type that only fires during an actual detected
  // pinch, never during ordinary single-finger scrolling, so they don't gate
  // touch-scroll dispatch the way a touchmove listener does.
  const onGestureEvent = (e: Event) => {
    e.preventDefault()
  }

  // 2. Prevent Ctrl + wheel zoom (pinch-to-zoom on desktop/laptop trackpads).
  // Also unrelated to touch-scroll dispatch.
  const onWheel = (e: WheelEvent) => {
    if (e.ctrlKey) {
      e.preventDefault()
    }
  }

  document.addEventListener('gesturestart', onGestureEvent, { passive: false })
  document.addEventListener('gesturechange', onGestureEvent, { passive: false })
  document.addEventListener('gestureend', onGestureEvent, { passive: false })
  document.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    document.removeEventListener('gesturestart', onGestureEvent)
    document.removeEventListener('gesturechange', onGestureEvent)
    document.removeEventListener('gestureend', onGestureEvent)
    document.removeEventListener('wheel', onWheel)
  }
}
