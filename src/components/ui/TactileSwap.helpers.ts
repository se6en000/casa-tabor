import { useState, useRef, useCallback, useEffect } from 'react'
import type { TargetAndTransition, Transition } from 'framer-motion'
import { cn } from '../../utils/cn'

/**
 * Standard spring physics transition for drag-and-drop & reordering layout animations.
 */
export const TACTILE_SPRING_TRANSITION: Transition = {
  layout: { type: 'spring', stiffness: 350, damping: 26 },
}

/**
 * Standard keyframe pulse animation for items that have just swapped or moved.
 */
export const TACTILE_SWAP_SCALE_ANIMATION: TargetAndTransition = {
  scale: [1, 1.015, 0.995, 1],
  transition: { duration: 0.65, ease: 'easeOut' },
}

export interface TactileSwapState {
  ids: string[]
  type: 'swap' | 'move'
}

/**
 * Hook to manage transient swap & move animations across connected items.
 */
export function useTactileSwapState(durationMs = 2400) {
  const [swappedState, setSwappedState] = useState<TactileSwapState | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const triggerSwap = useCallback(
    (ids: string | string[], type: 'swap' | 'move' = 'swap') => {
      const idArray = Array.isArray(ids) ? ids : [ids]
      if (timerRef.current) clearTimeout(timerRef.current)
      setSwappedState({ ids: idArray, type })
      timerRef.current = setTimeout(() => {
        setSwappedState(null)
      }, durationMs)
    },
    [durationMs]
  )

  const isSwapped = useCallback(
    (id: string) => {
      return swappedState?.ids.includes(id) ?? false
    },
    [swappedState]
  )

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return {
    swappedState,
    triggerSwap,
    isSwapped,
    swapType: swappedState?.type ?? null,
  }
}

/**
 * Standard utility function to produce tactile drag-and-drop state classes.
 */
export function getTactileCardClasses({
  isDragging,
  isDragOver,
  isJustSwapped,
  baseClassName,
}: {
  isDragging?: boolean
  isDragOver?: boolean
  isJustSwapped?: boolean
  baseClassName?: string
}) {
  return cn(
    'transition-colors duration-200 select-none relative overflow-hidden',
    baseClassName,
    isJustSwapped && 'border-casa-gold ring-2 ring-inset ring-casa-gold/60 bg-casa-gold/10 shadow-sm',
    isDragging && 'border-dashed border-casa-gold/60 opacity-45',
    isDragOver && 'border-casa-gold ring-2 ring-inset ring-casa-gold/70 bg-casa-gold/15 shadow-sm'
  )
}
