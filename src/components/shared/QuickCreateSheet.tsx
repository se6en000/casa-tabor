import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus } from 'lucide-react'
import { addHours } from 'date-fns'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  open: boolean
  onClose: () => void
  /** The date/time of the tapped slot */
  initialStart?: Date
}

function toLocalDT(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function QuickCreateSheet({ open, onClose, initialStart }: Props) {
  const qc = useQueryClient()

  const defaultStart = initialStart ?? new Date()
  const defaultEnd   = addHours(defaultStart, 1)

  const [title,   setTitle]   = useState('')
  const [startDT, setStartDT] = useState(toLocalDT(defaultStart))
  const [endDT,   setEndDT]   = useState(toLocalDT(defaultEnd))
  const [saving,  setSaving]  = useState(false)

  // Re-initialise whenever the sheet opens with a new slot
  useEffect(() => {
    if (!open) return
    const s = initialStart ?? new Date()
    setTitle('')
    setStartDT(toLocalDT(s))
    setEndDT(toLocalDT(addHours(s, 1)))
    setSaving(false)
  }, [open, initialStart])

  const handleSave = async () => {
    if (!title.trim()) return
    setSaving(true)
    const start = new Date(startDT)
    const end   = new Date(endDT)
    if (isNaN(start.getTime()) || isNaN(end.getTime())) { setSaving(false); return }

    const { data: inserted, error } = await supabase.from('events').insert({
      title:      title.trim(),
      start_time: start.toISOString(),
      end_time:   end.toISOString(),
      status:     'confirmed',
      event_type: 'event',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).select('id').single()

    if (error) {
      alert(`Could not create event: ${error.message}`)
      setSaving(false)
      return
    }

    qc.invalidateQueries({ queryKey: ['events'] })
    navigator.vibrate?.(15)
    // Trigger weather fetch for the new event (fire-and-forget)
    if (inserted?.id) {
      supabase.functions.invoke('fetch-event-weather', { body: { event_id: inserted.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch(() => {})
    }
    onClose()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="qc-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black z-[60]"
            onClick={onClose}
          />

          <motion.div
            key="qc-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-casa-surface rounded-t-2xl shadow-modal sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-lg sm:rounded-2xl sm:bottom-8"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-casa-border">
              <h3 className="font-display text-display-sm text-casa-navy">New Event</h3>
              <button onClick={onClose} className="p-1 rounded-full hover:bg-casa-bg transition-colors">
                <X size={20} className="text-casa-muted" />
              </button>
            </div>

            {/* Form */}
            <div className="px-6 py-5 space-y-4">
              {/* Title */}
              <div>
                <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                  Event Title
                </label>
                <input
                  autoFocus
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') handleSave() }}
                  placeholder="What's happening?"
                  className="w-full px-4 py-2.5 rounded-xl border border-casa-border bg-casa-bg text-body text-casa-navy placeholder:text-casa-muted focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                />
              </div>

              {/* Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                    Start
                  </label>
                  <input
                    type="datetime-local"
                    value={startDT}
                    onChange={e => setStartDT(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-casa-border bg-casa-bg text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                  />
                </div>
                <div>
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1.5">
                    End
                  </label>
                  <input
                    type="datetime-local"
                    value={endDT}
                    onChange={e => setEndDT(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-casa-border bg-casa-bg text-body-sm text-casa-navy focus:outline-none focus:ring-2 focus:ring-casa-gold/40"
                  />
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 pb-6 pt-2">
              <button
                onClick={handleSave}
                disabled={!title.trim() || saving}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl font-semibold text-body transition-all bg-casa-navy text-white hover:bg-casa-navy/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus size={18} />
                {saving ? 'Creating…' : 'Create Event'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
