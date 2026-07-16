import { useEffect, useRef } from 'react'
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
  /** Passed to the outer wrapper div */
  onClick?: React.MouseEventHandler<HTMLDivElement>
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
export default function BounceScroll({ children, className, innerClassName, maxBounce = 72, onClick }: BounceScrollProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const y = useMotionValue(0)
  const springY = useSpring(y, { stiffness: 380, damping: 38, mass: 0.5 })

  const lastTouchY = useRef(0)
  const dragging = useRef(false)

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY.current = event.touches[0]?.clientY ?? 0
      dragging.current = true
    }
    const onTouchMove = (event: TouchEvent) => {
      if (!dragging.current || event.touches.length === 0) return
      const currentY = event.touches[0].clientY
      const delta = currentY - lastTouchY.current
      lastTouchY.current = currentY

      const atTop = element.scrollTop <= 0
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 1
      const cannotScroll = element.scrollHeight <= element.clientHeight
      const hitEdge = cannotScroll || (delta > 0 && atTop) || (delta < 0 && atBottom)

      event.stopPropagation()
      if (hitEdge) {
        if (event.cancelable) event.preventDefault()
        const sign = Math.sign(delta)
        const abs = Math.abs(delta)
        y.set(sign * Math.min(maxBounce * (1 - Math.exp(-abs / maxBounce)), maxBounce))
      } else if (y.get() !== 0) {
        y.set(0)
      }
    }
    const onTouchEnd = () => {
      dragging.current = false
      y.set(0)
    }

    element.addEventListener('touchstart', onTouchStart, { passive: true })
    element.addEventListener('touchmove', onTouchMove, { passive: false })
    element.addEventListener('touchend', onTouchEnd, { passive: true })
    element.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      element.removeEventListener('touchstart', onTouchStart)
      element.removeEventListener('touchmove', onTouchMove)
      element.removeEventListener('touchend', onTouchEnd)
      element.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [maxBounce, y])

  return (
    <div className={cn('relative overflow-hidden', className)} onClick={onClick}>
      <motion.div style={{ y: springY }} className="h-full w-full">
        <div
          ref={scrollRef}
          className={cn('overflow-y-auto overscroll-none touch-pan-y h-full w-full', innerClassName)}
          data-ptr-ignore
          style={{ overscrollBehaviorY: 'none', WebkitOverflowScrolling: 'touch' }}
        >
          {children}
        </div>
      </motion.div>
    </div>
  )
}
