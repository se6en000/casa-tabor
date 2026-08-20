import { AnimatePresence, motion } from 'framer-motion'
import PalmBeachFolioCard from '../calendar/PalmBeachFolioCard'

interface Props {
  open: boolean
  onClose: () => void
  /** The date/time of the tapped slot */
  initialStart?: Date
  /** Optional initial natural language query to parse and prefill */
  initialQuery?: string
}

export default function QuickCreateSheet({ open, onClose, initialStart, initialQuery }: Props) {
  if (!open) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-modal flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
        {/* Soft Luxury Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/40 backdrop-blur-xs"
        />

        {/* Floating Palm Beach Folio Card */}
        <div className="relative z-10 w-full max-w-lg flex justify-center my-auto">
          <PalmBeachFolioCard
            contextDate={initialStart || new Date()}
            initialStart={initialStart}
            initialQuery={initialQuery}
            mode="popover"
            onClose={onClose}
            className="w-full max-w-lg shadow-2xl"
          />
        </div>
      </div>
    </AnimatePresence>
  )
}
