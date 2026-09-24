import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

// 2026-09-24: user reported that scrolling inside the sidecar also visibly
// moved/exposed the page behind it (specifically noticed on the calendar's
// day-column rail). Root cause: both the desktop panel (drag="x", swipe
// right to close) and the mobile sheet (drag="y", swipe down to close) had
// their Framer Motion drag gesture live on the ENTIRE panel, not scoped to
// the small grab handle each already visually has. Any vertical scroll
// attempt inside the sidecar's own content was therefore ambiguous between
// "scroll this list" and "drag the whole panel," and Framer Motion's
// gesture recognizer could win that ambiguity, elastically pulling the
// panel itself and revealing whatever's behind it -- which read as "the
// page behind it is scrolling too," even though the underlying page's own
// scroll position never actually changed.
//
// Fixed the standard Framer Motion way: dragListener={false} on the
// draggable element, paired with a useDragControls() instance whose
// .start(event) is wired to ONLY the grab handle's onPointerDown. Dragging
// (and therefore the ambiguity) now only ever begins from the handle;
// scrolling anywhere else in the sidecar's content is never contested.
const src = readFileSync(new URL('../src/components/shared/SidecarCompanion.tsx', import.meta.url), 'utf8')

test('imports useDragControls from framer-motion', () => {
  assert.match(src, /import \{ motion, AnimatePresence, useDragControls \} from 'framer-motion'/)
})

test('declares one drag-controls instance per panel (desktop and mobile are separate render branches)', () => {
  assert.match(src, /const desktopDragControls = useDragControls\(\)/)
  assert.match(src, /const mobileDragControls = useDragControls\(\)/)
})

test('the desktop panel (drag="x") disables the default drag listener and wires it to its handle only', () => {
  const desktopBlock = src.slice(src.indexOf('key="sidecar-desktop-companion"'), src.indexOf('key="sidecar-desktop-companion"') + 2000)
  assert.match(desktopBlock, /dragListener=\{false\}/)
  assert.match(desktopBlock, /dragControls=\{desktopDragControls\}/)
  assert.match(desktopBlock, /onPointerDown=\{\(e\) => desktopDragControls\.start\(e\)\}/)
})

test('the mobile sheet (drag="y") disables the default drag listener and wires it to its handle only', () => {
  const mobileBlock = src.slice(src.indexOf('key="sidecar-mobile-sheet"'), src.indexOf('key="sidecar-mobile-sheet"') + 1200)
  assert.match(mobileBlock, /dragListener=\{false\}/)
  assert.match(mobileBlock, /dragControls=\{mobileDragControls\}/)
  assert.match(mobileBlock, /onPointerDown=\{\(e\) => mobileDragControls\.start\(e\)\}/)
})
