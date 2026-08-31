import { useId, useRef } from 'react'
import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { modalPanelClassName, type ModalSize } from '../../design-system/variants.mjs'
import { IconButton } from './IconButton'
import { useDialogA11y } from './useDialogA11y'

export interface ModalProps {
  open: boolean
  onClose: () => void
  children: ReactNode
  size?: ModalSize
  /** Visible title text shown in the default header row. */
  title: ReactNode
  /** Renders the built-in header row (title + close IconButton). Default true. */
  showHeader?: boolean
  /** Clicking the backdrop calls onClose. Default true. */
  closeOnBackdrop?: boolean
  /** Pressing Escape calls onClose. Default true. */
  closeOnEscape?: boolean
  /** Disables the built-in close action while a blocking operation is running. */
  closeDisabled?: boolean
  className?: string
  panelClassName?: string
  contentClassName?: string
  onExitComplete?: () => void
}

/**
 * Centered dialog primitive. Owns the backdrop, entrance/exit animation
 * (framer-motion), focus-visible-safe close control, semantic z-index
 * (scrim/modal tokens), Escape-to-close, and body scroll lock — consumers
 * should never wrap Modal in another AnimatePresence/backdrop pair.
 */
export function Modal({
  open,
  onClose,
  children,
  size = 'md',
  title,
  showHeader = true,
  closeOnBackdrop = true,
  closeOnEscape = true,
  closeDisabled = false,
  className,
  panelClassName,
  contentClassName,
  onExitComplete,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogA11y(open, panelRef, onClose, closeOnEscape)

  return createPortal(
    <AnimatePresence onExitComplete={onExitComplete}>
      {open && (
        <div data-portal-modal="true" className={cn('fixed inset-0 z-modal flex items-center justify-center p-4', className)}>
          <motion.div
            key="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-scrim bg-black/40 backdrop-blur-sm"
            onClick={closeOnBackdrop ? onClose : undefined}
          />
          <motion.div
            ref={panelRef}
            key="modal-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={showHeader && title ? titleId : undefined}
            aria-label={!showHeader && typeof title === 'string' ? title : undefined}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={cn(modalPanelClassName({ size }), 'overflow-hidden border border-casa-border shadow-modal rounded-modal', panelClassName)}
          >
            {showHeader && (
              <div className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-casa-border bg-casa-surface px-6">
                <h3 id={titleId} className="font-serif text-2xl font-medium text-casa-navy leading-tight">{title}</h3>
                <IconButton
                  icon={<X size={18} />}
                  aria-label="Close"
                  size="sm"
                  variant="ghost"
                  disabled={closeDisabled}
                  onClick={onClose}
                  className="-mr-2"
                />
              </div>
            )}
            <div className={cn(showHeader ? 'px-6 pb-6' : 'p-6', contentClassName)}>{children}</div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
