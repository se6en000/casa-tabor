import { useState, useMemo } from 'react'
import {
  Truck,
  Package,
  ShoppingCart,
  CheckCircle2,
  Clock,
  ExternalLink,
  Mail,
  Layers,
  X,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { Button, IconButton } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, DeliveryTransitItem, DeliveryTransitStage, FamilyMember } from '../../../types'
import {
  isDeliveryTransitItem,
  buildDeliveryTransitItem,
  stageStepIndex,
} from '../../../utils/vendorTransactions.ts'
import { buildGmailWebUrl } from '../../../utils/prepItemClusters'
import { useAppStore } from '../../../stores/appStore'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { isToday } from 'date-fns'

export type LogisticsFilterTab = 'all' | 'today' | 'in_transit' | 'delivered'

interface EstateLogisticsWidgetProps {
  activePrep?: PrepItem[]
  familyMembers?: FamilyMember[]
  onDismissDelivery?: (item: PrepItem) => void
}

function resolveVendorIcon(vendor: string) {
  const v = vendor.toLowerCase()
  if (v.includes('whole foods') || v.includes('instacart') || v.includes('hellofresh') || v.includes('grocery')) {
    return ShoppingCart
  }
  if (v.includes('fedex') || v.includes('ups') || v.includes('usps') || v.includes('courier')) {
    return Truck
  }
  return Package
}

function isItemArrivingToday(item: DeliveryTransitItem, _now: Date): boolean {
  if (item.stage === 'out_for_delivery') return true
  const text = `${item.title} ${item.itemSummary} ${item.etaDisplay || ''}`.toLowerCase()
  if (text.includes('today') || text.includes('arriving today')) return true
  if (item.rawItem.due_by && isToday(new Date(item.rawItem.due_by))) return true
  if (item.rawItem.event_date && isToday(new Date(item.rawItem.event_date))) return true
  return false
}

function isItemInTransit(item: DeliveryTransitItem): boolean {
  return item.stage === 'shipped' || item.stage === 'out_for_delivery' || item.stage === 'confirmed' || item.stage === 'payment'
}

function isItemDelivered(item: DeliveryTransitItem): boolean {
  return item.stage === 'delivered'
}

