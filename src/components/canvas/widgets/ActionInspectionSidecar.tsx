import { useState, useMemo } from 'react'
import {
  X,
  Rotate3d,
  Sparkles,
  Check,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  FileText,
  CreditCard,
  ShoppingCart,
  Mail,
  ChevronDown,
  Moon,
  Sun,
  PenTool,
  CalendarPlus,
  CalendarCheck,
  Calendar,
  MapPin,
  Loader2,
  Tag,
  BookmarkPlus,
  CheckCheck,
  ThumbsDown,
  Undo2,
} from 'lucide-react'
import { Button, IconButton } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, Conflict } from '../../../types'
import { sourceBadge } from '../../../utils/prepSourceBadge'
import { type SnoozeDuration } from '../../../utils/snoozeDuration'
import { usePrepItems, usePrepItemDetails, useDownvotePrepItem } from '../../../hooks/usePrepItems'
import { useHouseholdCaptureRules } from '../../../hooks/useHouseholdCaptureRules'
import {
  synthesizeActionAnalysis,
  extractAmount,
  type ExtractedActionDocument,
  type SuggestedEventPlan,
} from '../../../utils/actionInspectionSynthesis'
import { buildGmailWebUrl } from '../../../utils/prepItemClusters'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../../hooks/useFamilyMembers'
import { useAppStore } from '../../../stores/appStore'
import { useRollingEvents } from '../../../hooks/useCalendarEvents'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { supabase } from '../../../lib/supabase'

import type { ActionAiContext } from '../../../hooks/useAIAssistant'

interface ActionInspectionSidecarProps {
  actionId?: string | null
  actionItem?: PrepItem | null
  conflictItem?: Conflict | null
  queueItems?: PrepItem[]
  onClose: () => void
  onSwitchToAi: (actionContext?: ActionAiContext) => void
  onCompleteAction?: (item: PrepItem) => void
  onSnoozeAction?: (item: PrepItem, period: SnoozeDuration) => void
  onSelectAction?: (itemId: string) => void
  embedded?: boolean
}

