import { useState } from 'react'
import { Plus, Zap, Calendar } from 'lucide-react'
import { useTurboCanvasPresenter } from '../../hooks/useTurboCanvasPresenter'
import { Button } from '../ui'
import ActionQueueWidget from './widgets/ActionQueueWidget'
import NowAndNextWidget from './widgets/NowAndNextWidget'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

interface TurboCanvasViewProps {
  onOpenEvent: (event: EventWithDetails) => void
  onQuickCreate: () => void
}

export default function TurboCanvasView({ onOpenEvent, onQuickCreate }: TurboCanvasViewProps) {
  const {
    now,
    todayEvents,
    tomorrowEvents,
    activeConflicts,
    activePrep,
    pushedPrep,
    familyMembers,
    weather,
    householdNarrative,
    copilotTip,
    highlightedEventId,
    setHighlightedEventId,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    handlePushPrep,
    handleRestorePushedPrep,
    handleBatchAutoTriage,
    openCopilotForConflict,
    setCanvasSubmode,
    getDriverAvailabilities,
  } = useTurboCanvasPresenter()

  // Mobile segmented tab switcher ('queue' vs 'schedule')
  const [mobileTab, setMobileTab] = useState<'queue' | 'schedule'>('queue')
  const totalActionable = activeConflicts.length + activePrep.length

  return (
    <div className="w-full h-full flex flex-col p-3 sm:p-5 md:p-6 overflow-hidden">
      {/* ── Subheader Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3.5 mb-3.5 border-b border-casa-border/50 flex-shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="font-display text-heading font-bold text-casa-navy">
              Living Canvas <span className="text-amber-600 font-medium">· Action Center</span>
            </h1>
          </div>
          <span className="text-caption text-casa-muted hidden md:inline">
            1-tap household logistics, ride assignments & time-anchored schedule
          </span>
        </div>

        {/* Mobile View Switcher (Only visible on small screens < lg) */}
        <div className="flex lg:hidden items-center justify-between gap-2">
          <div className="inline-flex p-1 rounded-2xl bg-casa-surface border border-casa-border/60">
            <Button
              size="sm"
              variant={mobileTab === 'queue' ? 'primary' : 'ghost'}
              onClick={() => setMobileTab('queue')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-bold transition-all min-h-[44px]',
                mobileTab === 'queue'
                  ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                  : 'text-casa-muted'
              )}
            >
              <Zap size={13} className="text-amber-600" />
              <span>Actions ({totalActionable})</span>
            </Button>

            <Button
              size="sm"
              variant={mobileTab === 'schedule' ? 'primary' : 'ghost'}
              onClick={() => setMobileTab('schedule')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-caption font-bold transition-all min-h-[44px]',
                mobileTab === 'schedule'
                  ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                  : 'text-casa-muted'
              )}
            >
              <Calendar size={13} className="text-casa-navy" />
              <span>Schedule ({todayEvents.length})</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              onClick={onQuickCreate}
              className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-casa-gold text-casa-navy text-caption font-bold min-h-[44px]"
            >
              <Plus size={14} strokeWidth={2.5} />
              <span>Add</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setCanvasSubmode('calm')}
              className="px-2.5 py-1.5 rounded-xl bg-casa-surface border border-casa-border text-casa-navy text-caption min-h-[44px]"
            >
              <span>🌿 Calm</span>
            </Button>
          </div>
        </div>

        {/* Desktop Controls (Visible on sm/md and above) */}
        <div className="hidden lg:flex items-center gap-2.5">
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

      {/* ── 2-Pane Living Canvas Action Center Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* ── PANE 1 (Left 60%): Action Queue & Task Engine ── */}
        <div className={cn('h-full min-h-0 lg:col-span-7 xl:col-span-7', mobileTab === 'queue' ? 'block' : 'hidden lg:block')}>
          <ActionQueueWidget
            activeConflicts={activeConflicts}
            activePrep={activePrep}
            pushedPrep={pushedPrep}
            familyMembers={familyMembers}
            getDriverAvailabilities={getDriverAvailabilities}
            handleResolveConflict={handleResolveConflict}
            handleCompletePrep={handleCompletePrep}
            handleDownvotePrep={handleDownvotePrep}
            handleSnoozePrep={handleSnoozePrep}
            handlePushPrep={handlePushPrep}
            handleRestorePushedPrep={handleRestorePushedPrep}
            handleBatchAutoTriage={handleBatchAutoTriage}
            openCopilotForConflict={openCopilotForConflict}
          />
        </div>

        {/* ── PANE 2 (Right 40%): Time-Anchored Now & Next Stream ── */}
        <div className={cn('h-full min-h-0 lg:col-span-5 xl:col-span-5', mobileTab === 'schedule' ? 'block' : 'hidden lg:block')}>
          <NowAndNextWidget
            now={now}
            todayEvents={todayEvents}
            tomorrowEvents={tomorrowEvents}
            householdNarrative={householdNarrative}
            copilotTip={copilotTip}
            weather={weather}
            familyMembers={familyMembers}
            highlightedEventId={highlightedEventId}
            setHighlightedEventId={setHighlightedEventId}
            onOpenEvent={onOpenEvent}
          />
        </div>
      </div>
    </div>
  )
}