export default function EstateLogisticsWidget({
  activePrep = [],
  familyMembers = [],
  onDismissDelivery,
}: EstateLogisticsWidgetProps) {
  const { openActionInSidecar, selectedSidecarActionId, sidecarTab } = useAppStore()
  const now = useLiveClock(30_000)
  const [activeTab, setActiveTab] = useState<LogisticsFilterTab>('all')
  const [optimisticallyDismissedKeys, setOptimisticallyDismissedKeys] = useState<Set<string>>(new Set())

  const handleDismissItem = (e: React.MouseEvent, item: DeliveryTransitItem) => {
    e.stopPropagation()
    setOptimisticallyDismissedKeys((prev) => {
      const next = new Set(prev)
      next.add(item.threadKey)
      next.add(item.id)
      return next
    })
    if (onDismissDelivery && item.rawItem) {
      onDismissDelivery(item.rawItem)
    }
  }

  // Extract and build unique transit items
  const allTransitItems = useMemo<DeliveryTransitItem[]>(() => {
    const transitMap = new Map<string, DeliveryTransitItem>()

    for (const item of activePrep) {
      if (isDeliveryTransitItem(item)) {
        const transit = buildDeliveryTransitItem(item)
        if (optimisticallyDismissedKeys.has(transit.threadKey) || optimisticallyDismissedKeys.has(item.id)) {
          continue
        }
        const existing = transitMap.get(transit.threadKey)
        if (!existing || new Date(transit.occurredAt) >= new Date(existing.occurredAt)) {
          transitMap.set(transit.threadKey, transit)
        }
      }
    }

    return Array.from(transitMap.values()).sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
    )
  }, [activePrep, optimisticallyDismissedKeys])

  // Sub-counts for filter badges
  const todayItems = useMemo(
    () => allTransitItems.filter((i) => isItemArrivingToday(i, now)),
    [allTransitItems, now]
  )
  const inTransitItems = useMemo(
    () => allTransitItems.filter(isItemInTransit),
    [allTransitItems]
  )
  const deliveredItems = useMemo(
    () => allTransitItems.filter(isItemDelivered),
    [allTransitItems]
  )

  // Filtered view
  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'today':
        return todayItems
      case 'in_transit':
        return inTransitItems
      case 'delivered':
        return deliveredItems
      case 'all':
      default:
        return allTransitItems
    }
  }, [activeTab, todayItems, inTransitItems, deliveredItems, allTransitItems])

  // Pick the top priority delivery for the Hero Spotlight slot
  const { heroItem, ledgerItems } = useMemo(() => {
    if (filteredItems.length === 0) return { heroItem: null, ledgerItems: [] }
    // Priority: Perishable -> Out for delivery today -> In Transit -> First item
    const heroIdx = filteredItems.findIndex((i) => i.isPerishable) >= 0
      ? filteredItems.findIndex((i) => i.isPerishable)
      : filteredItems.findIndex((i) => i.stage === 'out_for_delivery') >= 0
      ? filteredItems.findIndex((i) => i.stage === 'out_for_delivery')
      : 0

    const hero = filteredItems[heroIdx]
    const remaining = filteredItems.filter((_, idx) => idx !== heroIdx)
    return { heroItem: hero, ledgerItems: remaining }
  }, [filteredItems])

  // Partition ledger items by temporal bucket
  const { todayLedger, upcomingLedger, deliveredLedger } = useMemo(() => {
    const today: DeliveryTransitItem[] = []
    const upcoming: DeliveryTransitItem[] = []
    const delivered: DeliveryTransitItem[] = []

    for (const item of ledgerItems) {
      if (item.stage === 'delivered') {
        delivered.push(item)
      } else if (isItemArrivingToday(item, now)) {
        today.push(item)
      } else {
        upcoming.push(item)
      }
    }

    return { todayLedger: today, upcomingLedger: upcoming, deliveredLedger: delivered }
  }, [ledgerItems, now])

  return (
    <div className="w-full h-full flex flex-col bg-transparent overflow-hidden min-h-0 relative">
      {/* ── Widget Header: Palm Beach Estate Logistics Manifest ── */}
      <div className="flex items-center justify-between pb-3 mb-1 shrink-0 px-0.5">
        <div>
          <h2 className="font-display text-display-sm font-bold text-casa-navy leading-none tracking-tight">
            Estate Inbound Manifest
          </h2>
          <p className="text-caption text-casa-muted mt-1 font-medium">
            Inbound Deliveries &amp; Courier Ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          {inTransitItems.length > 0 && (
            <span className="inline-flex items-center gap-1 text-caption font-mono font-bold px-3 py-1.5 rounded-full bg-sky-50 text-sky-900 border border-sky-200 shadow-2xs">
              <Truck size={13} className="text-sky-700" />
              <span>{inTransitItems.length} In Transit</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Filter Capsules Strip: All | Arriving Today | In Transit | Delivered ── */}
      <div className="flex items-center gap-1.5 pb-3 overflow-x-auto no-scrollbar shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('all')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[40px] flex items-center gap-1.5 shrink-0',
            activeTab === 'all'
              ? 'bg-casa-navy text-white shadow-xs'
              : 'bg-casa-surface border border-casa-border/80 text-casa-muted hover:text-casa-navy'
          )}
        >
          <Layers size={13} className={activeTab === 'all' ? 'text-casa-gold' : 'text-casa-muted'} />
          <span>All ({allTransitItems.length})</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('today')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[40px] flex items-center gap-1.5 shrink-0',
            activeTab === 'today'
              ? 'bg-amber-600 text-white shadow-xs'
              : 'bg-casa-surface border border-casa-border/80 text-casa-muted hover:text-casa-navy'
          )}
        >
          <Clock size={13} className={activeTab === 'today' ? 'text-amber-200' : 'text-amber-600'} />
          <span>Arriving Today ({todayItems.length})</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('in_transit')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[40px] flex items-center gap-1.5 shrink-0',
            activeTab === 'in_transit'
              ? 'bg-sky-600 text-white shadow-xs'
              : 'bg-casa-surface border border-casa-border/80 text-casa-muted hover:text-casa-navy'
          )}
        >
          <Truck size={13} className={activeTab === 'in_transit' ? 'text-sky-200' : 'text-sky-600'} />
          <span>In Transit ({inTransitItems.length})</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('delivered')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[40px] flex items-center gap-1.5 shrink-0',
            activeTab === 'delivered'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-casa-surface border border-casa-border/80 text-casa-muted hover:text-casa-navy'
          )}
        >
          <CheckCircle2 size={13} className={activeTab === 'delivered' ? 'text-emerald-200' : 'text-emerald-600'} />
          <span>Delivered ({deliveredItems.length})</span>
        </Button>
      </div>

      {/* ── Scrollable Editorial Manifest Container ── */}
      <div className="flex-1 overflow-y-auto pr-1 space-y-4 min-h-0 touch-pan-y overscroll-contain pb-6">
        {filteredItems.length > 0 ? (
          <>
            {/* ── 1. HERO ARRIVAL SPOTLIGHT PLINTH ── */}
            {heroItem && (() => {
              const HeroIcon = resolveVendorIcon(heroItem.vendor)
              const step = stageStepIndex(heroItem.stage as DeliveryTransitStage)
              const isSelected = selectedSidecarActionId === heroItem.id && sidecarTab === 'action'
              const isOutForDelivery = heroItem.stage === 'out_for_delivery'

              return (
                <div
                  key={heroItem.threadKey}
                  onClick={() => openActionInSidecar(heroItem.id)}
                  className={cn(
                    'p-5 rounded-3xl bg-casa-surface transition-all flex flex-col gap-3.5 relative border shadow-card cursor-pointer group hover:shadow-card-hover',
                    isSelected
                      ? 'border-casa-gold ring-2 ring-casa-gold/30'
                      : isOutForDelivery
                      ? 'border-amber-300/90 bg-amber-50/20'
                      : 'border-casa-gold/30 hover:border-casa-gold/60'
                  )}
                >
                  {/* Top Header */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0">
                        <HeroIcon size={16} className="text-casa-gold" />
                      </div>

                      <span className="text-body-sm font-bold text-casa-navy truncate">
                        {heroItem.vendor}
                      </span>

                      {heroItem.isPerishable && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300 shadow-2xs">
                          <ShoppingCart size={11} className="text-emerald-700" />
                          <span>Perishable Grocery</span>
                        </span>
                      )}

                      {isOutForDelivery && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-2xs font-bold bg-amber-100 text-amber-950 border border-amber-300 shadow-2xs">
                          <Clock size={11} className="text-amber-700 animate-pulse" />
                          <span>Out for Delivery</span>
                        </span>
                      )}

                      <span className="inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-top-pick-band border border-casa-gold/30">
                        <Sparkles size={10} className="text-casa-gold" />
                        <span>Imminent Arrival</span>
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      {heroItem.rawItem && (heroItem.rawItem.source_type === 'gmail' || heroItem.rawItem.source_ref?.startsWith('gmail:')) && (
                        <a
                          href={buildGmailWebUrl(heroItem.rawItem, null, familyMembers)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 shadow-2xs transition-colors no-underline min-h-[30px]"
                          title="Open original delivery email in Gmail"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Mail size={11} className="text-red-600 shrink-0" />
                          <span>Gmail</span>
                          <ExternalLink size={9} className="text-red-500 shrink-0" />
                        </a>
                      )}

                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label="Inspect details in sidecar"
                        title="Inspect details in sidecar"
                        onClick={(e) => {
                          e.stopPropagation()
                          openActionInSidecar(heroItem.id)
                        }}
                        className="text-casa-muted hover:text-casa-navy min-h-[36px] min-w-[36px]"
                        icon={<ExternalLink size={14} />}
                      />

                      <IconButton
                        size="sm"
                        variant="ghost"
                        aria-label="Dismiss this delivery instance"
                        title="Dismiss this delivery (future orders from this sender will still appear)"
                        onClick={(e) => handleDismissItem(e, heroItem)}
                        className="text-casa-muted hover:text-rose-600 hover:bg-rose-50 min-h-[36px] min-w-[36px] transition-colors rounded-xl"
                        icon={<X size={15} />}
                      />
                    </div>
                  </div>

                  {/* Summary & ETA */}
                  <div className="space-y-1">
                    <p className="text-body sm:text-body-lg font-bold text-casa-navy group-hover:text-casa-gold-hover transition-colors leading-snug">
                      {heroItem.itemSummary}
                    </p>

                    {heroItem.etaDisplay && (
                      <div className="flex items-center gap-1.5 text-caption font-medium text-casa-muted">
                        <Clock size={13} className="text-casa-gold shrink-0" />
                        <span>ETA: <strong className="text-casa-navy font-semibold">{heroItem.etaDisplay}</strong></span>
                      </div>
                    )}
                  </div>

                  {/* 4-Stage Stepper Rail */}
                  <div className="pt-2.5 border-t border-casa-border/50">
                    <div className="grid grid-cols-4 gap-1 text-center items-center">
                      {[
                        { label: 'Confirmed', index: 0 },
                        { label: 'Shipped', index: 1 },
                        { label: 'En Route', index: 2 },
                        { label: 'Arrived', index: 3 },
                      ].map((st, idx) => {
                        const isPast = step >= st.index
                        const isCurrent = step === st.index
                        return (
                          <div key={st.label} className="flex flex-col items-center gap-1.5 relative">
                            {idx > 0 && (
                              <div
                                className={cn(
                                  'absolute -left-1/2 top-2 w-full h-[2px] -translate-y-1/2 -z-0 transition-colors',
                                  step >= st.index ? 'bg-casa-gold' : 'bg-casa-border/80'
                                )}
                              />
                            )}

                            <div
                              className={cn(
                                'w-4 h-4 rounded-full flex items-center justify-center transition-all z-10',
                                isCurrent
                                  ? 'bg-casa-gold text-white ring-4 ring-casa-gold/20 scale-110 shadow-xs'
                                  : isPast
                                  ? 'bg-casa-navy text-white'
                                  : 'bg-casa-surface border-2 border-casa-border text-transparent'
                              )}
                            >
                              {isPast && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>

                            <span
                              className={cn(
                                'text-3xs font-bold uppercase tracking-wider',
                                isCurrent
                                  ? 'text-casa-gold'
                                  : isPast
                                  ? 'text-casa-navy'
                                  : 'text-casa-muted/70'
                              )}
                            >
                              {st.label}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                </div>
              )
            })()}

            {/* ── 2. EDITORIAL INBOUND MANIFEST LEDGER PLINTH ── */}
            {ledgerItems.length > 0 && (
              <div className="p-4 sm:p-5 rounded-3xl bg-casa-surface border border-casa-border/80 shadow-card space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-casa-border/60">
                  <div className="flex items-center gap-2">
                    <Package size={15} className="text-casa-gold" />
                    <span className="text-caption font-bold uppercase tracking-wider text-casa-navy">
                      Inbound Package Ledger ({ledgerItems.length})
                    </span>
                  </div>
                  <span className="text-2xs font-mono font-medium text-casa-muted">
                    Tap row to inspect
                  </span>
                </div>

                {/* Ledger Streams */}
                <div className="divide-y divide-casa-border/40">
                  {/* Today's Inbound Section */}
                  {todayLedger.length > 0 && (
                    <div className="py-2 space-y-1.5">
                      <span className="text-3xs font-bold uppercase tracking-widest text-amber-800 block px-2 pt-1">
                        Expected Today ({todayLedger.length})
                      </span>
                      {todayLedger.map((item) => (
                        <LedgerRow
                          key={item.threadKey}
                          item={item}
                          familyMembers={familyMembers}
                          isSelected={selectedSidecarActionId === item.id && sidecarTab === 'action'}
                          onOpenSidecar={() => openActionInSidecar(item.id)}
                          onDismiss={(e) => handleDismissItem(e, item)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Scheduled Later This Week */}
                  {upcomingLedger.length > 0 && (
                    <div className="py-2 space-y-1.5">
                      <span className="text-3xs font-bold uppercase tracking-widest text-casa-muted block px-2 pt-1">
                        Scheduled Later ({upcomingLedger.length})
                      </span>
                      {upcomingLedger.map((item) => (
                        <LedgerRow
                          key={item.threadKey}
                          item={item}
                          familyMembers={familyMembers}
                          isSelected={selectedSidecarActionId === item.id && sidecarTab === 'action'}
                          onOpenSidecar={() => openActionInSidecar(item.id)}
                          onDismiss={(e) => handleDismissItem(e, item)}
                        />
                      ))}
                    </div>
                  )}

                  {/* Recently Delivered Section */}
                  {deliveredLedger.length > 0 && (
                    <div className="py-2 space-y-1.5">
                      <span className="text-3xs font-bold uppercase tracking-widest text-emerald-800 block px-2 pt-1">
                        Recently Delivered ({deliveredLedger.length})
                      </span>
                      {deliveredLedger.map((item) => (
                        <LedgerRow
                          key={item.threadKey}
                          item={item}
                          familyMembers={familyMembers}
                          isSelected={selectedSidecarActionId === item.id && sidecarTab === 'action'}
                          onOpenSidecar={() => openActionInSidecar(item.id)}
                          onDismiss={(e) => handleDismissItem(e, item)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center bg-casa-surface/40 rounded-3xl border border-dashed border-casa-border/70 space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-casa-gold/15 text-casa-gold flex items-center justify-center mb-1">
              <Truck size={24} />
            </div>
            <p className="font-display text-body-lg font-bold text-casa-navy">
              All Shipments Clear
            </p>
            <p className="text-caption text-casa-muted max-w-xs">
              {activeTab === 'today'
                ? 'No packages scheduled to arrive today.'
                : activeTab === 'in_transit'
                ? 'No packages currently in transit.'
                : activeTab === 'delivered'
                ? 'No parcels recently marked delivered.'
                : 'No active delivery records found.'}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

function LedgerRow({
  item,
  familyMembers,
  isSelected,
  onOpenSidecar,
  onDismiss,
}: {
  item: DeliveryTransitItem
  familyMembers: FamilyMember[]
  isSelected: boolean
  onOpenSidecar: () => void
  onDismiss: (e: React.MouseEvent) => void
}) {
  const Icon = resolveVendorIcon(item.vendor)
  const isOutForDelivery = item.stage === 'out_for_delivery'
  const isDelivered = item.stage === 'delivered'

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpenSidecar}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpenSidecar()
        }
      }}
      className={cn(
        'px-3 py-2.5 rounded-2xl transition-all flex items-center justify-between gap-3 cursor-pointer group min-h-[48px]',
        isSelected
          ? 'bg-casa-gold/15 border border-casa-gold/40 shadow-2xs'
          : 'hover:bg-casa-surface-subtle/80 hover:shadow-2xs'
      )}
    >
      {/* Left: Icon, Vendor, and Summary */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className="w-7 h-7 rounded-lg bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <Icon size={14} className="text-casa-gold" />
        </div>

        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover transition-colors truncate shrink-0">
            {item.vendor}
          </span>

          <span className="text-caption text-casa-muted truncate font-medium">
            {item.itemSummary}
          </span>

          {item.isPerishable && (
            <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-2 py-0.2 rounded-full w-fit">
              <ShoppingCart size={9} className="text-emerald-700" />
              <span>Perishable</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Stage/ETA Pill, Gmail link, Inspect arrow, and Dismiss X */}
      <div className="flex items-center gap-2 shrink-0">
        {item.etaDisplay ? (
          <span
            className={cn(
              'text-2xs font-semibold px-2.5 py-1 rounded-full border shadow-2xs',
              isDelivered
                ? 'bg-emerald-50 text-emerald-950 border-emerald-200'
                : isOutForDelivery
                ? 'bg-amber-50 text-amber-950 border-amber-200 font-bold'
                : 'bg-casa-bg text-casa-muted border-casa-border'
            )}
          >
            {isDelivered ? `Delivered` : item.etaDisplay}
          </span>
        ) : (
          <span className="text-2xs font-semibold px-2.5 py-1 rounded-full bg-casa-bg text-casa-muted border border-casa-border">
            {item.stage === 'shipped' ? 'In Transit' : item.stage === 'delivered' ? 'Delivered' : 'Confirmed'}
          </span>
        )}

        {item.rawItem && (item.rawItem.source_type === 'gmail' || item.rawItem.source_ref?.startsWith('gmail:')) && (
          <a
            href={buildGmailWebUrl(item.rawItem, null, familyMembers)}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 shadow-2xs transition-colors no-underline min-h-[28px]"
            title="Open email in Gmail"
            onClick={(e) => e.stopPropagation()}
          >
            <Mail size={10} className="text-red-600 shrink-0" />
            <span>Gmail</span>
          </a>
        )}

        <IconButton
          size="sm"
          variant="ghost"
          aria-label="Dismiss this delivery instance"
          title="Dismiss this delivery (future orders will still appear)"
          onClick={onDismiss}
          className="text-casa-muted hover:text-rose-600 hover:bg-rose-50 min-h-[36px] min-w-[36px] transition-colors rounded-xl"
          icon={<X size={14} />}
        />

        <ChevronRight size={15} className="text-casa-gold opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )
}
