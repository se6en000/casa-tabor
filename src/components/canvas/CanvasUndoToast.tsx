import { motion, AnimatePresence } from 'framer-motion'
import { RotateCcw, CheckCircle2, X } from 'lucide-react'
import { useAttentionStore } from '../../stores/attentionStore'
import { Button, IconButton } from '../ui'

export default function CanvasUndoToast() {
  const { activeToast, triggerUndo, dismissToast } = useAttentionStore()

  return (
    <AnimatePresence>
      {activeToast && (
        <motion.div
          initial={{ opacity: 0, y: 30, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
          className="fixed bottom-6 right-6 z-modal flex items-center gap-3.5 bg-casa-navy text-white px-4 py-3 rounded-2xl shadow-2xl border border-white/15 max-w-md"
        >
          <CheckCircle2 size={20} className="text-emerald-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-body-sm font-semibold leading-tight truncate">
              {activeToast.title}
            </p>
            <p className="text-caption text-white/60 leading-tight truncate mt-0.5">
              {activeToast.actionLabel}
            </p>
          </div>
          <Button
            size="sm"
            variant="primary"
            onClick={triggerUndo}
            className="bg-casa-gold text-casa-navy hover:bg-amber-300 font-bold text-caption uppercase tracking-wider shrink-0"
          >
            <RotateCcw size={12} strokeWidth={2.5} />
            Undo
          </Button>
          <IconButton
            variant="ghost"
            size="sm"
            aria-label="Dismiss toast"
            onClick={dismissToast}
            className="text-white/60 hover:text-white"
            icon={<X size={14} />}
          />
        </motion.div>
      )}
    </AnimatePresence>
  )
}
