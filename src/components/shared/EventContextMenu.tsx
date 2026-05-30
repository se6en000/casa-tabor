import { useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Pencil, Trash2, CheckCircle } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { isReminder } from '../../utils/holidays'

interface Props {
  event: EventWithDetails | null
  /** Viewport coords of the long-press origin */
  x: number
  y: number
  onClose: () => void
  onEdit: (event: EventWithDetails) => void
  onDelete: (event: EventWithDetails) => void
  onComplete: (event: EventWithDetails) => void
}

export default function EventContextMenu({ event, x, y, onClose, onEdit, onDelete, onComplete }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Clamp menu so it doesn't overflow the viewport
  const menuW = 180
  const menuH = 130
  const clampedX = Math.min(x, window.innerWidth  - menuW - 8)
  const clampedY = Math.min(y, window.innerHeight - menuH - 8)

  useEffect(() => {
    if (!event) return  // only listen when menu is actually open
    const handleOutside = (e: TouchEvent | MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('touchstart', handleOutside, { passive: true })
    document.addEventListener('mousedown',  handleOutside)
    return () => {
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('mousedown',  handleOutside)
    }
  }, [event, onClose])

  return (
    <AnimatePresence>
      {event && (
        <>
          {/* Transparent backdrop to close on outside tap */}
          <div className="fixed inset-0 z-[90]" onClick={onClose} />

          <motion.div
            ref={menuRef}
            key="ctx-menu"
            initial={{ opacity: 0, scale: 0.88 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.88 }}
            transition={{ duration: 0.12 }}
            className="fixed z-[100] bg-casa-surface rounded-2xl shadow-modal border border-casa-border overflow-hidden"
            style={{ left: clampedX, top: clampedY, minWidth: menuW }}
            onClick={e => e.stopPropagation()}
          >
            {/* Event title header */}
            <div className="px-4 py-2.5 border-b border-casa-border">
              <p className="text-body-sm font-semibold text-casa-navy truncate max-w-[160px]">{event.title}</p>
            </div>

            {/* Actions */}
            <div className="py-1">
              <button
                onClick={() => { onEdit(event); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-casa-navy hover:bg-casa-bg transition-colors text-left"
              >
                <Pencil size={15} className="text-casa-muted shrink-0" />
                Edit event
              </button>

              {isReminder(event) && (
                <button
                  onClick={() => { onComplete(event); onClose() }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-emerald-600 hover:bg-emerald-50 transition-colors text-left"
                >
                  <CheckCircle size={15} className="shrink-0" />
                  Mark complete
                </button>
              )}

              <button
                onClick={() => { onDelete(event); onClose() }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-body-sm text-red-500 hover:bg-red-50 transition-colors text-left"
              >
                <Trash2 size={15} className="shrink-0" />
                Delete
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
