import { Zap, AlertTriangle, CheckCircle2, Check, ThumbsDown } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button, IconButton } from '../../ui'
import type { PrepItem, Conflict } from '../../../types'
import type { SnoozeDuration } from '../../../utils/snoozeDuration'

interface AttentionHubWidgetProps {
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  handleResolveConflict: (conflict: Conflict, resolution: string) => void
  handleCompletePrep: (item: PrepItem) => void
  handleDownvotePrep: (item: PrepItem) => void
  handleSnoozePrep: (id: string, period: SnoozeDuration) => void
}

export default function AttentionHubWidget({
  activeConflicts,
  activePrep,
  handleResolveConflict,
  handleCompletePrep,
  handleDownvotePrep,
  handleSnoozePrep,
}: AttentionHubWidgetProps) {
  return (
    <div className="lg:col-span-4 flex flex-col rounded-3xl bg-casa-surface border border-casa-border/60 shadow-sm p-5 overflow-hidden">
      <div className="flex items-center justify-between pb-3 mb-3 border-b border-casa-border/40 shrink-0">
        <div className="flex items-center gap-2">
          <Zap size={16} className="text-amber-500" />
          <h2 className="font-display text-body-lg font-bold text-casa-navy">
            Attention Hub
          </h2>
        </div>
        <span className="text-caption font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900">
          {activeConflicts.length + activePrep.length} Actionable
        </span>
      </div>

      <div className="flex-1 overflow-y-auto pr-1 space-y-3">
        {/* 1. Schedule Conflicts */}
        {activeConflicts.map((c) => (
          <motion.div
            key={c.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-2xl bg-amber-50/60 border border-amber-300/60 shadow-sm relative"
          >
            <div className="flex items-center gap-2 mb-1.5">
              <AlertTriangle size={15} className="text-amber-600 shrink-0" />
              <span className="text-caption font-bold text-amber-900 uppercase tracking-wide">
                {c.conflict_type === 'drive_time' ? 'Ride Needed' : 'Schedule Conflict'}
              </span>
            </div>

            <p className="text-body-sm font-semibold text-casa-navy leading-snug">
              {c.description || 'Simultaneous events require driver coordination'}
            </p>

            {/* 1-Click Resolvers (44px Touch Targets) */}
            <div className="mt-3 pt-3 border-t border-amber-200/60 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleResolveConflict(c, 'Assigned Sarah as driver')}
                className="px-3.5 py-2 rounded-xl bg-amber-500 text-white hover:bg-amber-600 text-caption font-bold shadow-sm transition-all min-h-[44px]"
              >
                Assign Sarah
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleResolveConflict(c, 'Assigned Luke as driver')}
                className="px-3.5 py-2 rounded-xl bg-casa-navy text-white hover:bg-slate-800 text-caption font-bold shadow-sm transition-all min-h-[44px]"
              >
                Assign Luke
              </Button>
            </div>
          </motion.div>
        ))}

        {/* 2. Prep & Action Items */}
        {activePrep.map((item) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="p-4 rounded-2xl bg-casa-bg/60 border border-casa-border/70 hover:border-casa-gold/60 transition-all shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <span className="text-caption font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-navy">
                  {item.source_type || 'Prep Task'}
                </span>
                <h4 className="text-body-sm font-bold text-casa-navy mt-1.5 leading-snug">
                  {item.description || item.event_title || 'Prep Item'}
                </h4>
              </div>
            </div>

            {/* 1-Click Action Buttons (44px Touch Targets) */}
            <div className="mt-3 pt-3 border-t border-casa-border/40 flex items-center justify-between gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleCompletePrep(item)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 text-caption font-bold transition-all shadow-sm min-h-[44px]"
              >
                <Check size={14} strokeWidth={2.5} />
                <span>Done</span>
              </Button>

              <div className="flex items-center gap-1.5">
                <IconButton
                  variant="ghost"
                  size="sm"
                  aria-label="Mark not relevant"
                  onClick={() => handleDownvotePrep(item)}
                  className="p-2.5 rounded-xl text-casa-muted hover:text-rose-600 hover:bg-rose-50 transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                  icon={<ThumbsDown size={15} />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleSnoozePrep(item.id, 'tomorrow')}
                  aria-label="Snooze 1 day"
                  className="text-caption font-semibold px-3 py-2 rounded-xl text-casa-muted hover:text-casa-navy hover:bg-casa-surface transition-colors min-h-[44px]"
                >
                  Snooze 1d
                </Button>
              </div>
            </div>
          </motion.div>
        ))}

        {/* Zero State */}
        {activeConflicts.length === 0 && activePrep.length === 0 && (
          <div className="flex flex-col items-center justify-center h-56 text-center p-6 bg-emerald-50/50 rounded-2xl border border-emerald-200">
            <CheckCircle2 size={36} className="text-emerald-600 mb-2" />
            <h4 className="font-display text-body-lg font-bold text-emerald-900">
              Household in Harmony
            </h4>
            <p className="text-caption text-emerald-700 mt-1 max-w-xs">
              Zero pending conflicts or overdue preparation tasks.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
