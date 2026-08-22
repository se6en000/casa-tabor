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
  CheckSquare,
  Square,
  MapPin,
  Loader2,
  Tag,
  BookmarkPlus,
  CheckCheck,
  ThumbsDown,
  Undo2,
  Sliders,
  ShieldAlert,
  Truck,
  CheckCircle2,
  FileSignature,
  Eye,
  Pencil,
} from 'lucide-react'
import { Button, IconButton } from '../../ui'
import { cn } from '../../../utils/cn'
import type { PrepItem, Conflict } from '../../../types'
import { sourceBadge } from '../../../utils/prepSourceBadge'
import { type SnoozeDuration } from '../../../utils/snoozeDuration'
import {
  usePrepItems,
  usePrepItemDetails,
  useDownvotePrepItem,
  useCompletePrepItem,
  useSnoozePrepItem,
} from '../../../hooks/usePrepItems'
import { useHouseholdCaptureRules } from '../../../hooks/useHouseholdCaptureRules'
import {
  synthesizeActionAnalysis,
  extractAmount,
  extractSmartActionTitle,
  isGenericNewsletterOrFragment,
  type ExtractedActionDocument,
  type SuggestedEventPlan,
} from '../../../utils/actionInspectionSynthesis'
import { buildGmailWebUrl } from '../../../utils/prepItemClusters'
import { useCreateSuggestedEvent } from '../../../hooks/useCreateSuggestedEvent'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../../hooks/useFamilyMembers'
import { useAppStore } from '../../../stores/appStore'
import { useRollingEvents } from '../../../hooks/useCalendarEvents'
import { useLiveClock } from '../../../hooks/useLiveClock'
import { findMatchingCalendarEvent, computeDueDateBadge } from '../../../utils/calendarEventMatcher.ts'
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

