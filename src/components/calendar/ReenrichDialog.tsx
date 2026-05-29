import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Sparkles } from 'lucide-react'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { useEnrichEvent } from '../../hooks/useEnrichEvent'

interface Props {
  event: EventWithDetails
  open: boolean
  onClose: () => void
}

export default function ReenrichDialog({ event, open, onClose }: Props) {
  const [context, setContext] = useState('')
  const enrich = useEnrichEvent()

  const handleEnrich = async () => {
    await enrich.mutateAsync({ eventId: event.id, extraContext: context.trim() || undefined })
    setContext('')
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="reenrich-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[80]"
            onClick={onClose}
          />
          <motion.div
            key="reenrich-dialog"
            initial={{ opacity: 0, scale: 0.95, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 8 }}
            transition={{ duration: 0.18 }}
            className={`fixed z-[90] bg-casa-surface rounded-2xl shadow-modal p-6 transition-shadow${enrich.isPending ? ' ai-thinking' : ''}`}
            style={{ top: '50%', left: '50%', transform: 'translate(-50%, -50%)', width: 'calc(100vw - 48px)', maxWidth: 380 }}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Sparkles size={18} className="text-casa-gold shrink-0" />
                <div>
                  <h3 className="font-display text-display-sm text-casa-navy leading-tight">Re-enrich with AI</h3>
                  <p className="text-caption text-casa-muted">{event.title}</p>
                </div>
              </div>
              <button onClick={onClose} className="text-casa-muted hover:text-casa-navy ml-3 shrink-0">
                <X size={18} />
              </button>
            </div>

            <p className="text-body-sm text-casa-muted mb-3 leading-relaxed">
              Add any extra context to help the AI fill in better details. Leave blank to re-run with the event info alone.
            </p>

            <textarea
              rows={3}
              value={context}
              onChange={e => setContext(e.target.value)}
              placeholder='e.g. "Dad is driving, she needs cleats and shin guards" or "AC company is coming between 2–4pm"'
              className="w-full bg-casa-bg border border-casa-border rounded-card px-4 py-3 text-body-sm text-casa-navy placeholder-casa-muted/50 resize-none outline-none focus:border-casa-gold transition-colors mb-4"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleEnrich() }}
            />

            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEnrich}
                disabled={enrich.isPending}
                className="flex-1 py-2.5 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {enrich.isPending ? <Sparkles size={14} className="animate-pulse" /> : <Sparkles size={14} />}
                {enrich.isPending ? 'AI is thinking…' : 'Enrich'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
