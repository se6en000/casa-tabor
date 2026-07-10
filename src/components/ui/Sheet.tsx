import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import type { TargetAndTransition } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { sheetPanelClassName, type SheetSide } from '../../design-system/variants.mjs'
import { IconButton } from './IconButton'
import { useDialogA11y } from './useDialogA11y'

export interface SheetProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  side?: SheetSide
  title: ReactNode
  showHeader?: boolean
  closeOnBackdrop?: boolean
  closeOnEscape?: boolean
  className?: string
  panelClassName?: string
}

const SLIDE_TRANSFORM: Record<SheetSide, { initial: TargetAndTransition; animate: TargetAndTransition; exit: TargetAndTransition }> = {
  bottom: { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } },
  right: { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } },
}

/**
 * Edge-anchored drawer primitive (bottom sheet on phone/kiosk, or a
 * right-side drawer). Owns the backdrop, slide animation, semantic
 * z-index (scrim/modal tokens), Escape-to-close, and body scroll lock —
 * mirrors Modal's ownership contract so consumers never double-wrap.
 */
export function Sheet({
  open,
  onClose,
  children,
  side = 'bottom',
  title,
  showHeader = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  className,
  panelClassName,
}: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(open, panelRef, onClose, closeOnEscape)

  const transform = SLIDE_TRANSFORM[side]

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-modal', className)}>
          <motion.div
            key="sheet-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-scrim bg-black/40"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            key="sheet-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={showHeader && title ? titleId : undefined}
            aria-label={!showHeader && typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={transform.initial}
            animate={transform.animate}
            exit={transform.exit}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className={cn(sheetPanelClassName({ side }), 'flex flex-col', panelClassName)}
          >
            {showHeader && (
              <div className="flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-casa-border flex-shrink-0">
                <h3 id={titleId} className="font-display text-heading text-casa-navy">{title}</h3>
                <IconButton icon={<X size={20} />} aria-label="Close" size="sm" variant="ghost" onClick={onClose} />
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto p-5">{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