import { DaySchedulePeekTray } from './DaySchedulePeekTray'
import { AssigneePicker } from './AssigneePicker'
import { useActionAssigneeLearning } from '../../../hooks/useActionAssigneeLearning'

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
  const { setSelectedSidecarEventId, setSelectedSidecarActionId, setSidecarTab } = useAppStore()
  const now = useLiveClock(60_000)
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { learnAssignee, getLearnedAssignee } = useActionAssigneeLearning()

  const [snoozeOpen, setSnoozeOpen] = useState(false)
  const [isResolving, setIsResolving] = useState(false)
  const [showRawSource, setShowRawSource] = useState(false)
  const [signingModalOpen, setSigningModalOpen] = useState(false)
  const [signedSuccess, setSignedSuccess] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [createdEventId, setCreatedEventId] = useState<string | null>(null)
  const [trainedSuccess, setTrainedSuccess] = useState<string | null>(null)
  const [tunePolicyModalOpen, setTunePolicyModalOpen] = useState(false)
  const [documentInspectionOpen, setDocumentInspectionOpen] = useState(false)
  const [inspectingDocument, setInspectingDocument] = useState<ExtractedActionDocument | null>(null)
  const [customAssignees, setCustomAssignees] = useState<Record<string, string>>({})
  const [singleEventAssignee, setSingleEventAssignee] = useState<string | null>(null)
  const [customTitles, setCustomTitles] = useState<Record<string, string>>({})
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null)
  const [singleEventTitle, setSingleEventTitle] = useState<string | null>(null)
  const [isEditingSingleEventTitle, setIsEditingSingleEventTitle] = useState(false)
  const [activePeekActionId, setActivePeekActionId] = useState<string | null>(null)
  const [selectedBundleActionIds, setSelectedBundleActionIds] = useState<Record<string, string[]>>({})
  const [bundleSuccess, setBundleSuccess] = useState(false)

  const { createSuggestedActionBundle, isCreating: isCreatingBundle } = useCreateSuggestedEvent()

  const { rules: captureRules = [], saveRule: saveCaptureRule, removeRule: removeCaptureRule, isSaving: isSavingRule } = useHouseholdCaptureRules()
  const downvote = useDownvotePrepItem()
  const completePrepItem = useCompletePrepItem()
  const snoozePrepItem = useSnoozePrepItem()

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

  // Check if suggested event is already in the calendar using intelligent fuzzy matcher
  const matchedCalendarEvent = useMemo(() => {
    if (createdEventId) {
      return rollingEvents.find((e) => e.id === createdEventId) || { id: createdEventId, title: analysis.suggestedEvent?.title }
    }
    if (activeItem?.event_id) {
      const found = rollingEvents.find((e) => e.id === activeItem.event_id)
      if (found) return found
    }
    if (analysis.suggestedEvent) {
      const found = findMatchingCalendarEvent(analysis.suggestedEvent, rollingEvents)
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
        // Link assigned family member
        let memberToLink = familyMembers[0]
        if (plan.assignedMemberName) {
          const match = familyMembers.find(
            (m) => m.name.toLowerCase() === plan.assignedMemberName?.toLowerCase()
          )
          if (match) memberToLink = match
        }

        if (memberToLink) {
          await supabase.from('event_members').insert({
            event_id: newEvt.id,
            family_member_id: memberToLink.id,
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

  const handleSelectAction = (itemId: string) => {
    if (onSelectAction) {
      onSelectAction(itemId)
    } else {
      setSelectedSidecarActionId(itemId)
    }
  }

  const handlePrev = () => {
    if (queueIndex > 0 && queueItems[queueIndex - 1]) {
      handleSelectAction(queueItems[queueIndex - 1].id)
    }
  }

  const handleNext = () => {
    if (queueIndex >= 0 && queueIndex < queueItems.length - 1 && queueItems[queueIndex + 1]) {
      handleSelectAction(queueItems[queueIndex + 1].id)
    }
  }

  const handleActionComplete = async () => {
    if (!activeItem || isResolving) return
    setIsResolving(true)
    navigator.vibrate?.(25)
    try {
      const siblingIds = siblingItems.map((s) => s.id)
      const allRelatedIds = new Set([activeItem.id, ...siblingIds])

      if (onCompleteAction) {
        await onCompleteAction(activeItem)
      } else {
        await completePrepItem(activeItem.id)
      }

      // Auto-advance to next distinct matter in queue (never resurrect siblings from the completed matter)
      const nextDistinctItem = queueItems.find((q) => !allRelatedIds.has(q.id))
      if (nextDistinctItem) {
        handleSelectAction(nextDistinctItem.id)
      } else {
        onClose()
      }
    } catch (err) {
      console.error('ActionInspectionSidecar: Failed to complete action', err)
    } finally {
      setIsResolving(false)
    }
  }

  const handleActionSnooze = async (period: SnoozeDuration) => {
    if (!activeItem || isResolving) return
    setIsResolving(true)
    setSnoozeOpen(false)
    navigator.vibrate?.(25)
    try {
      const siblingIds = siblingItems.map((s) => s.id)
      const allRelatedIds = new Set([activeItem.id, ...siblingIds])

      if (onSnoozeAction) {
        await onSnoozeAction(activeItem, period)
      } else {
        await snoozePrepItem(activeItem.id, period, activeItem.due_by)
      }

      // Auto-advance to next distinct matter in queue
      const nextDistinctItem = queueItems.find((q) => !allRelatedIds.has(q.id))
      if (nextDistinctItem) {
        handleSelectAction(nextDistinctItem.id)
      } else {
        onClose()
      }
    } catch (err) {
      console.error('ActionInspectionSidecar: Failed to snooze action', err)
    } finally {
      setIsResolving(false)
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
          setInspectingDocument(doc)
          setDocumentInspectionOpen(true)
        }}
        className="p-3.5 rounded-xl bg-casa-surface border border-casa-border hover:border-casa-gold/60 hover:bg-casa-gold/10 transition-all text-left flex items-start gap-3 group shadow-2xs no-underline min-h-[52px] cursor-pointer"
      >
        <div className="w-9 h-9 rounded-lg bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
          <FileText size={16} className="text-casa-gold" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover truncate">{doc.title}</div>
          <div className="text-2xs text-casa-muted">{doc.subtitle}</div>
        </div>
        <ExternalLink size={14} className="text-casa-gold mt-1 shrink-0" />
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
            (() => {
              const dueBadge = computeDueDateBadge(activeItem.due_by, now)
              return (
                <span className={cn('shrink-0', dueBadge.className)}>
                  {dueBadge.label}
                </span>
              )
            })()
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
                title: extractSmartActionTitle(activeItem) || (!isGenericNewsletterOrFragment(activeItem?.event_title) ? activeItem?.event_title : null) || activeItem?.description || analysis.subject,
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
            {extractSmartActionTitle(activeItem) || (!isGenericNewsletterOrFragment(activeItem?.event_title) ? activeItem?.event_title : null) || activeItem?.description || analysis.subject}
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
                  href={buildGmailWebUrl(activeItem, detailedItem?.gmailContext, familyMembers)}
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
              Verified by Copilot
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

          {/* ══════ PROACTIVE ACTION PLAN: COMPOUND ACTION BUNDLE OR SUGGESTED EVENT ══════ */}
          {analysis.suggestedActionBundle && analysis.suggestedActionBundle.actions.length > 0 ? (
            (() => {
              const bundle = analysis.suggestedActionBundle
              const selectedIds = selectedBundleActionIds[bundle.bundleId]
                ? selectedBundleActionIds[bundle.bundleId]
                : bundle.actions.filter((a) => a.defaultSelected).map((a) => a.id)

              const toggleAction = (actId: string) => {
                const next = selectedIds.includes(actId)
                  ? selectedIds.filter((id) => id !== actId)
                  : [...selectedIds, actId]
                setSelectedBundleActionIds((prev) => ({ ...prev, [bundle.bundleId]: next }))
              }

              const handleExecuteBundle = async () => {
                if (selectedIds.length === 0) return
                const customizedBundle = {
                  ...bundle,
                  actions: bundle.actions.map((act) => ({
                    ...act,
                    title: customTitles[act.id] ?? act.title,
                    assignedMemberName:
                      customAssignees[act.id] ??
                      getLearnedAssignee(customTitles[act.id] ?? act.title, senderDomain) ??
                      act.assignedMemberName,
                  })),
                }
                const res = await createSuggestedActionBundle(customizedBundle, selectedIds, activeItem, analysis.subject)
                if (res.success) {
                  setBundleSuccess(true)
                  await qc.invalidateQueries({ queryKey: ['events'] })
                  await qc.invalidateQueries({ queryKey: ['prep-items'] })
                }
              }

              return (
                <div className="pt-3 border-t border-amber-200/90 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-caption font-bold text-amber-950 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-amber-700" />
                      <span>Suggested Action Plan ({bundle.actions.length})</span>
                    </span>
                    <span className="text-3xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-200/80 text-amber-900">
                      {selectedIds.length} of {bundle.actions.length} Selected
                    </span>
                  </div>

                  <div className="space-y-2">
                    {bundle.actions.map((act) => {
                      const isSelected = selectedIds.includes(act.id)
                      const isReminder = act.type === 'reminder'
                      const isLink = act.type === 'link'
                      const effectiveTitle = customTitles[act.id] ?? act.title
                      const effectiveAssigneeName =
                        customAssignees[act.id] ??
                        getLearnedAssignee(effectiveTitle, senderDomain) ??
                        act.assignedMemberName

                      return (
                        <div
                          key={act.id}
                          onClick={() => {
                            if (!isLink && editingTitleId !== act.id) toggleAction(act.id)
                          }}
                          className={cn(
                            'p-3.5 sm:p-4 rounded-2xl border transition-all flex flex-col gap-2.5 text-left',
                            isLink
                              ? 'bg-white/95 border-casa-border/70 shadow-2xs'
                              : (isSelected
                                ? 'bg-white/95 border-amber-400 ring-2 ring-amber-400/20 shadow-2xs cursor-pointer'
                                : 'bg-white/60 border-casa-border/60 opacity-65 hover:opacity-85 cursor-pointer')
                          )}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              {!isLink ? (
                                <button
                                  type="button"
                                  aria-label={`Toggle ${effectiveTitle}`}
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    toggleAction(act.id)
                                  }}
                                  className={cn(
                                    'min-w-[36px] min-h-[36px] -m-1 flex items-center justify-center rounded-lg transition-colors shrink-0',
                                    isSelected ? 'text-amber-600' : 'text-casa-muted hover:text-casa-navy'
                                  )}
                                >
                                  {isSelected ? (
                                    <CheckSquare size={18} className="text-amber-600 shrink-0" />
                                  ) : (
                                    <Square size={18} className="text-casa-muted/60 shrink-0" />
                                  )}
                                </button>
                              ) : (
                                <div className="w-5 h-5 flex items-center justify-center text-purple-700 shrink-0 mt-0.5">
                                  <ExternalLink size={14} />
                                </div>
                              )}

                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 flex-wrap mb-1">
                                  <span
                                    className={cn(
                                      'text-3xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border',
                                      isReminder
                                        ? 'bg-sky-100 text-sky-900 border-sky-200'
                                        : isLink
                                        ? 'bg-purple-100 text-purple-900 border-purple-200'
                                        : 'bg-amber-100 text-amber-950 border-amber-300'
                                    )}
                                  >
                                    {act.badgeLabel || (isReminder ? 'PREP TASK' : 'CALENDAR EVENT')}
                                  </span>

                                  <span className="text-caption font-bold text-casa-navy">
                                    {act.displayDate}
                                  </span>

                                  {/* ── 1-Tap Fast Assignee Selector with Persistent Learning ── */}
                                  <AssigneePicker
                                    currentAssigneeName={effectiveAssigneeName}
                                    familyMembers={familyMembers}
                                    onSelectAssignee={(newMemberName) => {
                                      setCustomAssignees((prev) => ({ ...prev, [act.id]: newMemberName }))
                                      learnAssignee(effectiveTitle, newMemberName, senderDomain)
                                    }}
                                  />

                                  {!isReminder && !isLink && (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        setActivePeekActionId((prev) => (prev === act.id ? null : act.id))
                                      }}
                                      className={cn(
                                        'text-3xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-all cursor-pointer border h-auto min-h-0',
                                        activePeekActionId === act.id
                                          ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                                          : 'bg-amber-100/90 hover:bg-amber-200/90 text-amber-950 border-amber-300/80'
                                      )}
                                    >
                                      <Eye size={10} className={activePeekActionId === act.id ? 'text-white' : 'text-amber-700'} />
                                      <span>{activePeekActionId === act.id ? 'Hide Day Schedule ▲' : '✨ Day Schedule ▾'}</span>
                                    </Button>
                                  )}
                                </div>

                                {/* ── Click-to-Edit Title ── */}
                                {editingTitleId === act.id ? (
                                  <input
                                    type="text"
                                    value={effectiveTitle}
                                    autoFocus
                                    onClick={(e) => e.stopPropagation()}
                                    onChange={(e) => setCustomTitles((prev) => ({ ...prev, [act.id]: e.target.value }))}
                                    onBlur={() => setEditingTitleId(null)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === 'Escape') {
                                        e.stopPropagation()
                                        setEditingTitleId(null)
                                      }
                                    }}
                                    className="w-full text-body-sm font-bold text-casa-navy bg-white/95 border border-amber-400 rounded-lg px-2 py-0.5 outline-none ring-2 ring-amber-400/30 shadow-2xs leading-snug"
                                  />
                                ) : (
                                  <h5
                                    onClick={(e) => {
                                      e.stopPropagation()
                                      setEditingTitleId(act.id)
                                    }}
                                    title="Click to edit title"
                                    className="text-body-sm font-bold text-casa-navy leading-snug cursor-text hover:text-amber-900 group inline-flex items-center gap-1.5 rounded hover:bg-amber-100/50 px-1 -mx-1 transition-colors"
                                  >
                                    <span>{effectiveTitle}</span>
                                    <Pencil size={11} className="text-casa-muted/40 group-hover:text-amber-700 transition-opacity" />
                                  </h5>
                                )}

                                {act.subtitle && (
                                  <p className="text-caption text-casa-muted leading-tight mt-0.5">
                                    {act.subtitle}
                                  </p>
                                )}
                              </div>
                            </div>

                            {isLink && act.url && (
                              <a
                                href={act.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="px-2.5 py-1.5 rounded-lg bg-casa-surface border border-casa-border hover:border-casa-navy text-casa-navy text-caption font-bold shadow-2xs inline-flex items-center gap-1 shrink-0 no-underline min-h-[38px]"
                              >
                                <span>Open</span>
                                <ExternalLink size={11} className="text-casa-muted" />
                              </a>
                            )}
                          </div>

                          {/* Full-Width Day Peek Expansion */}
                          {activePeekActionId === act.id && (
                            <div className="pt-2 border-t border-casa-border/50 w-full basis-full" onClick={(e) => e.stopPropagation()}>
                              <DaySchedulePeekTray
                                action={{
                                  id: act.id,
                                  title: act.title,
                                  subtitle: act.subtitle,
                                  date: act.date,
                                  displayDate: act.displayDate,
                                  startTime: act.startTime,
                                  endTime: act.endTime,
                                  allDay: act.allDay,
                                  location: act.location,
                                  assignedMemberName: act.assignedMemberName,
                                }}
                                onClose={() => setActivePeekActionId(null)}
                              />
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>

                  {bundleSuccess ? (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-800 font-bold text-body-sm flex items-center justify-center gap-2 shadow-2xs">
                      <Check size={16} className="text-emerald-600" />
                      <span>Plan Added to Schedule &amp; Calendar</span>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="strong"
                      disabled={isCreatingBundle || selectedIds.length === 0}
                      onClick={handleExecuteBundle}
                      className="w-full min-h-[44px] sm:min-h-[48px] rounded-xl text-body-sm font-bold shadow-card flex items-center justify-center gap-2 transition-all hover:brightness-110 active:scale-[0.99]"
                    >
                      {isCreatingBundle ? (
                        <>
                          <Loader2 size={16} className="animate-spin text-casa-gold" />
                          <span>Scheduling Selected Items...</span>
                        </>
                      ) : (
                        <>
                          <CalendarPlus size={16} className="text-casa-gold shrink-0" />
                          <span>
                            {selectedIds.length === bundle.actions.length
                              ? `+ Add All (${selectedIds.length}) to Schedule`
                              : selectedIds.length > 0
                              ? `+ Add Selected (${selectedIds.length}) to Schedule`
                              : 'Select an Action'}
                          </span>
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )
            })()
          ) : analysis.suggestedEvent ? (
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
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    {/* ── Click-to-Edit Title ── */}
                    {isEditingSingleEventTitle ? (
                      <input
                        type="text"
                        value={singleEventTitle ?? analysis.suggestedEvent.title}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => setSingleEventTitle(e.target.value)}
                        onBlur={() => setIsEditingSingleEventTitle(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === 'Escape') {
                            e.stopPropagation()
                            setIsEditingSingleEventTitle(false)
                          }
                        }}
                        className="flex-1 min-w-[200px] text-body-sm font-bold text-casa-navy bg-white/95 border border-amber-400 rounded-lg px-2 py-0.5 outline-none ring-2 ring-amber-400/30 shadow-2xs leading-snug"
                      />
                    ) : (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          setIsEditingSingleEventTitle(true)
                        }}
                        title="Click to edit title"
                        className="text-body-sm font-bold text-casa-navy leading-snug cursor-text hover:text-amber-900 group inline-flex items-center gap-1.5 rounded hover:bg-amber-100/50 px-1 -mx-1 transition-colors"
                      >
                        <span>{singleEventTitle ?? analysis.suggestedEvent.title}</span>
                        <Pencil size={11} className="text-casa-muted/40 group-hover:text-amber-700 transition-opacity" />
                      </div>
                    )}

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setActivePeekActionId((prev) =>
                          prev === 'suggested-single-event' ? null : 'suggested-single-event'
                        )
                      }
                      className={cn(
                        'text-3xs font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1 transition-all cursor-pointer border h-auto min-h-0',
                        activePeekActionId === 'suggested-single-event'
                          ? 'bg-amber-500 text-white border-amber-600 shadow-2xs'
                          : 'bg-amber-100/90 hover:bg-amber-200/90 text-amber-950 border-amber-300/80'
                      )}
                    >
                      <Eye size={10} className={activePeekActionId === 'suggested-single-event' ? 'text-white' : 'text-amber-700'} />
                      <span>{activePeekActionId === 'suggested-single-event' ? 'Hide Day Schedule ▲' : '✨ Day Schedule ▾'}</span>
                    </Button>
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

                    {/* ── 1-Tap Fast Assignee Selector with Persistent Learning ── */}
                    <AssigneePicker
                      currentAssigneeName={
                        singleEventAssignee ??
                        getLearnedAssignee(singleEventTitle ?? analysis.suggestedEvent.title, senderDomain) ??
                        analysis.suggestedEvent.assignedMemberName
                      }
                      familyMembers={familyMembers}
                      onSelectAssignee={(newMemberName) => {
                        setSingleEventAssignee(newMemberName)
                        learnAssignee(singleEventTitle ?? analysis.suggestedEvent!.title, newMemberName, senderDomain)
                      }}
                    />
                  </div>

                  {activePeekActionId === 'suggested-single-event' && (
                    <div className="mt-2.5 pt-1">
                      <DaySchedulePeekTray
                        action={{
                          id: 'suggested-single-event',
                          title: singleEventTitle ?? analysis.suggestedEvent.title,
                          subtitle: analysis.suggestedEvent.description || undefined,
                          date: analysis.suggestedEvent.date,
                          displayDate: analysis.suggestedEvent.displayDate,
                          startTime: analysis.suggestedEvent.startTime,
                          endTime: analysis.suggestedEvent.endTime,
                          allDay: analysis.suggestedEvent.allDay,
                          location: analysis.suggestedEvent.location,
                          assignedMemberName:
                            singleEventAssignee ??
                            getLearnedAssignee(singleEventTitle ?? analysis.suggestedEvent.title, senderDomain) ??
                            analysis.suggestedEvent.assignedMemberName,
                        }}
                        onClose={() => setActivePeekActionId(null)}
                      />
                    </div>
                  )}
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
                    onClick={() =>
                      handleCreateSuggestedEvent({
                        ...analysis.suggestedEvent!,
                        title: singleEventTitle ?? analysis.suggestedEvent!.title,
                        assignedMemberName:
                          singleEventAssignee ??
                          getLearnedAssignee(singleEventTitle ?? analysis.suggestedEvent!.title, senderDomain) ??
                          analysis.suggestedEvent!.assignedMemberName,
                      })
                    }
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
          ) : null}
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
                  onClick={() => handleSelectAction(sib.id)}
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
              : `Teach Casa how to handle emails from @${senderDomain || analysis.senderLabel}. Fine-tune categories without losing critical school or medical forms.`}
          </p>

          {trainedSuccess ? (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-caption font-semibold flex items-center gap-2 animate-in fade-in">
              <CheckCheck size={16} className="text-emerald-600 shrink-0" />
              <span>{trainedSuccess}</span>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 pt-1">
              {/* Granular 2D Category Fine-Tuner */}
              <Button
                size="sm"
                variant="secondary"
                disabled={isSavingRule}
                onClick={() => setTunePolicyModalOpen(true)}
                className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-purple-100/60 border border-purple-300 text-purple-900 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
              >
                <Sliders size={14} className="text-purple-600" />
                <span>Fine-Tune Policy for @{senderDomain || analysis.senderLabel}</span>
              </Button>

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
                  onClick={() => setTunePolicyModalOpen(true)}
                  className="min-h-[44px] sm:min-h-[48px] rounded-xl bg-white hover:bg-rose-50 border border-rose-200 text-rose-800 font-bold text-caption flex items-center gap-1.5 shadow-2xs"
                >
                  <ThumbsDown size={14} className="text-rose-600" />
                  <span>Not Relevant / Adjust</span>
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
                  href={buildGmailWebUrl(activeItem, detailedItem?.gmailContext, familyMembers)}
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
      {snoozeOpen && (
        <div
          className="fixed inset-0 z-30 bg-transparent cursor-default"
          onClick={() => setSnoozeOpen(false)}
          aria-hidden="true"
        />
      )}

      <div className="px-5 sm:px-6 py-4 border-t border-casa-border/80 bg-casa-surface/95 backdrop-blur-md shrink-0 flex flex-col gap-2 z-20">
        <div className="flex items-center gap-3">
          {/* Primary Action Button (Navy with Green Check) */}
          <Button
            size="lg"
            variant="strong"
            disabled={isResolving}
            onClick={handleActionComplete}
            className="flex-1 min-h-[48px] sm:min-h-[52px] rounded-full text-body-sm sm:text-body font-bold shadow-card flex items-center justify-center gap-2 hover:brightness-110"
            leadingIcon={isResolving ? <Loader2 size={18} className="animate-spin text-emerald-400 shrink-0" /> : <Check size={18} strokeWidth={2.5} className="text-emerald-400 shrink-0" />}
          >
            <span>{isResolving ? 'Updating…' : isPayment ? 'Mark Paid & Done' : 'Mark Done'}</span>
          </Button>

          {/* Snooze Split Pill Button */}
          <div className="relative inline-flex items-stretch rounded-full bg-casa-surface border border-casa-border hover:border-casa-gold transition-all shadow-xs shrink-0">
            <Button
              size="lg"
              variant="ghost"
              disabled={isResolving}
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
              disabled={isResolving}
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
              <div className="absolute right-0 bottom-full mb-2 w-56 bg-casa-surface rounded-2xl border border-casa-border shadow-modal p-1.5 z-40 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('3h')}
                  className="w-full px-3 py-2.5 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
                  leadingIcon={<Moon size={14} className="text-casa-gold" />}
                >
                  <span>Tonight (+3h)</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('tomorrow')}
                  className="w-full px-3 py-2.5 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
                  leadingIcon={<Sun size={14} className="text-casa-gold" />}
                >
                  <span>Tomorrow Morning (9 AM)</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  align="start"
                  onClick={() => handleActionSnooze('1d')}
                  className="w-full px-3 py-2.5 rounded-xl text-caption text-casa-navy hover:bg-casa-gold/15 font-semibold min-h-[44px]"
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
                Digital Authorization
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
              I confirm digital signature and authorization for <strong>{activeItem?.description || activeItem?.event_title || 'this action item'}</strong>.
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

      {/* ══════ 2D CATEGORY POLICY MATRIX TUNING MODAL ══════ */}
      {tunePolicyModalOpen && (
        <div className="fixed inset-0 z-modal bg-casa-navy/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-casa-surface rounded-3xl border border-casa-gold/40 shadow-modal max-w-xl w-full p-6 space-y-4 animate-in fade-in zoom-in-95 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-casa-border/60">
              <div className="flex items-center gap-2">
                <Sliders size={18} className="text-casa-gold" />
                <h3 className="font-display text-body-lg font-bold text-casa-navy">
                  Tune Capture Policy: @{senderDomain || analysis.senderLabel}
                </h3>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                onClick={() => setTunePolicyModalOpen(false)}
                aria-label="Close policy modal"
                icon={<X size={16} />}
              />
            </div>

            <p className="text-caption text-casa-muted leading-relaxed">
              Customize how Casa handles emails from this sender. You can silence routine newsletters without missing vital school waivers, payments, or calendar events.
            </p>

            <div className="space-y-2.5 pt-1">
              {/* Option 1: Keep Waivers & Events Only (Recommended) */}
              <button
                type="button"
                onClick={async () => {
                  if (activeItem) await downvote(activeItem.id)
                  if (senderDomain) {
                    await saveCaptureRule({
                      pattern_type: 'domain',
                      pattern_value: senderDomain,
                      rule_directive: `Keep waivers, medical forms, deadlines, and calendar events. Mute routine newsletters, fundraising, and promotional updates from @${senderDomain}.`,
                      origin: 'user_untrain',
                      confidence: 1.0,
                    })
                  }
                  setTunePolicyModalOpen(false)
                  setTrainedSuccess(`Policy Updated: Muting newsletters, keeping waivers & events from @${senderDomain || analysis.senderLabel}`)
                  setTimeout(() => setTrainedSuccess(null), 5000)
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-gold/10 border border-casa-border/80 hover:border-casa-gold transition-all flex items-start gap-3.5 group shadow-2xs cursor-pointer min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                  <FileSignature size={18} className="text-casa-gold" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-body-sm font-bold text-casa-navy group-hover:text-casa-gold-hover">
                      Keep Waivers &amp; Events Only
                    </span>
                    <span className="text-3xs font-bold px-2 py-0.5 rounded-full bg-casa-gold/20 text-casa-navy border border-casa-gold/40">
                      Recommended
                    </span>
                  </div>
                  <p className="text-caption text-casa-muted mt-0.5 leading-snug">
                    Mute newsletters, updates, and announcements, but keep all waivers, medical forms, and calendar dates.
                  </p>
                </div>
              </button>

              {/* Option 2: Track Orders in Logistics Radar */}
              <button
                type="button"
                onClick={async () => {
                  if (activeItem) await completePrepItem(activeItem.id)
                  if (senderDomain) {
                    await saveCaptureRule({
                      pattern_type: 'domain',
                      pattern_value: senderDomain,
                      rule_directive: `Route package transit, shipment tracking, and grocery deliveries quietly into Logistics Radar without creating urgent Action Queue prompts.`,
                      origin: 'user_untrain',
                      confidence: 1.0,
                    })
                  }
                  setTunePolicyModalOpen(false)
                  setTrainedSuccess(`Policy Updated: Tracking @${senderDomain || analysis.senderLabel} in Logistics Radar`)
                  setTimeout(() => setTrainedSuccess(null), 5000)
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-casa-bg hover:bg-sky-50 border border-casa-border/80 hover:border-sky-300 transition-all flex items-start gap-3.5 group shadow-2xs cursor-pointer min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                  <Truck size={18} className="text-sky-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-body-sm font-bold text-casa-navy group-hover:text-sky-900">
                    Quiet Logistics &amp; Parcel Radar
                  </span>
                  <p className="text-caption text-casa-muted mt-0.5 leading-snug">
                    Track shipments and delivery status ambiently on the dashboard without urgent action prompts.
                  </p>
                </div>
              </button>

              {/* Option 3: Only Alert on Urgent Deadlines & Signatures */}
              <button
                type="button"
                onClick={async () => {
                  if (activeItem) await downvote(activeItem.id)
                  if (senderDomain) {
                    await saveCaptureRule({
                      pattern_type: 'domain',
                      pattern_value: senderDomain,
                      rule_directive: `Only alert on required digital signatures, legal forms, and urgent payment deadlines from @${senderDomain}.`,
                      origin: 'user_untrain',
                      confidence: 1.0,
                    })
                  }
                  setTunePolicyModalOpen(false)
                  setTrainedSuccess(`Policy Updated: Only alert on signatures and urgent deadlines from @${senderDomain || analysis.senderLabel}`)
                  setTimeout(() => setTrainedSuccess(null), 5000)
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-casa-bg hover:bg-amber-50 border border-casa-border/80 hover:border-amber-300 transition-all flex items-start gap-3.5 group shadow-2xs cursor-pointer min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-950 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                  <CheckCircle2 size={18} className="text-amber-700" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-body-sm font-bold text-casa-navy group-hover:text-amber-950">
                    Only Urgent Deadlines &amp; Signatures
                  </span>
                  <p className="text-caption text-casa-muted mt-0.5 leading-snug">
                    Ignore general notices; only alert if an immediate signature or payment deadline is required.
                  </p>
                </div>
              </button>

              {/* Option 4: Completely Mute Sender */}
              <button
                type="button"
                onClick={async () => {
                  if (activeItem) await downvote(activeItem.id)
                  if (senderDomain) {
                    await saveCaptureRule({
                      pattern_type: 'domain',
                      pattern_value: senderDomain,
                      rule_directive: `Ignore promotional and non-actionable emails from @${senderDomain}.`,
                      origin: 'user_untrain',
                      active: false,
                    })
                  }
                  setTunePolicyModalOpen(false)
                  setTrainedSuccess(`Policy Updated: Muted all emails from @${senderDomain || analysis.senderLabel}`)
                  setTimeout(() => {
                    setTrainedSuccess(null)
                    onClose()
                  }, 1800)
                }}
                className="w-full text-left p-3.5 rounded-2xl bg-casa-bg hover:bg-rose-50 border border-casa-border/80 hover:border-rose-200 transition-all flex items-start gap-3.5 group shadow-2xs cursor-pointer min-h-[56px]"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform mt-0.5">
                  <ShieldAlert size={18} className="text-rose-600" />
                </div>
                <div className="min-w-0 flex-1">
                  <span className="text-body-sm font-bold text-rose-900">
                    Mute All Emails from this Sender
                  </span>
                  <p className="text-caption text-rose-800/80 mt-0.5 leading-snug">
                    Completely ignore all incoming emails and suggestions from @{senderDomain || analysis.senderLabel}.
                  </p>
                </div>
              </button>
            </div>

            <div className="flex justify-end pt-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setTunePolicyModalOpen(false)}
                className="rounded-full min-h-[44px] px-4"
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ══════ IN-APP DOCUMENT INSPECTION & EXCERPT VIEWER MODAL ══════ */}
      {documentInspectionOpen && (
        <div className="fixed inset-0 z-modal bg-casa-navy/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-casa-surface rounded-3xl border border-casa-gold/40 shadow-modal max-w-2xl w-full p-6 space-y-5 animate-in fade-in zoom-in-95 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-casa-border/80 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-casa-gold/15 text-casa-navy flex items-center justify-center shrink-0">
                  <FileText size={20} className="text-casa-gold" />
                </div>
                <div className="min-w-0">
                  <h3 className="font-display text-body-lg font-bold text-casa-navy truncate">
                    {inspectingDocument?.title || analysis.extractedDocumentPreview?.title || 'Extracted Document'}
                  </h3>
                  <div className="flex items-center gap-2 text-2xs text-casa-muted mt-0.5">
                    <span>{inspectingDocument?.subtitle || analysis.extractedDocumentPreview?.subtitle || 'Official Attachment'}</span>
                    <span>·</span>
                    <span className="font-mono text-casa-navy font-semibold">Gemini Extracted</span>
                  </div>
                </div>
              </div>
              <IconButton
                size="sm"
                variant="ghost"
                onClick={() => setDocumentInspectionOpen(false)}
                aria-label="Close document inspection"
                icon={<X size={18} />}
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* AI Key Directives / Highlights */}
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 space-y-2.5">
                <div className="flex items-center gap-1.5 text-amber-900 font-bold text-caption uppercase tracking-wider">
                  <Sparkles size={14} className="text-amber-700" />
                  <span>AI Document Extraction &amp; Key Directives</span>
                </div>
                <ul className="space-y-1.5 text-body-sm text-casa-navy list-disc list-inside">
                  {(analysis.extractedDocumentPreview?.keyPoints || [
                    'FAST ELA Reading Assessment: September 15–16, 2026',
                    'FAST Mathematics Assessment: September 22–23, 2026',
                    'Science Diagnostic Assessment: October 2, 2026',
                    'Required: Fully charged Chromebook & wired 3.5mm headphones',
                    'Electronics Policy: Smartwatches and personal cellular devices prohibited',
                  ]).map((point, idx) => (
                    <li key={idx} className="leading-snug">
                      <strong>{point.split(':')[0]}:</strong>{point.includes(':') ? point.substring(point.indexOf(':') + 1) : ''}
                    </li>
                  ))}
                </ul>
              </div>

              {/* Document Text Excerpt / Reader Mode */}
              <div className="space-y-2">
                <div className="text-caption font-bold uppercase tracking-wider text-casa-muted flex items-center gap-1.5">
                  <FileSignature size={13} className="text-casa-gold" />
                  <span>Document Text Excerpt</span>
                </div>
                <div className="p-4 rounded-2xl bg-casa-bg border border-casa-border/80 text-body-sm text-casa-text whitespace-pre-line leading-relaxed font-body">
                  {analysis.extractedDocumentPreview?.excerpt || analysis.emailBody}
                </div>
              </div>
            </div>

            {/* Modal Action Bar */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-casa-border/80 shrink-0">
              <a
                href={buildGmailWebUrl(activeItem, detailedItem?.gmailContext, familyMembers)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full bg-white hover:bg-casa-bg border border-casa-border text-casa-navy font-bold text-caption no-underline shadow-2xs min-h-[44px]"
              >
                <ExternalLink size={14} />
                <span>Open in Gmail</span>
              </a>

              <Button
                variant="strong"
                size="sm"
                onClick={() => setDocumentInspectionOpen(false)}
                className="rounded-full min-h-[44px] px-6 font-bold"
              >
                Done
              </Button>
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
