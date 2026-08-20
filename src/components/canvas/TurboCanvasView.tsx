import { useState, useMemo } from 'react'
import { Zap, Truck } from 'lucide-react'
import { useTurboCanvasPresenter } from '../../hooks/useTurboCanvasPresenter'
import { clusterPrepItems } from '../../utils/prepItemClusters'
import { splitActionableAndTransitItems } from '../../utils/needsYouFeed.ts'
import { Button } from '../ui'
import ActionQueueWidget from './widgets/ActionQueueWidget'
import EstateLogisticsWidget from './widgets/EstateLogisticsWidget'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import GmailSyncStatusIndicator from '../shared/GmailSyncStatusIndicator'

interface TurboCanvasViewProps {
  onOpenEvent: (event: EventWithDetails) => void
  onQuickCreate: () => void
}

export default function TurboCanvasView({ onOpenEvent: _onOpenEvent, onQuickCreate: _onQuickCreate }: TurboCanvasViewProps) {
  const {
    activeConflicts,
    activePrep,
    pushedPrep,
    familyMembers,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    handlePushPrep,
    handleRestorePushedPrep,
    handleBatchAutoTriage,
    openCopilotForConflict,
    getDriverAvailabilities,
  } = useTurboCanvasPresenter()

  // Mobile segmented tab switcher ('logistics' vs 'queue')
  const [mobileTab, setMobileTab] = useState<'logistics' | 'queue'>('logistics')

  const { actionableItems, deliveryTransitItems } = useMemo(
    () => splitActionableAndTransitItems(activePrep),
    [activePrep]
  )

  const clusteredPrep = useMemo(() => clusterPrepItems(actionableItems), [actionableItems])
  const totalActionable = activeConflicts.length + clusteredPrep.length
  const totalDeliveries = deliveryTransitItems.length

  return (
    <div className="w-full h-full flex flex-col px-3 sm:px-4 md:px-5 pt-2 sm:pt-3 pb-3 overflow-hidden">
      {/* ── Mobile View Switcher (Only visible on small screens < lg) ── */}
      <div className="lg:hidden flex items-center justify-between pb-2 mb-2 border-b border-casa-border/40 shrink-0">
        <div className="inline-flex p-0.5 rounded-xl bg-casa-surface border border-casa-border/60 w-full sm:w-auto justify-center">
          <Button
            size="sm"
            variant={mobileTab === 'logistics' ? 'primary' : 'ghost'}
            onClick={() => setMobileTab('logistics')}
            className={cn(
              'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-caption font-bold transition-all min-h-[40px]',
              mobileTab === 'logistics'
                ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                : 'text-casa-muted'
            )}
          >
            <Truck size={13} className="text-casa-navy" />
            <span>Deliveries ({totalDeliveries})</span>
          </Button>

          <Button
            size="sm"
            variant={mobileTab === 'queue' ? 'primary' : 'ghost'}
            onClick={() => setMobileTab('queue')}
            className={cn(
              'flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-caption font-bold transition-all min-h-[40px]',
              mobileTab === 'queue'
                ? 'bg-casa-gold/20 text-casa-navy border border-casa-gold/40 shadow-2xs'
                : 'text-casa-muted'
            )}
          >
            <Zap size={13} className="text-amber-600" />
            <span>Actions ({totalActionable})</span>
          </Button>
        </div>
      </div>

      {/* ── Gmail Sync Health Warning Banner ── */}
      <GmailSyncStatusIndicator variant="compact" className="mb-3 shrink-0" />

      {/* ── 2-Pane Living Canvas Action Center Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 sm:gap-4 flex-1 min-h-0 items-stretch overflow-hidden">
        {/* ── PANE 1 (Left 50%): Estate Logistics & Inbound Delivery Radar ── */}
        <div className={cn('h-full min-h-0 lg:col-span-6 xl:col-span-6 flex flex-col overflow-hidden', mobileTab === 'logistics' ? 'flex' : 'hidden lg:flex')}>
          <EstateLogisticsWidget
            activePrep={activePrep}
            familyMembers={familyMembers}
            onDismissDelivery={handleCompletePrep}
          />
        </div>

        {/* ── PANE 2 (Right 50%): Action Queue & Task Engine ── */}
        <div className={cn('h-full min-h-0 lg:col-span-6 xl:col-span-6 flex flex-col overflow-hidden', mobileTab === 'queue' ? 'flex' : 'hidden lg:flex')}>
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
      </div>
    </div>
  )
}
