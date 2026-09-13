/**
 * Marks the document as a touch device via `<html data-touch-device>`, used
 * by the `hover` custom variant in src/index.css to suppress hover styles.
 *
 * The CSS-only approach (`@media (hover: hover)`) isn't reliable everywhere:
 * on the kiosk's Chromium-on-X11 setup, `matchMedia('(hover: hover)')` and
 * `matchMedia('(pointer: fine)')` both incorrectly report true for the
 * touchscreen (an X11/XInput2 "virtual core pointer" quirk), so the CSS
 * variant never actually disabled hover there. Every hover: style stayed
 * live and kept responding to the synthetic mouse-move events Chromium
 * generates from touch drags, forcing real style recalculation and
 * hit-testing on every interactive row a scroll gesture crossed -- root
 * cause of the kiosk home screen's touch-scroll lagging well behind the
 * finger while lighter, less densely-interactive pages felt fine
 * (2026-09-13). `navigator.maxTouchPoints` isn't fooled by that quirk, so
 * it's the reliable signal here.
 */
export function initTouchDeviceFlag(): void {
  if (typeof navigator === 'undefined' || typeof document === 'undefined') return
  if (navigator.maxTouchPoints > 0) {
    document.documentElement.setAttribute('data-touch-device', 'true')
  }
}
