import { useState } from 'react'
import { Plus, Zap, Calendar, Sparkles, CloudSun } from 'lucide-react'
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

  // Mobile segmented tab switcher ('schedule' vs 'queue')
  const [mobileTab, setMobileTab] = useState<'schedule' | 'queue'>('schedule')
  const totalActionable = activeConflicts.length + activePrep.length

  return (
    <div className="w-full h-full flex flex-col px-3 sm:px-4 md:px-5 pt-2 sm:pt-2.5 pb-3 overflow-hidden">
      {/* ── Consolidated Cockpit Subheader (Option 1: Max Height) ── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-2 mb-2 border-b border-casa-border/50 flex-shrink-0 gap-2">
        {/* Left: Title + Ambient Briefing Pill */}
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse" />
            <h1 className="font-display text-body-lg sm:text-heading font-bold text-casa-navy whitespace-nowrap">
              Living Canvas <span className="text-amber-600 font-medium">· Action Center</span>
            </h1>
          </div>

          {/* Inline Ambient Briefing Pill */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1 rounded-full bg-casa-gold/10 border border-casa-gold/25 min-w-0 flex-1 max-w-xl">
            <Sparkles size={13} className="text-casa-gold shrink-0" />
            <span className="text-caption text-casa-navy font-medium truncate">
              {copilotTip ? `${copilotTip}` : householdNarrative}
            </span>
          </div>
        </div>

        {/* Right: Controls, Weather & Action Buttons */}
        <div className="flex items-center gap-2 shrink-0 justify-between md:justify-end">
          {/* Mobile View Switcher (Only visible on small screens < lg) */}
          <div className="inline-flex lg:hidden p-0.5 rounded-xl bg-casa-surface border border-casa-border/60">
            <Button
              size="sm"
              variant={mobileTab === 'schedule' ? 'primary' : 'ghost'}
              onClick={() => setMobileTab('schedule')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-bold transition-all min-h-[36px]',
                mobileTab === 'schedule'
                  ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                  : 'text-casa-muted'
              )}
            >
              <Calendar size={13} className="text-casa-navy" />
              <span>Schedule ({todayEvents.length})</span>
            </Button>

            <Button
              size="sm"
              variant={mobileTab === 'queue' ? 'primary' : 'ghost'}
              onClick={() => setMobileTab('queue')}
              className={cn(
                'flex items-center gap-1 px-2.5 py-1 rounded-lg text-caption font-bold transition-all min-h-[36px]',
                mobileTab === 'queue'
                  ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                  : 'text-casa-muted'
              )}
            >
              <Zap size={13} className="text-amber-600" />
              <span>Actions ({totalActionable})</span>
            </Button>
          </div>

          {/* Desktop Weather Pill */}
          {weather && (
            <div className="hidden xl:flex items-center gap-1.5 text-caption font-mono text-casa-navy bg-casa-surface px-2.5 py-1 rounded-xl border border-casa-border/50 shadow-2xs">
              <CloudSun size={13} className="text-casa-gold" />
              <span className="font-bold">{weather.temp}°F</span>
              <span className="text-casa-muted">· {weather.condition}</span>
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={onQuickCreate}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-casa-gold text-casa-navy hover:bg-amber-400 text-caption font-bold transition-all shadow-xs min-h-[44px]"
          >
            <Plus size={14} strokeWidth={2.5} />
            <span>New Event</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => setCanvasSubmode('calm')}
            className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-semibold transition-all shadow-xs min-h-[44px]"
          >
            <span>🌿 Calm</span>
          </Button>
        </div>
      </div>

      {/* ── 2-Pane Living Canvas Action Center Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* ── PANE 1 (Left 60%): Time-Anchored Now & Next Stream ── */}
        <div className={cn('h-full min-h-0 lg:col-span-7 xl:col-span-7 flex flex-col overflow-hidden', mobileTab === 'schedule' ? 'flex' : 'hidden lg:flex')}>
          <NowAndNextWidget
            now={now}
            todayEvents={todayEvents}
            tomorrowEvents={tomorrowEvents}
            familyMembers={familyMembers}
            highlightedEventId={highlightedEventId}
            setHighlightedEventId={setHighlightedEventId}
            onOpenEvent={onOpenEvent}
          />
        </div>

        {/* ── PANE 2 (Right 40%): Action Queue & Task Engine ── */}
        <div className={cn('h-full min-h-0 lg:col-span-5 xl:col-span-5 flex flex-col overflow-hidden', mobileTab === 'queue' ? 'flex' : 'hidden lg:flex')}>
          <ActionQueueWidget
            activeConflicts={activeConflicts}
            activePrep={activePrep}
            pushedPrep={pushedPrep}
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
      </div>
    </div>
  )
}