export default function ActionInspectionSidecar({
  actionId,
  actionItem: propActionItem,
  conflictItem: _conflictItem,
  queueItems = [],
  onClose,
  onSwitchToAi,
  onCompleteAction,
  onSnoozeAction,
  onSelectAction,
  embedded = false,
}: ActionInspectionSidecarProps) {
  const qc = useQueryClient()
  const { data: allPrep = [] } = usePrepItems()
  const { data: familyMembers = [] } = useFamilyMembers()
  const { setSelectedSidecarEventId, setSidecarTab } = useAppStore()
  const now = useLiveClock(60_000)
  const { data: rollingEvents = [] } = useRollingEvents(now)

  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [showRawSource, setShowRawSource] = useState(false)
  const [signingModalOpen, setSigningModalOpen] = useState(false)
  const [signedSuccess, setSignedSuccess] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [trainedSuccess, setTrainedSuccess] = useState<string | null>(null)

  const { rules: captureRules = [], saveRule: saveCaptureRule, removeRule: removeCaptureRule, isSaving: isSavingRule } = useHouseholdCaptureRules()
  const downvote = useDownvotePrepItem()

  // Find target prep item
  const currentItem = useMemo(() => {
    if (propActionItem) return propActionItem
    if (actionId) {
      const found = allPrep.find((p) => p.id === actionId || `prep-${p.id}` === actionId)
      if (found) return found
    }
    return queueItems[0] || allPrep[0] || null
  }, [propActionItem, actionId, allPrep, queueItems])

  const { data: detailedItem } = usePrepItemDetails(currentItem)
  const activeItem = detailedItem || currentItem

  // Sibling items extracted from the same email
  const siblingItems = useMemo(() => {
    if (!activeItem) return []
    return allPrep.filter(p => p.id !== activeItem.id && (
      (activeItem.cluster_id && p.cluster_id === activeItem.cluster_id) ||
      (activeItem.source_ref && p.source_ref === activeItem.source_ref)
    ))
  }, [activeItem, allPrep])

  // Dynamic Synthesis Engine
  const analysis = useMemo(() => {
    return synthesizeActionAnalysis(activeItem, detailedItem)
  }, [activeItem, detailedItem])

  const senderDomain = useMemo(() => {
    if (analysis.senderEmail.includes('@')) {
      return analysis.senderEmail.split('@')[1].replace(/[>]/g, '').toLowerCase().trim()
    }
    return ''
  }, [analysis.senderEmail])

  const isAlreadyTrained = useMemo(() => {
    return captureRules.some(r => r.active !== false && (
      (senderDomain && r.pattern_type === 'domain' && r.pattern_value.toLowerCase() === senderDomain) ||
      (r.pattern_type === 'sender' && r.pattern_value.toLowerCase() === analysis.senderEmail.toLowerCase().trim())
    ))
  }, [captureRules, senderDomain, analysis.senderEmail])

  // Check if suggested event is already in the calendar
  const matchedCalendarEvent = useMemo(() => {
    if (createdEventId) {
      return rollingEvents.find((e) => e.id === createdEventId) || { id: createdEventId, title: analysis.suggestedEvent?.title }
    }
    if (activeItem?.event_id) {
      const found = rollingEvents.find((e) => e.id === activeItem.event_id)
      if (found) return found
    }
    if (analysis.suggestedEvent) {
      const targetDate = analysis.suggestedEvent.date
      const targetTitle = analysis.suggestedEvent.title.toLowerCase()
      const found = rollingEvents.find((e) => {
        const evStart = e.start_time ? e.start_time.slice(0, 10) : ''
        return evStart === targetDate && (
          e.title.toLowerCase().includes(targetTitle.slice(0, 15)) ||
          targetTitle.includes(e.title.toLowerCase().slice(0, 15))
        )
      })
      if (found) return found
    }
    return null
  }, [createdEventId, activeItem?.event_id, analysis.suggestedEvent, rollingEvents])

  // Handle 1-tap proactive calendar creation
  const handleCreateSuggestedEvent = async (plan: SuggestedEventPlan) => {
    if (creatingEvent) return
    setCreatingEvent(true)
    try {
      const startIso = plan.allDay
        ? `${plan.date}T00:00:00.000Z`
        : (plan.startTime || `${plan.date}T09:00:00.000Z`)
      const endIso = plan.allDay
        ? `${plan.date}T23:59:59.999Z`
        : (plan.endTime || `${plan.date}T10:00:00.000Z`)

      const { data: newEvt, error: insertErr } = await supabase
        .from('events')
        .insert({
          title: plan.title,
          description: plan.description || `Imported from email action: ${analysis.subject || 'Action Item'}`,
          start_time: startIso,
          end_time: endIso,
          all_day: plan.allDay,
          location_name: plan.location || null,
          status: 'confirmed',
          event_type: 'event',
        })
        .select('id')
        .single()

      if (insertErr) throw insertErr

      if (newEvt?.id) {
        // Link primary family member
        if (familyMembers.length > 0) {
          await supabase.from('event_members').insert({
            event_id: newEvt.id,
            family_member_id: familyMembers[0].id,
            role: 'primary',
            rsvp_status: 'accepted',
          })
        }

        // Link event_id on the prep item if applicable
        if (activeItem?.id) {
          await supabase.from('prep_items').update({ event_id: newEvt.id }).eq('id', activeItem.id)
        }

        setCreatedEventId(newEvt.id)
        await qc.invalidateQueries({ queryKey: ['events'] })
        await qc.invalidateQueries({ queryKey: ['prep-items'] })

        // Trigger background sync functions
        void supabase.functions.invoke('create-google-event', { body: { event_id: newEvt.id } }).catch(() => {})
        void supabase.functions.invoke('fetch-event-weather', { body: { event_id: newEvt.id } }).catch(() => {})
        void supabase.functions.invoke('enrich-event', { body: { event_id: newEvt.id } }).catch(() => {})

        navigator.vibrate?.(25)
      }
    } catch (err) {
      console.error('ActionInspectionSidecar: Failed to create suggested event', err)
      alert(`Could not create event: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setCreatingEvent(false)
    }
  }

  const handleOpenEventInSidecar = (evtId: string) => {
    setSelectedSidecarEventId(evtId)
    setSidecarTab('event')
  }

  // Current queue index for stepper
  const queueIndex = useMemo(() => {
    if (!activeItem || queueItems.length === 0) return -1
    return queueItems.findIndex((q) => q.id === activeItem.id)
  }, [queueItems, activeItem])

  const handlePrev = () => {
    if (queueIndex > 0 && onSelectAction && queueItems[queueIndex - 1]) {
      onSelectAction(queueItems[queueIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (queueIndex >= 0 && queueIndex < queueItems.length - 1 && onSelectAction && queueItems[queueIndex + 1]) {
      onSelectAction(queueItems[queueIndex + 1].id)
    }
  }

  const handleActionComplete = () => {
    if (activeItem && onCompleteAction) {
      onCompleteAction(activeItem)
      // Auto-advance to next item if available
      if (queueIndex >= 0 && queueIndex < queueItems.length - 1 && onSelectAction && queueItems[queueIndex + 1]) {
        onSelectAction(queueItems[queueIndex + 1].id)
      } else if (queueItems.length <= 1) {
        onClose()
      }
    }
  }

  const handleActionSnooze = (period: SnoozeDuration) => {
    if (activeItem && onSnoozeAction) {
      onSnoozeAction(activeItem, period)
      setSnoozeOpen(false)
      // Auto-advance to next item
      if (queueIndex >= 0 && queueIndex < queueItems.length - 1 && onSelectAction && queueItems[queueIndex + 1]) {
        onSelectAction(queueItems[queueIndex + 1].id)
      } else if (queueItems.length <= 1) {
        onClose()
      }
    }
  }

  const badge = activeItem ? sourceBadge(activeItem) : { label: 'Action Matter', icon: Mail }
  const BadgeIcon = badge.icon
  const amount = extractAmount(activeItem?.description || activeItem?.event_title)
  const isPayment = Boolean(amount) || /payment|invoice|bill|loan/i.test(activeItem?.description || '')

  const renderDocumentCard = (doc: ExtractedActionDocument) => {
    if (doc.type === 'waiver') {
      return (
        <div
          key={doc.id}
          role="button"
          tabIndex={0}
          onClick={() => setSigningModalOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              setSigningModalOpen(true)
            }
          }}
          className="p-3.5 rounded-xl bg-casa-surface border border-casa-gold/60 hover:border-casa-gold hover:bg-casa-gold/10 transition-all text-left flex items-start gap-3 group shadow-2xs cursor-pointer min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
            <PenTool size={16} className="text-casa-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover truncate">
              {signedSuccess ? '✓ Waiver Signed' : doc.title}
            </div>
            <div className="text-2xs text-casa-muted">{doc.subtitle}</div>
          </div>
        </div>
      )
    }

    if (doc.type === 'payment') {
      return (
        <a
          key={doc.id}
          href="#payment-portal"
          onClick={(e) => {
            e.preventDefault()
            alert(`Opening secure payment portal for ${doc.title}...`)
          }}
          className="p-3.5 rounded-xl bg-casa-surface border border-casa-gold/60 hover:border-casa-gold hover:bg-casa-gold/10 transition-all text-left flex items-start gap-3 group shadow-2xs no-underline min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0">
            <CreditCard size={16} className="text-casa-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover truncate">
              {doc.title}
            </div>
            <div className="text-2xs text-casa-muted font-mono font-medium">{doc.subtitle}</div>
          </div>
          <ExternalLink size={14} className="text-casa-gold mt-1 shrink-0" />
        </a>
      )
    }

    if (doc.type === 'cart') {
      return (
        <a
          key={doc.id}
          href="#cart-portal"
          onClick={(e) => {
            e.preventDefault()
            alert(`Opening shopping cart for ${doc.title}...`)
          }}
          className="p-3.5 rounded-xl bg-casa-surface border border-casa-gold/60 hover:border-casa-gold hover:bg-casa-gold/10 transition-all text-left flex items-start gap-3 group shadow-2xs no-underline min-h-[52px]"
        >
          <div className="w-9 h-9 rounded-lg bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0">
            <ShoppingCart size={16} className="text-casa-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover truncate">
              {doc.title}
            </div>
            <div className="text-2xs text-casa-muted font-medium">{doc.subtitle}</div>
          </div>
          <ExternalLink size={14} className="text-casa-gold mt-1 shrink-0" />
        </a>
      )
    }

    return (
      <a
        key={doc.id}
        href={`#${doc.id}`}
        onClick={(e) => {
          e.preventDefault()
          alert(`Opening document: ${doc.title}...`)
        }}
        className="p-3.5 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-navy/40 hover:bg-casa-bg transition-all text-left flex items-start gap-3 group shadow-2xs no-underline min-h-[52px]"
      >
        <div className="w-9 h-9 rounded-lg bg-casa-bg text-casa-muted flex items-center justify-center shrink-0">
          <FileText size={16} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-body-sm font-bold text-casa-navy truncate">{doc.title}</div>
          <div className="text-2xs text-casa-muted">{doc.subtitle}</div>
        </div>
        <ExternalLink size={14} className="text-casa-muted mt-1 shrink-0" />
      </a>
    )
  }

  return (
    <aside
      className={cn(
        'w-full h-full flex flex-col bg-casa-surface text-casa-text overflow-hidden relative select-none',
        embedded ? 'border-none shadow-none' : 'border-l border-casa-border shadow-2xl'
      )}
      onClick={(e) => e.stopPropagation()}
    >
      {/* ══════════════════════════════════════════════════════════════════════════
          1. TOP HEADER HUD (With 3D Flip to Copilot & Queue Stepper)
         ══════════════════════════════════════════════════════════════════════════ */}
      <div className="flex items-center justify-between px-5 sm:px-6 py-3.5 border-b border-casa-border/80 bg-casa-surface/90 backdrop-blur-md shrink-0 z-20">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-casa-accent-subtle text-casa-top-pick-band border border-casa-accent-subtle-border text-caption font-bold tracking-wide shrink-0">
            <BadgeIcon size={13} className="text-casa-gold" />
            <span>{badge.label}</span>
          </span>

          {activeItem?.due_by ? (
            <span className="text-caption font-bold px-2.5 py-1 rounded-full bg-rose-50 border border-rose-200/80 text-casa-error shrink-0">
              Due Today
            </span>
          ) : (
            <span className="text-caption font-bold px-2.5 py-1 rounded-full bg-casa-gold/15 border border-casa-gold/30 text-casa-top-pick-band shrink-0">
              Priority Focus
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Queue Stepper if multiple items */}
          {queueItems.length > 1 && queueIndex >= 0 && (
            <div className="flex items-center gap-1 bg-casa-bg px-2 py-0.5 rounded-full border border-casa-border/80 mr-1 text-2xs font-mono font-bold text-casa-muted">
              <span>{queueIndex + 1}/{queueItems.length}</span>
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Previous item"
                title="Previous item"
                disabled={queueIndex === 0}
                onClick={handlePrev}
                className="min-h-[26px] min-w-[26px] p-0 hover:text-casa-navy disabled:opacity-30"
                icon={<ChevronLeft size={13} />}
              />
              <IconButton
                size="sm"
                variant="ghost"
                aria-label="Next item"
                title="Next item"
                disabled={queueIndex === queueItems.length - 1}
                onClick={handleNext}
                className="min-h-[26px] min-w-[26px] p-0 hover:text-casa-navy disabled:opacity-30"
                icon={<ChevronRight size={13} />}
              />
            </div>
          )}

          {/* 3D Flip to Copilot button */}
          <IconButton
            variant="ghost"
            onClick={() => {
              onSwitchToAi({
                actionId: activeItem?.id || 'action-item',
                title: activeItem?.description || activeItem?.event_title || analysis.subject,
                subject: analysis.subject,
                sender: `${analysis.senderLabel} <${analysis.senderEmail}>`,
                amount,
                urgency: analysis.urgency,
                requiredAction: analysis.requiredAction,
                householdImpact: analysis.householdImpact,
                emailBody: detailedItem?.gmailContext?.email_body || analysis.emailBody,
              })
            }}
            className="living-header-action-btn group"
            title="Flip to Copilot (✨)"
            aria-label="Flip to Copilot"
            icon={<Rotate3d size={16} className="text-amber-700 transition-transform duration-300 group-hover:rotate-180" />}
          />

          {/* Close sidecar */}
          <IconButton
            variant="ghost"
            onClick={onClose}
            aria-label="Close details"
            title="Close details"
            className="living-header-action-btn"
            icon={<X size={16} className="text-slate-800" />}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          2. SCROLLABLE BODY (AI Brief, Attachments, Reader-Mode Email)
         ══════════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 py-5 space-y-5 overscroll-contain touch-pan-y">
        
        {/* Title & Subject Hero */}
        <div className="space-y-2">
          <h2 className="font-display text-display-sm sm:text-display-md font-bold text-casa-navy leading-tight tracking-tight">
            {activeItem?.description || activeItem?.event_title || analysis.subject}
          </h2>

          <div className="flex items-center gap-2 text-caption text-casa-muted flex-wrap">
            <span>From: <strong>{analysis.senderLabel}</strong></span>
            <span>·</span>
            <span>{analysis.receivedTime}</span>
            {activeItem?.is_user_labeled && (
              <>
                <span>·</span>
                <span className="px-2 py-0.5 rounded-full text-2xs font-mono font-bold bg-purple-100 text-purple-900 border border-purple-200 inline-flex items-center gap-1">
                  <Tag size={10} />
                  Gmail 'Casa' Labeled
                </span>
              </>
            )}
            {amount && (
              <>
                <span>·</span>
                <span className="font-mono font-bold text-casa-gold-hover text-body-sm">{amount}</span>
              </>
            )}
            {activeItem && (activeItem.source_type === 'gmail' || activeItem.source_ref?.startsWith('gmail:')) && (
              <>
                <span>·</span>
                <a
                  href={buildGmailWebUrl(activeItem, detailedItem?.gmailContext)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-2xs font-bold text-red-900 bg-red-50 hover:bg-red-100 border border-red-200 shadow-2xs transition-colors no-underline min-h-[32px]"
                  title="Open original thread in Gmail"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Mail size={12} className="text-red-600 shrink-0" />
                  <span>Open in Gmail</span>
                  <ExternalLink size={10} className="text-red-500 shrink-0" />
                </a>
              </>
            )}
          </div>
        </div>

        {/* ══════ 1. AI EXECUTIVE BRIEF (First Thing Glanceable in 3 Seconds) ══════ */}
        <div className="p-4 sm:p-5 rounded-2xl bg-amber-50/70 border border-amber-300/80 shadow-xs space-y-3.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-amber-950 font-bold text-caption uppercase tracking-wider">
              <Sparkles size={14} className="text-amber-600" />
              <span>AI Executive Brief</span>
            </div>
            <span className="text-2xs font-mono font-semibold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
              Verified by Casa AI
            </span>
          </div>

          <ul className="space-y-2.5 text-body-sm text-amber-950 font-medium leading-snug">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span>
                <strong>Urgency:</strong> {analysis.urgency}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span>
                <strong>Required Action:</strong> {analysis.requiredAction}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <span>
                <strong>Household Impact:</strong> {analysis.householdImpact}
              </span>
            </li>
          </ul>

          {/* ══════ PROACTIVE ACTION PLAN: SUGGESTED EVENT ══════ */}
          {analysis.suggestedEvent && (
            <div className="pt-3 border-t border-amber-200/90 flex flex-col gap-2.5">
              <div className="flex items-center justify-between">
                <span className="text-caption font-bold text-amber-950 flex items-center gap-1.5">
                  <Calendar size={13} className="text-amber-700" />
                  <span>Suggested Event Action Plan</span>
                </span>
                <span className="text-3xs uppercase font-mono font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                  Ready to Schedule
                </span>
              </div>

              <div className="p-3.5 rounded-xl bg-white/90 border border-amber-300/80 flex flex-col gap-2.5 shadow-2xs">
                <div className="space-y-1">
                  <div className="text-body-sm font-bold text-casa-navy leading-snug">
                    {analysis.suggestedEvent.title}
                  </div>
                  <div className="flex items-center gap-2 text-2xs text-casa-muted flex-wrap font-medium">
                    <span className="inline-flex items-center gap-1 text-casa-navy font-semibold">
                      <Calendar size={11} className="text-casa-gold" />
                      {analysis.suggestedEvent.displayDate}
                      {analysis.suggestedEvent.allDay ? ' · All Day' : ''}
                    </span>
                    {analysis.suggestedEvent.location && (
                      <>
                        <span>·</span>
                        <span className="inline-flex items-center gap-1">
                          <MapPin size={11} className="text-casa-muted" />
                          {analysis.suggestedEvent.location}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {matchedCalendarEvent ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleOpenEventInSidecar(matchedCalendarEvent.id)}
                    className="w-full min-h-[44px] sm:min-h-[48px] rounded-xl bg-emerald-50 hover:bg-emerald-100/90 border border-emerald-300/90 text-emerald-800 font-bold text-body-sm flex items-center justify-center gap-2 transition-all shadow-2xs"
                  >
                    <CalendarCheck size={16} className="text-emerald-600 shrink-0" />
                    <span>Scheduled ({analysis.suggestedEvent.displayDate}) · View in Calendar</span>
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="strong"
                    disabled={creatingEvent}
                    onClick={() => handleCreateSuggestedEvent(analysis.suggestedEvent!)}
                    className="w-full min-h-[44px] sm:min-h-[48px] rounded-xl text-body-sm font-bold shadow-card flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99]"
                  >
                    {creatingEvent ? (
                      <>
                        <Loader2 size={16} className="animate-spin text-casa-gold" />
                        <span>Adding to Calendar...</span>
                      </>
                    ) : (
                      <>
                        <CalendarPlus size={16} className="text-casa-gold shrink-0" />
                        <span>Add to Calendar ({analysis.suggestedEvent.displayDate})</span>
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══════ SIBLING CLUSTER ITEMS (Extracted from Same Email) ══════ */}
        {siblingItems.length > 0 && (
          <div className="p-3.5 rounded-2xl bg-white border border-casa-border/80 shadow-2xs space-y-2">
            <div className="text-caption font-bold text-casa-navy flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Sparkles size={13} className="text-casa-gold" />
                <span>Other Actions from this Email ({siblingItems.length})</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5">
              {siblingItems.map((sib) => (
                <button
                  key={sib.id}
                  type="button"
                  onClick={() => onSelectAction?.(sib.id)}
                  className="text-left px-3 py-2 rounded-xl bg-casa-bg hover:bg-casa-gold/10 border border-casa-border/60 transition-colors flex items-center justify-between text-body-sm font-medium text-casa-text min-h-[44px]"
                >
                  <span className="truncate">{sib.description || sib.event_title}</span>
                  <span className="text-caption text-casa-gold font-semibold shrink-0 ml-2">Inspect →</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ══════ TEACH CASA / TRAINING FEEDBACK SECTION ══════ */}
        <div className="p-4 rounded-2xl bg-purple-50/70 border border-purple-200/80 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-purple-950 font-bold text-caption uppercase tracking-wider">
              <Tag size={14} className="text-purple-600" />
              <span>Teach Casa &amp; Training</span>
            </div>
            {activeItem?.is_user_labeled ? (
              <span className="text-2xs font-mono font-semibold px-2 py-0.5 rounded-full bg-purple-200 text-purple-900 flex items-center gap-1">
                <Check size={11} />
                Gmail Label: Casa
              </span>
            ) : isAlreadyTrained ? (
              <span className="text-2xs font-mono font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 flex items-center gap-1">
                <Check size={11} />
                Rule Active
              </span>
            ) : null}
          </div>

          <p className="text-body-sm text-purple-950/80 leading-snug">
            {isAlreadyTrained
              ? `Casa has learned to automatically capture and structure incoming emails from @${senderDomain || analysis.senderLabel}.`
              : `Teach Casa to automatically recognize emails from @${senderDomain || analysis.senderLabel}, or untrain/thumbs-down if captured incorrectly.`}
          </p>

          {trainedSuccess ? (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-caption font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCheck size={16} className="text-emerald-600 shrink-0" />
              <span>{trainedSuccess}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Positive Capture Training */}
              {senderDomain && !isAlreadyTrained && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isSavingRule}
                  onClick={async () => {
                    await saveCaptureRule({
                      pattern_type: 'domain',
                      pattern_value: senderDomain,
                      rule_directive: `Always capture actions and calendar events from @${senderDomain}.`,
                      origin: 'manual_teach',
                      confidence: 1.0,
                    })
                    setTrainedSuccess(`Learned: Always scan @${senderDomain}`)
                    setTimeout(() => setTrainedSuccess(null), 5000)
                  }}
                  className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-purple-100/60 border border-purple-300 text-purple-900 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
                >
                  <BookmarkPlus size={14} className="text-purple-600" />
                  <span>Always Capture from @{senderDomain}</span>
                </Button>
              )}

              {!isAlreadyTrained && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isSavingRule}
                  onClick={async () => {
                    await saveCaptureRule({
                      pattern_type: 'sender',
                      pattern_value: analysis.senderEmail.toLowerCase().trim() || analysis.senderLabel.toLowerCase().trim(),
                      rule_directive: `Always extract tasks, forms, and calendar events from ${analysis.senderLabel}.`,
                      origin: 'manual_teach',
                      confidence: 1.0,
                    })
                    setTrainedSuccess(`Learned: Always scan ${analysis.senderLabel}`)
                    setTimeout(() => setTrainedSuccess(null), 5000)
                  }}
                  className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-purple-100/60 border border-purple-300 text-purple-900 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
                >
                  <Sparkles size={14} className="text-purple-600" />
                  <span>Always Capture from {analysis.senderLabel}</span>
                </Button>
              )}

              {/* Negative Feedback / Untrain */}
              {isAlreadyTrained ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isSavingRule}
                  onClick={async () => {
                    if (senderDomain) {
                      await removeCaptureRule({ pattern_type: 'domain', pattern_value: senderDomain })
                    }
                    await removeCaptureRule({
                      pattern_type: 'sender',
                      pattern_value: analysis.senderEmail.toLowerCase().trim() || analysis.senderLabel.toLowerCase().trim(),
                    })
                    setTrainedSuccess(`Untrained: Removed capture rules for @${senderDomain || analysis.senderLabel}`)
                    setTimeout(() => setTrainedSuccess(null), 5000)
                  }}
                  className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-800 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
                >
                  <Undo2 size={14} className="text-rose-600" />
                  <span>Untrain @{senderDomain || analysis.senderLabel}</span>
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isSavingRule}
                  onClick={async () => {
                    if (activeItem) {
                      await downvote(activeItem.id)
                    }
                    if (senderDomain) {
                      await saveCaptureRule({
                        pattern_type: 'domain',
                        pattern_value: senderDomain,
                        rule_directive: `Ignore promotional and non-actionable emails from @${senderDomain}.`,
                        origin: 'user_untrain',
                        active: false,
                      })
                    }
                    setTrainedSuccess('Dismissed & Learned: Casa will ignore similar items in future scans.')
                    setTimeout(() => {
                      setTrainedSuccess(null)
                      onClose()
                    }, 1800)
                  }}
                  className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-800 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
                >
                  <ThumbsDown size={14} className="text-rose-600" />
                  <span>Not Actionable (Thumbs Down)</span>
                </Button>
              )}
            </div>
          )}
        </div>

        {/* ══════ EXTRACTED ATTACHMENTS & ACTIONABLE PORTALS ══════ */}
        <div className="space-y-2.5">
          <div className="text-caption font-bold uppercase tracking-wider text-casa-muted flex items-center gap-1.5">
            <FileText size={13} className="text-casa-gold" />
            <span>Extracted Documents &amp; Portals</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {analysis.documents.map(renderDocumentCard)}
          </div>
        </div>

        {/* ══════ CLEAN READER-MODE SOURCE EMAIL / EVIDENCE ══════ */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="text-caption font-bold uppercase tracking-wider text-casa-muted flex items-center gap-1.5">
              <Mail size={13} className="text-casa-navy" />
              <span>Source Email · Reader Mode</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRawSource((v) => !v)}
              className="text-caption text-casa-muted hover:text-casa-navy underline underline-offset-2 h-auto p-0 min-h-0 hover:bg-transparent"
            >
              {showRawSource ? 'Show Reader Mode' : 'View Raw Text'}
            </Button>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-casa-bg border border-casa-border/80 text-casa-navy space-y-3 font-body">
            <div className="border-b border-casa-border/60 pb-3 text-caption text-casa-muted space-y-1">
              <div><strong>Subject:</strong> {analysis.subject}</div>
              <div><strong>From:</strong> {analysis.senderLabel} &lt;{analysis.senderEmail}&gt;</div>
              <div><strong>To:</strong> Jake &amp; Kelly Tabor &lt;taborfamily@gmail.com&gt;</div>
            </div>

            {showRawSource ? (
              <div className="space-y-2">
                <pre className="font-mono text-2xs p-3.5 bg-white rounded-xl border border-casa-border overflow-x-auto whitespace-pre-wrap text-casa-text leading-relaxed">
                  {detailedItem?.gmailContext?.email_body || analysis.emailBody}
                </pre>
                {activeItem?.source_ref && (
                  <div className="text-3xs font-mono text-casa-muted/70 px-1">
                    Source Reference: {activeItem.source_ref}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-body-sm leading-relaxed space-y-3 text-casa-text whitespace-pre-line">
                {detailedItem?.gmailContext?.email_body || analysis.emailBody}
              </div>
            )}

            {activeItem && (activeItem.source_type === 'gmail' || activeItem.source_ref?.startsWith('gmail:')) && (
              <div className="pt-2">
                <a
                  href={buildGmailWebUrl(activeItem, detailedItem?.gmailContext)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[48px] rounded-xl bg-white hover:bg-red-50/70 border border-red-200 text-red-950 font-bold text-body-sm flex items-center justify-center gap-2 shadow-2xs transition-all no-underline"
                >
                  <Mail size={16} className="text-red-600" />
                  <span>Open Full Thread in Gmail</span>
                  <ExternalLink size={14} className="text-red-500" />
                </a>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ══════════════════════════════════════════════════════════════════════════
          3. PINNED BOTTOM 1-TAP ACTION BAR (48px+ Touch Targets)
         ══════════════════════════════════════════════════════════════════════════ */}
      <div className="px-5 sm:px-6 py-4 border-t border-casa-border/80 bg-casa-surface/95 backdrop-blur-md shrink-0 flex flex-col gap-2 z-20">
        <div className="flex items-center gap-3">
          {/* Primary Action Button (Navy with Green Check) */}
          <Button
            size="lg"
            variant="strong"
            onClick={handleActionComplete}
            className="flex-1 min-h-[48px] sm:min-h-[52px] rounded-full text-body-sm sm:text-body font-bold shadow-card flex items-center justify-center gap-2 hover:brightness-110"
            leadingIcon={<Check size={18} strokeWidth={2.5} className="text-emerald-400 shrink-0" />}
          >
            <span>{isPayment ? 'Mark Paid & Done' : 'Mark Done'}</span>
          </Button>

          {/* Snooze Split Pill Button */}
          <div className="relative inline-flex items-stretch rounded-full bg-casa-surface border border-casa-border hover:border-casa-gold transition-all shadow-xs shrink-0">
            <Button
              size="lg"
              variant="ghost"
              onClick={() => handleActionSnooze('tomorrow')}
              className="px-4 text-body-sm font-semibold text-casa-navy hover:text-casa-gold-hover transition-colors min-h-[48px] sm:min-h-[52px] rounded-l-full rounded-r-none border-none flex items-center gap-2"
              title="Snooze to tomorrow morning"
              leadingIcon={<Clock size={15} className="text-casa-gold" />}
            >
              <span>Snooze Tomorrow</span>
            </Button>

            <IconButton
              size="lg"
              variant="ghost"
              onClick={() => setSnoozeOpen((v) => !v)}
              aria-label="More snooze options"
              title="More snooze options"
              className="px-3 border-l border-casa-border/70 text-casa-muted hover:text-casa-navy hover:bg-casa-gold/10 transition-colors rounded-r-full rounded-l-none min-h-[48px] sm:min-h-[52px] min-w-[44px]"
              icon={
                <ChevronDown
                  size={16}
                  className={cn('transition-transform duration-200', snoozeOpen && 'rotate-180')}
                />
              }
            />

            {/* Snooze Dropdown Menu */}
            {snoozeOpen && (
              <div className="absolute right-0 bottom-full mb-2 w-52 bg-casa-surface rounded-2xl border border-casa-border shadow-modal p-1.5 z-40 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('3h')}
                  className="w-full px-3 py-2 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
                  leadingIcon={<Moon size={14} className="text-casa-gold" />}
                >
                  <span>Tonight (+3h)</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('tomorrow')}
                  className="w-full px-3 py-2 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
                  leadingIcon={<Sun size={14} className="text-casa-gold" />}
                >
                  <span>Tomorrow Morning (9 AM)</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('1d')}
                  className="w-full px-3 py-2 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
                  leadingIcon={<Clock size={14} className="text-casa-gold" />}
                >
                  <span>In 24 Hours</span>
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════ DIGITAL SIGNATURE MODAL ══════ */}
      {signingModalOpen && (
        <div className="fixed inset-0 z-modal bg-casa-navy/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-casa-surface rounded-3xl border border-casa-gold/40 shadow-modal max-w-lg w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-body-lg font-bold text-casa-navy">
                Sign Camp Medical Release
              </h3>
              <IconButton
                size="sm"
                variant="ghost"
                onClick={() => setSigningModalOpen(false)}
                aria-label="Close signature modal"
                icon={<X size={16} />}
              />
            </div>

            <p className="text-caption text-casa-muted">
              I, parent/guardian of <strong>Owen Tabor</strong>, authorize emergency medical treatment for the Lake Alpine Science Camp.
            </p>

            <div className="h-32 border-2 border-dashed border-casa-border rounded-2xl flex flex-col items-center justify-center bg-casa-bg text-casa-muted cursor-crosshair">
              <span className="font-display text-display-xs italic text-casa-navy/80">Jake Tabor</span>
              <span className="text-2xs text-casa-muted mt-1">Digital signature confirmed · 8/15/2026</span>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSigningModalOpen(false)}
                className="rounded-full min-h-[44px]"
              >
                Cancel
              </Button>
              <Button
                variant="strong"
                size="sm"
                onClick={() => {
                  setSignedSuccess(true)
                  setSigningModalOpen(false)
                  handleActionComplete()
                }}
                className="rounded-full min-h-[44px] px-5 font-bold"
              >
                Sign &amp; Complete Task
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
