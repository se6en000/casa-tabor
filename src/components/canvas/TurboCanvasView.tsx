import { Plus } from 'lucide-react'
import { useTurboCanvasPresenter } from '../../hooks/useTurboCanvasPresenter'
import { Button } from '../ui'
import BriefingWidget from './widgets/BriefingWidget'
import ScheduleStreamWidget from './widgets/ScheduleStreamWidget'
import AttentionHubWidget from './widgets/AttentionHubWidget'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'

interface TurboCanvasViewProps {
  onOpenEvent: (event: EventWithDetails) => void
  onQuickCreate: () => void
}

export default function TurboCanvasView({ onOpenEvent, onQuickCreate }: TurboCanvasViewProps) {
  const {
    now,
    todayEvents,
    activeConflicts,
    activePrep,
    highlightedEventId,
    setHighlightedEventId,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    setCanvasSubmode,
  } = useTurboCanvasPresenter()

  return (
    <div className="w-full h-full flex flex-col p-4 sm:p-6 overflow-hidden">
      {/* ── Subheader Bar ── */}
      <div className="flex items-center justify-between pb-4 mb-4 border-b border-casa-border/50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="font-display text-heading font-bold text-casa-navy">
              Living Canvas <span className="text-amber-600 font-medium">· Turbo Triage</span>
            </h1>
          </div>
          <span className="text-caption text-casa-muted hidden sm:inline">
            3 synchronized panes · Instant 1-click household operations
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={onQuickCreate}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-casa-gold text-casa-navy hover:bg-amber-400 text-caption font-bold transition-all shadow-sm min-h-[44px]"
          >
            <Plus size={15} strokeWidth={2.5} />
            <span>New Event</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCanvasSubmode('calm')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-semibold transition-all shadow-sm min-h-[44px]"
          >
            <span>Return to Calm Mode 🌿</span>
          </Button>
        </div>
      </div>

      {/* ── 3-Pane Living Canvas Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* ── PANE 1: Daily Briefing & Logistics ── */}
        <BriefingWidget
          now={now}
          todayEvents={todayEvents}
          highlightedEventId={highlightedEventId}
          setHighlightedEventId={setHighlightedEventId}
          onOpenEvent={onOpenEvent}
        />

        {/* ── PANE 2: Today's Real-Time Timeline ── */}
        <ScheduleStreamWidget
          todayEvents={todayEvents}
          highlightedEventId={highlightedEventId}
          setHighlightedEventId={setHighlightedEventId}
          onOpenEvent={onOpenEvent}
        />

        {/* ── PANE 3: Attention Hub & 1-Click Resolvers ── */}
        <AttentionHubWidget
          activeConflicts={activeConflicts}
          activePrep={activePrep}
          handleResolveConflict={handleResolveConflict}
          handleCompletePrep={handleCompletePrep}
          handleDownvotePrep={handleDownvotePrep}
          handleSnoozePrep={handleSnoozePrep}
        />
      </div>
    </div>
  )
}
