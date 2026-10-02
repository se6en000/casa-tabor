import { useEffect, useState, type ReactNode } from 'react'
import { animate, motion, useDragControls, useMotionValue, useMotionValueEvent, usePresence, useTransform } from 'framer-motion'

// Push and pop (premium plan, Phase A): a page — an event, People, a project, Email settings — springs in from the
// right while the screen behind slides a third of the way left and dims, as Mail and Settings do. A strip along the
// left edge takes the back swipe: the page follows the thumb with the screen behind peeking out, and letting go past a
// third of the width (or with a flick) goes back; short of that it springs home. Only transform and opacity move.

const SPRING = { type: 'spring', stiffness: 360, damping: 38, mass: 0.9 } as const
/** The screen behind slides this share of the width while a page is over it. */
const PARALLAX = 0.3

export default function PhonePushPage({ children, onBack, onShift }: {
  children: ReactNode
  onBack: () => void
  /** Slides the screen behind (the tabs' page and the tab bar) by this many px; 0 puts it back. */
  onShift?: (px: number) => void
}) {
  const [width] = useState(() => (typeof window === 'undefined' ? 390 : window.innerWidth))
  const x = useMotionValue(width)
  const dim = useTransform(x, [0, width], [0.16, 0])
  const controls = useDragControls()
  const [present, safeToRemove] = usePresence()

  useEffect(() => { void animate(x, 0, SPRING) }, [x])
  useEffect(() => () => onShift?.(0), [onShift])
  // Leaving: slide out from wherever the thumb left it, then go.
  useEffect(() => {
    if (present) return
    void animate(x, width, SPRING).then(() => safeToRemove?.())
  }, [present, x, safeToRemove, width])
  useMotionValueEvent(x, 'change', (v) => onShift?.(-PARALLAX * (1 - v / width) * width))

  return (
    <div className="absolute inset-0 z-20">
      <motion.div aria-hidden="true" style={{ opacity: dim }} className="pointer-events-none absolute inset-0 bg-wall-ink" />
      <motion.div
        style={{ x }}
        drag="x"
        dragControls={controls}
        dragListener={false}
        dragConstraints={{ left: 0, right: width }}
        dragElastic={0}
        dragMomentum={false}
        onDragEnd={(_, info) => {
          if (info.offset.x > width / 3 || info.velocity.x > 500) onBack()
          else void animate(x, 0, SPRING)
        }}
        className="absolute inset-0 shadow-[-12px_0_32px_rgba(38,34,29,0.18)]"
      >
        {children}
        <div aria-hidden="true" onPointerDown={(e) => controls.start(e)} className="absolute inset-y-0 left-0 z-50 w-[22px] touch-none" />
      </motion.div>
    </div>
  )
}
