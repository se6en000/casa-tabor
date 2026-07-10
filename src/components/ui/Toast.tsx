import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Button } from './Button'
import { IconButton } from './IconButton'

export type ToastTone = 'info' | 'success' | 'danger'

export interface ToastProps {
  open: boolean
  message: ReactNode
  tone?: ToastTone
  onClose: () => void
  actionLabel?: string
  onAction?: () => void
}

export function Toast({ open, message, tone = 'info', onClose, actionLabel, onAction }: ToastProps) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'danger' ? XCircle : Info
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          role={tone === 'danger' ? 'alert' : 'status'}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className={cn(
            'fixed bottom-[calc(var(--spacing-nav-height)+1rem)] left-1/2 z-toast flex min-h-control -translate-x-1/2 items-center gap-3 rounded-card border bg-casa-surface px-4 py-3 shadow-modal',
            tone === 'danger' ? 'border-casa-error/40' : tone === 'success' ? 'border-casa-success/40' : 'border-casa-border',
          )}
        >
          <Icon size={20} className={tone === 'danger' ? 'text-casa-error' : tone === 'success' ? 'text-casa-success' : 'text-casa-info'} />
          <span className="text-body-sm font-semibold text-casa-text">{message}</span>
          {actionLabel && onAction && <Button variant="ghost" size="sm" onClick={onAction}>{actionLabel}</Button>}
          <IconButton icon={<XCircle size={18} />} aria-label="Dismiss notification" variant="ghost" size="sm" onClick={onClose} />
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
