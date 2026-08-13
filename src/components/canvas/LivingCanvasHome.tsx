import { useState, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import CalmKioskView from './CalmKioskView'
import TurboCanvasView from './TurboCanvasView'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { openEventDetails } from '../../utils/openEventDetails'
import QuickCreateSheet from '../shared/QuickCreateSheet'

export default function LivingCanvasHome() {
  const { canvasSubmode } = useAppStore()
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)

  const handleOpenEvent = useCallback((event: EventWithDetails) => {
    openEventDetails(event.id)
  }, [])

  return (
    <div className="w-full h-full relative overflow-hidden bg-casa-bg flex flex-col">
      <AnimatePresence mode="wait">
        {canvasSubmode === 'calm' ? (
          <motion.div
            key="calm-view"
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full h-full flex-1 overflow-hidden"
          >
            <CalmKioskView onOpenEvent={handleOpenEvent} />
          </motion.div>
        ) : (
          <motion.div
            key="turbo-view"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -15 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full h-full flex-1 overflow-hidden"
          >
            <TurboCanvasView
              onOpenEvent={handleOpenEvent}
              onQuickCreate={() => setQuickCreateOpen(true)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      <QuickCreateSheet
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
      />
    </div>
  )
}
