import { useRef, useCallback } from 'react'
import { motion, useMotionValue, useSpring } from 'framer-motion'
import { cn } from '../../utils/cn'

interface BounceScrollProps {
  children: React.ReactNode
  /** Classes for the outer sizing wrapper (flex-1, h-full, etc.) */
  className?: string
  /** Classes for the inner scrollable div (p-6, space-y-6, etc.) */
  innerClassName?: string
  /** Max rubber-band distance in px (default 72) */
  maxBounce?: number
}

/**
 * Drop-in replacement for overflow-y-auto containers.
 * Adds iOS-style rubber-band bounce when you hit the top or bottom edge.
 *
 * Usage:
 *   <BounceScroll className="flex-1" innerClassName="p-6 space-y-4">
 *     {content}
 *   </BounceScroll>
 */
export default function BounceScroll({ children, className, innerClassName, maxBounce = 72 }: BounceScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const springY = useSpring(y, { stiffness: 380, damping: 38, mass: 0.5 })

  const touchStartY = useRef(0)
  const dragging = useRef(false)

  const atTop = () => (scrollRef.current?.scrollTop ?? 0) <= 0
  const atBottom = () => {
    const el = scrollRef.current
    if (!el) return false
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 1
  }

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY
    dragging.current = true
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragging.current) return
    const delta = e.touches[0].clientY - touchStartY.current
    const hitTop = delta > 0 && atTop()
    const hitBottom = delta < 0 && atBottom()

    if (hitTop || hitBottom) {
      // Sqrt resistance curve — feels like iOS rubber-band
      const sign = Math.sign(delta)
      const abs = Math.abs(delta)
      const bounced = sign * Math.min(maxBounce * (1 - Math.exp(-abs / maxBounce)), maxBounce)
      y.set(bounced)
    } else if (y.get() !== 0) {
      y.set(0)
    }
  }, [maxBounce, y])

  const onTouchEnd = useCallback(() => {
    dragging.current = false
    y.set(0)
  }, [y])

  return (
    <div className={cn('relative overflow-hidden', className)}>
      <motion.div style={{ y: springY }} className="h-full w-full">
        <div
          ref={scrollRef}
          className={cn('overflow-y-auto overscroll-none h-full w-full', innerClassName)}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
