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
  ShieldAlert,
  GraduationCap,
  Laptop,
  MapPin,
} from 'lucide-react'
import { Button, IconButton } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, DeliveryTransitItem, DeliveryTransitStage, FamilyMember, InboundCategory } from '../../../types'
import {
  isDeliveryTransitItem,
  buildDeliveryTransitItem,
  consolidateTransitItems,
  stageStepIndex,
  isItemArrivingToday,
  isItemInTransit,
  isItemDelivered,
  cleanInboundTitle,
} from '../../../utils/vendorTransactions.ts'
import { buildGmailWebUrl } from '../../../utils/prepItemClusters'
import { useAppStore } from '../../../stores/appStore'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { format } from 'date-fns'

export type LogisticsFilterTab = 'all' | 'physical' | 'preorder' | 'digital' | 'delivered'

interface EstateLogisticsWidgetProps {
  activePrep?: PrepItem[]
  familyMembers?: FamilyMember[]
  onDismissDelivery?: (item: PrepItem) => void
}

function resolveVendorIcon(vendor: string, category?: InboundCategory) {
  if (category === 'preorder') return GraduationCap
  if (category === 'digital') return Laptop
  if (category === 'pickup') return MapPin

  const v = vendor.toLowerCase()
  if (v.includes('walsworth') || v.includes('jostens') || v.includes('strawbridge') || v.includes('yearbook')) {
    return GraduationCap
  }
  if (v.includes('arlo') || v.includes('apple') || v.includes('subscription') || v.includes('ticket')) {
    return Laptop
  }
  if (v.includes('whole foods') || v.includes('instacart') || v.includes('hellofresh') || v.includes('grocery')) {
    return ShoppingCart
  }
  if (v.includes('fedex') || v.includes('ups') || v.includes('usps') || v.includes('courier')) {
    return Truck
  }
  return Package
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
    const rawTransit: DeliveryTransitItem[] = []

    for (const item of activePrep) {
      if (isDeliveryTransitItem(item)) {
        const transit = buildDeliveryTransitItem(item, now)
        if (optimisticallyDismissedKeys.has(transit.threadKey) || optimisticallyDismissedKeys.has(item.id)) {
          continue
        }
        rawTransit.push(transit)
      }
    }

    return consolidateTransitItems(rawTransit)
  }, [activePrep, optimisticallyDismissedKeys, now])

  // Sub-counts for category & delivery status filter capsules
  const physicalItems = useMemo(
    () => allTransitItems.filter((i) => (i.inboundCategory === 'physical' || !i.inboundCategory) && !isItemDelivered(i, now)),
    [allTransitItems, now]
  )
  const preorderItems = useMemo(
    () => allTransitItems.filter((i) => i.inboundCategory === 'preorder'),
    [allTransitItems]
  )
  const digitalItems = useMemo(
    () => allTransitItems.filter((i) => i.inboundCategory === 'digital'),
    [allTransitItems]
  )
  const deliveredItems = useMemo(
    () => allTransitItems.filter((i) => isItemDelivered(i, now)),
    [allTransitItems, now]
  )

  // Filtered view based on selected tab
  const filteredItems = useMemo(() => {
    switch (activeTab) {
      case 'physical':
        return physicalItems
      case 'preorder':
        return preorderItems
      case 'digital':
        return digitalItems
      case 'delivered':
        return deliveredItems
      case 'all':
      default:
        return allTransitItems
    }
  }, [activeTab, physicalItems, preorderItems, digitalItems, deliveredItems, allTransitItems])

  // Pick the top priority delivery for the Hero Spotlight slot
  const { heroItem, ledgerItems } = useMemo(() => {
    if (filteredItems.length === 0) return { heroItem: null, ledgerItems: [] }

    let heroIdx = -1

    if (activeTab === 'delivered') {
      heroIdx = 0
    } else if (activeTab === 'preorder') {
      heroIdx = 0
    } else if (activeTab === 'digital') {
      heroIdx = 0
    } else {
      // Prioritize urgent/imminent deliveries ARRIVING TODAY:
      // 1. Perishable arriving today
      // 2. Out for delivery arriving today
      // 3. Any active in-transit arriving today
      heroIdx = filteredItems.findIndex((i) => isItemArrivingToday(i, now) && i.isPerishable)
      if (heroIdx === -1) {
        heroIdx = filteredItems.findIndex((i) => isItemArrivingToday(i, now) && i.stage === 'out_for_delivery')
      }
      if (heroIdx === -1) {
        heroIdx = filteredItems.findIndex((i) => isItemArrivingToday(i, now) && isItemInTransit(i, now))
      }
      // If nothing arriving today, and in 'all' view, pick the next active in-transit item
      if (heroIdx === -1 && activeTab === 'all') {
        heroIdx = filteredItems.findIndex((i) => isItemInTransit(i, now))
      }
      if (heroIdx === -1) {
        heroIdx = 0
      }
    }

    const hero = filteredItems[heroIdx]
    const remaining = filteredItems.filter((_, idx) => idx !== heroIdx)
    return { heroItem: hero, ledgerItems: remaining }
  }, [filteredItems, activeTab, now])

  // Partition ledger items by temporal bucket
  const { todayLedger, upcomingLedger, deliveredLedger } = useMemo(() => {
    const today: DeliveryTransitItem[] = []
    const upcoming: DeliveryTransitItem[] = []
    const delivered: DeliveryTransitItem[] = []

    for (const item of ledgerItems) {
      if (isItemDelivered(item, now)) {
        delivered.push(item)
      } else if (isItemArrivingToday(item, now) && (item.inboundCategory === 'physical' || !item.inboundCategory)) {
        today.push(item)
      } else {
        upcoming.push(item)
      }
    }

    return { todayLedger: today, upcomingLedger: upcoming, deliveredLedger: delivered }
  }, [ledgerItems, now])

  const handleSweepDelivered = (e: React.MouseEvent) => {
    e.stopPropagation()
    setOptimisticallyDismissedKeys((prev) => {
      const next = new Set(prev)
      for (const item of deliveredItems) {
        next.add(item.threadKey)
        next.add(item.id)
        if (onDismissDelivery && item.rawItem) {
          onDismissDelivery(item.rawItem)
        }
      }
      return next
    })
  }

  return (
    <div className="w-full h-full flex flex-col bg-casa-surface border border-casa-border/80 shadow-card rounded-3xl p-5 sm:p-6 overflow-hidden min-h-0 relative">
      {/* ── BroadSheet Header ── */}
      <div className="flex items-start justify-between pb-3.5 border-b border-casa-border/60 shrink-0">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-display text-display-sm font-bold text-casa-navy leading-none tracking-tight">
              Estate Inbound Manifest
            </h2>
          </div>
          <p className="text-caption text-casa-muted mt-1 font-medium">
            Inbound Deliveries, Pre-Orders &amp; Courier Ledger
          </p>
        </div>

        <div className="flex items-center gap-2">
          {deliveredItems.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              onClick={handleSweepDelivered}
              className="text-3xs font-bold text-emerald-950 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-200 rounded-full px-2.5 py-1 min-h-[36px] flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Clean up all delivered parcels from the manifest"
            >
              <CheckCircle2 size={12} className="text-emerald-700" />
              <span>Clean Up Delivered ({deliveredItems.length})</span>
            </Button>
          )}

          {physicalItems.length > 0 && (
            <span className="inline-flex items-center gap-1.5 text-caption font-mono font-bold px-3 py-1 rounded-full bg-sky-50 text-sky-900 border border-sky-200">
              <Truck size={13} className="text-sky-700" />
              <span>{physicalItems.length} In Transit</span>
            </span>
          )}
        </div>
      </div>

      {/* ── Filter Capsules Strip (Touch-Optimized >= 44px) ── */}
      <div className="flex items-center gap-2 py-3 border-b border-casa-border/40 overflow-x-auto no-scrollbar shrink-0">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('all')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5 shrink-0',
            activeTab === 'all'
              ? 'bg-casa-navy text-white shadow-xs'
              : 'bg-casa-bg border border-casa-border/60 text-casa-muted hover:text-casa-navy'
          )}
        >
          <Layers size={13} className={activeTab === 'all' ? 'text-casa-gold' : 'text-casa-muted'} />
          <span>All ({allTransitItems.length})</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('physical')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5 shrink-0',
            activeTab === 'physical'
              ? 'bg-sky-700 text-white shadow-xs'
              : 'bg-casa-bg border border-casa-border/60 text-casa-muted hover:text-casa-navy'
          )}
        >
          <Package size={13} className={activeTab === 'physical' ? 'text-sky-200' : 'text-sky-600'} />
          <span>Parcels ({physicalItems.length})</span>
        </Button>

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('preorder')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5 shrink-0',
            activeTab === 'preorder'
              ? 'bg-amber-700 text-white shadow-xs'
              : 'bg-casa-bg border border-casa-border/60 text-casa-muted hover:text-casa-navy'
          )}
        >
          <GraduationCap size={13} className={activeTab === 'preorder' ? 'text-amber-200' : 'text-amber-600'} />
          <span>Pre-Orders ({preorderItems.length})</span>
        </Button>

        {digitalItems.length > 0 && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setActiveTab('digital')}
            className={cn(
              'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5 shrink-0',
              activeTab === 'digital'
                ? 'bg-indigo-700 text-white shadow-xs'
                : 'bg-casa-bg border border-casa-border/60 text-casa-muted hover:text-casa-navy'
            )}
          >
            <Laptop size={13} className={activeTab === 'digital' ? 'text-indigo-200' : 'text-indigo-600'} />
            <span>Digital ({digitalItems.length})</span>
          </Button>
        )}

        <Button
          size="sm"
          variant="ghost"
          onClick={() => setActiveTab('delivered')}
          className={cn(
            'px-3.5 py-1.5 rounded-full text-caption font-bold transition-all min-h-[44px] flex items-center gap-1.5 shrink-0',
            activeTab === 'delivered'
              ? 'bg-emerald-700 text-white shadow-xs'
              : 'bg-casa-bg border border-casa-border/60 text-casa-muted hover:text-casa-navy'
          )}
        >
          <CheckCircle2 size={13} className={activeTab === 'delivered' ? 'text-emerald-200' : 'text-emerald-600'} />
          <span>Delivered ({deliveredItems.length})</span>
        </Button>
      </div>

      {/* ── Scrollable Broadsheet Flow ── */}
      <div className="flex-1 overflow-y-auto pr-0.5 space-y-5 min-h-0 touch-pan-y overscroll-contain pt-3 pb-4">
        {filteredItems.length > 0 ? (
          <>
            {/* ── HERO SPOTLIGHT (Category-Adaptive Presentation) ── */}
            {heroItem && (() => {
              const HeroIcon = resolveVendorIcon(heroItem.vendor, heroItem.inboundCategory)
              const step = stageStepIndex(heroItem.stage as DeliveryTransitStage)
              const isSelected = selectedSidecarActionId === heroItem.id && sidecarTab === 'action'
              const isDelivered = heroItem.stage === 'delivered'
              const isOutForDelivery = heroItem.stage === 'out_for_delivery'
              const isArrivingToday = isItemArrivingToday(heroItem, now)
              const isImminent = isArrivingToday && (isOutForDelivery || heroItem.isPerishable)
              const isPreorder = heroItem.inboundCategory === 'preorder'
              const isDigital = heroItem.inboundCategory === 'digital'
              const isPickup = heroItem.inboundCategory === 'pickup'

              return (
                <div
                  key={heroItem.threadKey}
                  onClick={() => openActionInSidecar(heroItem.id)}
                  className={cn(
                    'p-4.5 sm:p-5 rounded-2xl transition-all flex flex-col gap-3 relative cursor-pointer group',
                    isSelected
                      ? 'bg-casa-gold/15 border-2 border-casa-gold ring-2 ring-casa-gold/30'
                      : isDelivered
                      ? 'bg-emerald-50/40 border border-emerald-300/60 hover:border-emerald-400'
                      : isPreorder
                      ? 'bg-amber-50/50 border border-amber-300/70 hover:border-amber-400'
                      : isDigital
                      ? 'bg-indigo-50/40 border border-indigo-200/70 hover:border-indigo-300'
                      : isOutForDelivery && isArrivingToday
                      ? 'bg-amber-50/60 border border-amber-300/80 hover:border-amber-400'
                      : 'bg-casa-surface-subtle/70 border border-casa-border/80 hover:border-casa-gold/60'
                  )}
                >
                  {/* Top line: Vendor, Badges & Dismiss */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <div className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center shrink-0',
                        isPreorder ? 'bg-amber-100 text-amber-900' : isDigital ? 'bg-indigo-100 text-indigo-900' : 'bg-casa-gold/15 text-casa-navy'
                      )}>
                        <HeroIcon size={15} className={isPreorder ? 'text-amber-800' : isDigital ? 'text-indigo-800' : 'text-casa-gold'} />
                      </div>

                      <span className="text-body-sm font-bold text-casa-navy truncate">
                        {heroItem.vendor}
                      </span>

                      {/* Category Tag */}
                      {isPreorder ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                          <GraduationCap size={10} className="text-amber-700" />
                          <span>School Pre-Order</span>
                        </span>
                      ) : isDigital ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-indigo-100 text-indigo-950 border border-indigo-300">
                          <Laptop size={10} className="text-indigo-700" />
                          <span>Digital Service</span>
                        </span>
                      ) : isPickup ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-sky-100 text-sky-950 border border-sky-300">
                          <MapPin size={10} className="text-sky-700" />
                          <span>Local Pickup</span>
                        </span>
                      ) : heroItem.isPerishable ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                          <ShoppingCart size={10} className="text-emerald-700" />
                          <span>Perishable Grocery</span>
                        </span>
                      ) : isDelivered ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                          <CheckCircle2 size={10} className="text-emerald-700" />
                          <span>Delivered</span>
                        </span>
                      ) : isOutForDelivery && isArrivingToday ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-amber-100 text-amber-950 border border-amber-300">
                          <Clock size={10} className="text-amber-700 animate-pulse" />
                          <span>Out for Delivery</span>
                        </span>
                      ) : heroItem.stage === 'confirmed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-3xs font-bold bg-sky-100 text-sky-950 border border-sky-300">
                          <Package size={10} className="text-sky-700" />
                          <span>{/\b(?:being prepared|preparing|add more|last minute|edit your order)\b/i.test(`${heroItem.title} ${heroItem.rawItem?.description ?? ''}`) ? 'Being Prepared' : 'Confirmed'}</span>
                        </span>
                      ) : null}

                      {isImminent && (
                        <span className="inline-flex items-center gap-1 text-3xs font-semibold px-2 py-0.5 rounded-full bg-casa-gold/15 text-casa-top-pick-band border border-casa-gold/30">
                          <Sparkles size={9} className="text-casa-gold" />
                          <span>Imminent Arrival</span>
                        </span>
                      )}

                      {heroItem.cost && (
                        <span className="inline-flex items-center gap-1 text-3xs font-mono font-bold px-2 py-0.5 rounded-full bg-casa-surface border border-casa-border/90 text-casa-navy shadow-2xs">
                          {heroItem.cost}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {heroItem.rawItem && (heroItem.rawItem.source_type === 'gmail' || heroItem.rawItem.source_ref?.startsWith('gmail:')) && (
                        <a
                          href={buildGmailWebUrl(heroItem.rawItem, null, familyMembers)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors no-underline min-h-[32px]"
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
                        aria-label="Dismiss this delivery instance"
                        title="Dismiss this delivery"
                        onClick={(e) => handleDismissItem(e, heroItem)}
                        className="text-casa-muted hover:text-rose-600 hover:bg-rose-50 min-h-[36px] min-w-[36px] transition-colors rounded-xl"
                        icon={<X size={14} />}
                      />
                    </div>
                  </div>

                  {/* Summary & Fulfillment / ETA Metadata */}
                  <div className="space-y-0.5">
                    <p className="text-body sm:text-body-lg font-bold text-casa-navy group-hover:text-casa-gold-hover transition-colors leading-snug">
                      {cleanInboundTitle(heroItem.title || heroItem.itemSummary, heroItem.vendor)}
                    </p>

                    <div className="flex items-center gap-3 text-caption font-medium text-casa-muted flex-wrap">
                      {isPreorder ? (
                        <div className="flex items-center gap-1.5 text-amber-900 font-semibold">
                          <GraduationCap size={13} className="text-amber-700 shrink-0" />
                          <span>Fulfillment: {heroItem.rawItem?.due_by ? `Order Due ${format(new Date(heroItem.rawItem.due_by), 'MMM d, yyyy')}` : 'School Distribution in Spring'}</span>
                        </div>
                      ) : isDigital ? (
                        <div className="flex items-center gap-1.5 text-indigo-900 font-semibold">
                          <Laptop size={13} className="text-indigo-700 shrink-0" />
                          <span>Active Digital License / Subscription</span>
                        </div>
                      ) : (
                        heroItem.etaDisplay && (
                          <div className="flex items-center gap-1.5">
                            <Clock size={12} className="text-casa-gold shrink-0" />
                            <span>ETA: <strong className="text-casa-navy font-semibold">{heroItem.etaDisplay}</strong></span>
                          </div>
                        )
                      )}

                      {heroItem.cost && (
                        <div className="flex items-center gap-1 font-mono font-bold text-casa-navy">
                          <span>·</span>
                          <span>{heroItem.cost}</span>
                          <span className="text-3xs font-sans font-medium text-casa-muted">
                            {isPreorder ? '(Pre-Order Total)' : /hold/i.test(heroItem.rawItem.description || '') ? '(Hold)' : '(Total)'}
                          </span>
                        </div>
                      )}
                    </div>

                    {heroItem.policyDisclaimer && (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-casa-surface border border-casa-border/80 text-3xs font-medium text-casa-muted max-w-full">
                        <ShieldAlert size={11} className="text-casa-gold shrink-0" />
                        <span className="truncate">{heroItem.policyDisclaimer}</span>
                      </div>
                    )}
                  </div>

                  {/* ── Category-Adaptive Footer: Stepper for Physical, Milestone for Pre-Order ── */}
                  <div className="pt-2 border-t border-casa-border/40">
                    {isPreorder ? (
                      <div className="flex items-center justify-between gap-2 text-3xs bg-amber-100/60 border border-amber-200/80 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1.5 text-amber-950 font-medium">
                          <GraduationCap size={13} className="text-amber-800 shrink-0" />
                          <span>School Fulfillment: Distributed to student in classroom</span>
                        </div>
                        <span className="font-bold text-amber-900 font-mono">{heroItem.cost || '$75.00'}</span>
                      </div>
                    ) : isDigital ? (
                      <div className="flex items-center justify-between gap-2 text-3xs bg-indigo-100/60 border border-indigo-200/80 rounded-xl px-3 py-2">
                        <div className="flex items-center gap-1.5 text-indigo-950 font-medium">
                          <Laptop size={13} className="text-indigo-800 shrink-0" />
                          <span>Digital Delivery: Access available in online account</span>
                        </div>
                        <span className="font-bold text-indigo-900 font-mono">{heroItem.cost}</span>
                      </div>
                    ) : (
                      /* 4-Stage Courier Stepper Rail for Physical Packages */
                      <div className="grid grid-cols-4 gap-1 text-center items-center">
                        {[
                          { label: 'Confirmed', index: 0 },
                          { label: 'Shipped', index: 1 },
                          { label: 'En Route', index: 2 },
                          { label: 'Arrived', index: 3 },
                        ].map((st, idx) => {
                          const isPast = step >= st.index || (isDelivered && st.index <= 3)
                          const isCurrent = (step === st.index && !isDelivered) || (isDelivered && st.index === 3)
                          return (
                            <div key={st.label} className="flex flex-col items-center gap-1 relative">
                              {idx > 0 && (
                                <div
                                  className={cn(
                                    'absolute -left-1/2 top-1.5 w-full h-[2px] -translate-y-1/2 -z-0 transition-colors',
                                    (step >= st.index || isDelivered) ? (isDelivered ? 'bg-emerald-600' : 'bg-casa-gold') : 'bg-casa-border/70'
                                  )}
                                />
                              )}

                              <div
                                className={cn(
                                  'w-3.5 h-3.5 rounded-full flex items-center justify-center transition-all z-10',
                                  isCurrent
                                    ? (isDelivered ? 'bg-emerald-700 text-white ring-4 ring-emerald-700/20 scale-110 shadow-xs' : 'bg-casa-gold text-white ring-4 ring-casa-gold/20 scale-110 shadow-xs')
                                    : isPast
                                    ? (isDelivered ? 'bg-emerald-700 text-white' : 'bg-casa-navy text-white')
                                    : 'bg-casa-surface border-2 border-casa-border text-transparent'
                                )}
                              >
                                {isPast && <div className="w-1 h-1 rounded-full bg-white" />}
                              </div>

                              <span
                                className={cn(
                                  'text-3xs font-bold uppercase tracking-wider',
                                  isCurrent
                                    ? (isDelivered ? 'text-emerald-700' : 'text-casa-gold')
                                    : isPast
                                    ? (isDelivered ? 'text-emerald-900' : 'text-casa-navy')
                                    : 'text-casa-muted/70'
                                )}
                              >
                                {st.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* ── EDITORIAL INBOUND LEDGER STREAMS ── */}
            {ledgerItems.length > 0 && (
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between pb-1 border-b border-casa-border/50">
                  <span className="text-caption font-bold uppercase tracking-wider text-casa-navy">
                    Inbound Ledger ({ledgerItems.length})
                  </span>
                  <span className="text-3xs text-casa-muted font-medium">
                    Tap row to inspect
                  </span>
                </div>

                {/* Expected Today */}
                {todayLedger.length > 0 && (
                  <div className="space-y-1">
                    <span className="text-3xs font-bold uppercase tracking-widest text-amber-800 block px-1">
                      Expected Today ({todayLedger.length})
                    </span>
                    <div className="divide-y divide-casa-border/30">
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
                  </div>
                )}

                {/* Scheduled Later / Pre-Orders */}
                {upcomingLedger.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <span className="text-3xs font-bold uppercase tracking-widest text-casa-muted block px-1">
                      Scheduled Later &amp; Pre-Orders ({upcomingLedger.length})
                    </span>
                    <div className="divide-y divide-casa-border/30">
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
                  </div>
                )}

                {/* Recently Delivered */}
                {deliveredLedger.length > 0 && (
                  <div className="space-y-1 pt-2">
                    <span className="text-3xs font-bold uppercase tracking-widest text-emerald-800 block px-1">
                      Recently Delivered ({deliveredLedger.length})
                    </span>
                    <div className="divide-y divide-casa-border/30">
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
                  </div>
                )}
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center space-y-2">
            <div className="w-12 h-12 rounded-2xl bg-casa-gold/15 text-casa-gold flex items-center justify-center mb-1">
              {activeTab === 'preorder' ? <GraduationCap size={24} /> : activeTab === 'digital' ? <Laptop size={24} /> : <Truck size={24} />}
            </div>
            <p className="font-display text-body-lg font-bold text-casa-navy">
              {activeTab === 'preorder' ? 'No Active Pre-Orders' : activeTab === 'digital' ? 'No Digital Orders' : 'All Shipments Clear'}
            </p>
            <p className="text-caption text-casa-muted max-w-xs">
              {activeTab === 'physical'
                ? 'No parcel shipments currently in transit.'
                : activeTab === 'preorder'
                ? 'No school pre-orders or yearbooks currently pending.'
                : activeTab === 'digital'
                ? 'No digital subscriptions or licenses found.'
                : activeTab === 'delivered'
                ? 'No parcels recently marked delivered.'
                : 'No active inbound records found.'}
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
  const Icon = resolveVendorIcon(item.vendor, item.inboundCategory)
  const isOutForDelivery = item.stage === 'out_for_delivery'
  const isDelivered = item.stage === 'delivered'
  const isPreorder = item.inboundCategory === 'preorder'
  const isDigital = item.inboundCategory === 'digital'

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
        'px-2.5 py-2.5 rounded-xl transition-all flex items-center justify-between gap-3 cursor-pointer group min-h-[48px]',
        isSelected
          ? 'bg-casa-gold/15 shadow-2xs'
          : 'hover:bg-casa-surface-subtle/80'
      )}
    >
      {/* Left: Icon, Vendor, Summary */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1">
        <div className={cn(
          'w-6 h-6 rounded-md flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform',
          isPreorder ? 'bg-amber-100 text-amber-800' : isDigital ? 'bg-indigo-100 text-indigo-800' : 'bg-casa-gold/15 text-casa-gold'
        )}>
          <Icon size={13} />
        </div>

        <div className="min-w-0 flex-1 flex flex-col sm:flex-row sm:items-center sm:gap-2">
          <span className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover transition-colors truncate shrink-0">
            {item.vendor}
          </span>

          <span className="text-caption text-casa-muted truncate font-medium">
            {cleanInboundTitle(item.itemSummary || item.title, item.vendor)}
          </span>

          {isPreorder && (
            <span className="inline-flex items-center gap-1 text-3xs font-bold text-amber-900 bg-amber-100 border border-amber-300 px-1.5 py-0.2 rounded-full w-fit">
              <GraduationCap size={8} className="text-amber-700" />
              <span>Pre-Order</span>
            </span>
          )}

          {isDigital && (
            <span className="inline-flex items-center gap-1 text-3xs font-bold text-indigo-900 bg-indigo-100 border border-indigo-300 px-1.5 py-0.2 rounded-full w-fit">
              <Laptop size={8} className="text-indigo-700" />
              <span>Digital</span>
            </span>
          )}

          {item.isPerishable && (
            <span className="inline-flex items-center gap-1 text-3xs font-bold text-emerald-800 bg-emerald-100/90 border border-emerald-300/80 px-1.5 py-0.2 rounded-full w-fit">
              <ShoppingCart size={8} className="text-emerald-700" />
              <span>Perishable</span>
            </span>
          )}
        </div>
      </div>

      {/* Right: Cost, Stage/ETA Pill, Gmail, Dismiss X, and Chevron */}
      <div className="flex items-center gap-2 shrink-0">
        {item.cost && (
          <span className="font-mono text-2xs font-bold text-casa-navy px-2 py-0.5 rounded bg-casa-surface border border-casa-border/80 shadow-2xs">
            {item.cost}
          </span>
        )}

        {isPreorder ? (
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-amber-50 text-amber-900 border border-amber-200">
            {item.rawItem?.due_by ? `Due ${format(new Date(item.rawItem.due_by), 'MMM d')}` : 'Pre-Order'}
          </span>
        ) : item.etaDisplay ? (
          <span
            className={cn(
              'text-2xs font-semibold px-2 py-0.5 rounded-full border',
              isDelivered
                ? 'bg-emerald-50 text-emerald-950 border-emerald-200 font-medium'
                : isOutForDelivery
                ? 'bg-amber-50 text-amber-950 border-amber-200 font-bold'
                : 'bg-casa-bg text-casa-muted border-casa-border'
            )}
          >
            {isDelivered
              ? (item.etaDisplay.includes('Delivered') || item.etaDisplay.includes('Yesterday') ? item.etaDisplay : 'Delivered')
              : item.etaDisplay}
          </span>
        ) : (
          <span className="text-2xs font-semibold px-2 py-0.5 rounded-full bg-casa-bg text-casa-muted border border-casa-border">
            {item.stage === 'shipped' ? 'In Transit' : item.stage === 'delivered' ? 'Delivered' : 'Confirmed'}
          </span>
        )}

        {item.rawItem && (item.rawItem.source_type === 'gmail' || item.rawItem.source_ref?.startsWith('gmail:')) && (
          <a
            href={buildGmailWebUrl(item.rawItem, null, familyMembers)}
            target="_blank"
            rel="noopener noreferrer"
            className="hidden md:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-3xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors no-underline min-h-[30px]"
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
          title="Dismiss this delivery"
          onClick={onDismiss}
          className="text-casa-muted hover:text-rose-600 hover:bg-rose-50 min-h-[36px] min-w-[36px] transition-colors rounded-lg"
          icon={<X size={14} />}
        />

        <ChevronRight size={14} className="text-casa-gold opacity-60 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
      </div>
    </div>
  )
}
