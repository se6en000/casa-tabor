import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'

export interface TactileSheenBeamProps {
  className?: string
}

/**
 * Radiant Champagne Gold sheen beam that sweeps across a card on swap or category move.
 */
export function TactileSheenBeam({ className }: TactileSheenBeamProps) {
  return (
    <motion.div
      initial={{ x: '-100%' }}
      animate={{ x: '200%' }}
      transition={{ duration: 0.85, ease: 'easeInOut' }}
      className={cn(
        'absolute inset-0 bg-gradient-to-r from-transparent via-casa-gold/30 to-transparent pointer-events-none -skew-x-12 z-10',
        className
      )}
      aria-hidden="true"
    />
  )
}

export interface TactileSwapBadgeProps {
  type?: 'swap' | 'move'
  label?: string
  className?: string
}

/**
 * Micro-badge celebrating a completed swap or move action.
 */
export function TactileSwapBadge({ type = 'swap', label, className }: TactileSwapBadgeProps) {
  const displayLabel = label ?? (type === 'swap' ? '⇄ Swapped' : '✓ Moved')
  return (
    <motion.span
      initial={{ opacity: 0, scale: 0.6, x: -6 }}
      animate={{ opacity: 1, scale: 1, x: 0 }}
      exit={{ opacity: 0, scale: 0.6, x: -6 }}
      transition={{ duration: 0.25 }}
      className={cn(
        'inline-flex items-center gap-1 text-2xs font-mono font-bold px-2 py-0.5 rounded-full bg-casa-gold text-white shadow-2xs select-none shrink-0',
        className
      )}
    >
      {displayLabel}
    </motion.span>
  )
}

