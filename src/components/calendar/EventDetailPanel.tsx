import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import {
  X, Navigation, ChevronRight, ChevronDown, CalendarDays, House, Users, Video, Bell,
  Loader2, Crown, Plus, Check, Pencil, Share2, Phone, MessageSquare,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useTodayEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import type { EventChecklistItem, EventEnrichment, EventActionItem, EventLogistic } from '../../types'
import { getFieldsForCategory, CATEGORY_LABEL } from './categoryFields'
import { useSaveEnrichmentBatch } from '../../hooks/useEnrichEvent'
import EventEditSheet from './EventEditSheet'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useSavedPlaces, useSavePlace, findSavedPlace } from '../../hooks/useSavedPlaces'
import { useTravelEta } from '../../hooks/useTravelEta'
import { useMemberAvailability } from '../../hooks/useMemberAvailability'
import { DepartureRiskBanner } from '../shared/DepartureRiskBanner'
import {
  inferEventMode, inferEventPlanKind, derivePlan, eventAccentColor, trafficPill, eventAttendees,
  deriveSingleStopPattern, type PlanModel, type EventMode,
} from '../../lib/eventCommandCenter'
import {
  evaluateMemberAvailabilityForWindow,
  indexAvailabilityExceptionsByMember,
  indexAvailabilityRulesByMember,
} from '../../lib/memberAvailability'
import { getPersistedPlanOverrides, locationSignature, overridesStorageKey } from '../../lib/eventPlanOverrides'
import { getEventDisplayStartDay } from '../../utils/eventTime'
import { cleanEventTitle, isBirthdayEvent } from '../../utils/eventTitle'
import { BirthdayCardDecoration } from '../shared/BirthdayCardDecoration'
import { Button, Card, Chip, IconButton, Switch } from '../ui'
import EventTransportationSection from './EventTransportationSection'
import InlinePlaceEditor from './InlinePlaceEditor'
import AddressReviewSummary, { AddressTechnicalStatusChip, type AddressTechnicalStatus } from './AddressReviewSummary'
import RecurrenceScopeDialog from './RecurrenceScopeDialog'
import { persistScopedEventLocation, type EventLocationScope } from '../../lib/eventLocation'
import {
  createDefaultTransportationPlan,
  eventPassengerNames,
  syncTransportationAttendees,
  type EventTransportationPlan,
  type TransportationPlace,
} from '../../lib/eventTransportation'

// Calendar-specific aliases compose the shared theme contract without creating a parallel palette.
const S = {
  navy: 'var(--color-casa-navy)',
  muted: 'var(--color-casa-muted)',
  label: 'color-mix(in srgb, var(--color-casa-muted) 85%, white)',
  eyebrow: 'color-mix(in srgb, var(--color-casa-muted) 75%, white)',
  planLabel: 'color-mix(in srgb, white 65%, var(--color-casa-navy))',
  chipFill: 'var(--color-casa-bg)',
  yourTimeFill: 'var(--color-casa-bg)',
  coverFill: 'var(--color-casa-bg)',
  gold: 'var(--color-casa-gold)',
  goldBadge: 'color-mix(in srgb, var(--color-casa-gold) 72%, white)',
  goldText: 'color-mix(in srgb, var(--color-casa-warning) 70%, var(--color-casa-text))',
  amberBg: 'color-mix(in srgb, var(--color-casa-warning) 12%, var(--color-casa-surface))',
  amberBorder: 'color-mix(in srgb, var(--color-casa-warning) 35%, var(--color-casa-border))',
  green: 'var(--color-casa-success)',
  greenBg: 'var(--color-casa-success-soft)',
  red: 'var(--color-casa-error)',
  redBg: 'color-mix(in srgb, var(--color-casa-error) 12%, var(--color-casa-surface))',
  borderSoft: 'color-mix(in srgb, var(--color-casa-navy) 8%, transparent)',
  borderMed: 'color-mix(in srgb, var(--color-casa-navy) 10%, transparent)',
  hair: 'color-mix(in srgb, var(--color-casa-navy) 6%, transparent)',
}
const MODE_OVERRIDE_OPTIONS: Array<{ value: 'auto' | EventMode; label: string; helper?: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'hosted', label: 'Hosted' },
  { value: 'trip', label: 'Trip' },
]
const PANEL_ENTER_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1]
const PANEL_EXIT_EASE: [number, number, number, number] = [0.4, 0, 1, 1]
const ALL_CATEGORIES_FOR_PICKER = Object.keys(CATEGORY_LABEL) as string[]

function eventCrownStyle(event: EventWithDetails, region: 'cap' | 'body'): React.CSSProperties {
  if (isBirthdayEvent(event)) {
    return {
      backgroundColor: 'var(--color-casa-surface)',
      backgroundImage: 'linear-gradient(to bottom right, var(--color-casa-accent-subtle), transparent 72%)',
    }
  }
  const accent = eventAccentColor(event)
  const glowOrigin = region === 'cap' ? '90% 100%' : '90% 0%'
  const glowHeight = region === 'cap' ? '180%' : '100%'
  return {
    backgroundColor: 'var(--color-casa-navy)',
    backgroundImage: `radial-gradient(ellipse 70% ${glowHeight} at ${glowOrigin}, color-mix(in srgb, ${accent} 28%, transparent), transparent 65%)`,
  }
}

interface EventDetailPanelProps {
  event: EventWithDetails | null
  onClose: () => void
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 1023px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

const stopTouch = (e: React.TouchEvent | React.PointerEvent) => e.stopPropagation()

export default function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  const [showEdit, setShowEdit] = useState(false)
  const [verifiedOverride, setVerifiedOverride] = useState<boolean | null>(null)
  const [waitsOverride, setWaitsOverride] = useState<boolean | null>(null)
  const [driverOverrides, setDriverOverrides] = useState<Record<number, string>>({})
  const [modeOverride, setModeOverride] = useState<EventMode | null>(null)
  const [twoDriverConfirmed, setTwoDriverConfirmed] = useState(false)
  const [transportationPlan, setTransportationPlan] = useState<EventTransportationPlan | null>(null)
  const [overridesHydratedEventId, setOverridesHydratedEventId] = useState<string | null>(null)
  const [overrideSaveError, setOverrideSaveError] = useState<string | null>(null)
  const [overrideSaveRevision, setOverrideSaveRevision] = useState(0)
  const queryClient = useQueryClient()
  const isMobile = useIsMobile()
  const panelDragControls = useDragControls()
  const dragDismissOffset = isMobile ? 150 : 180
  const dragDismissVelocity = isMobile ? 550 : 700
  const addressReviewed = verifiedOverride === true

  useEffect(() => {
    if (!event) return
    setOverridesHydratedEventId(null)
    const persisted = getPersistedPlanOverrides(event)
    if (
      persisted.verified == null
      && persisted.waits == null
      && Object.keys(persisted.driverOverrides ?? {}).length === 0
      && persisted.modeOverride == null
      && !persisted.twoDriverConfirmed
      && !persisted.transportationPlan
    ) {
      setVerifiedOverride(null)
      setWaitsOverride(null)
      setDriverOverrides({})
      setModeOverride(null)
      setTwoDriverConfirmed(false)
      setTransportationPlan(null)
      setOverridesHydratedEventId(event.id)
      return
    }
    setVerifiedOverride(persisted.verified ?? null)
    setWaitsOverride(persisted.waits ?? null)
    setDriverOverrides(persisted.driverOverrides ?? {})
    const persistedMode = persisted.modeOverride === 'travel' ? 'appointment' : persisted.modeOverride
    setModeOverride(persistedMode ?? null)
    setTwoDriverConfirmed(Boolean(persisted.twoDriverConfirmed))
    const attendeeNames = eventPassengerNames(event)
    setTransportationPlan(
      persisted.transportationPlan
        ? syncTransportationAttendees(persisted.transportationPlan, attendeeNames)
        : null,
    )
    setOverridesHydratedEventId(event.id)
  }, [event?.id, event ? locationSignature(event) : null])

  useEffect(() => {
    if (!event) return
    if (overridesHydratedEventId !== event.id) return
    const hasOverrides = verifiedOverride != null || waitsOverride != null || Object.keys(driverOverrides).length > 0 || modeOverride != null || twoDriverConfirmed || transportationPlan != null
    const persist = async () => {
      setOverrideSaveError(null)
      if (!hasOverrides) {
        try {
          localStorage.removeItem(overridesStorageKey(event.id))
        } catch (error) {
          console.warn('EventDetailPanel: failed to clear persisted plan overrides', error)
        }
        const { error } = await supabase
          .from('event_plan_overrides')
          .delete()
          .eq('event_id', event.id)
        if (error) {
          console.error('EventDetailPanel: failed to clear plan overrides in DB', error)
          setOverrideSaveError('Could not save this event detail across devices.')
        }
        window.dispatchEvent(new CustomEvent('casa:overrides-updated', { detail: { eventId: event.id } }))
        return
      }

      const payload = {
        verified: verifiedOverride,
        waits: waitsOverride,
        driverOverrides,
        modeOverride,
        twoDriverConfirmed,
        transportationPlan,
        locationSignature: locationSignature(event),
      }
      try {
        localStorage.setItem(
          overridesStorageKey(event.id),
          JSON.stringify(payload),
        )
      } catch (error) {
        console.warn('EventDetailPanel: failed to persist plan overrides locally', error)
      }

      const { error } = await supabase
        .from('event_plan_overrides')
        .upsert({
          event_id: event.id,
          verified: verifiedOverride,
          waits: waitsOverride,
          driver_overrides: driverOverrides,
          mode_override: modeOverride,
          two_driver_confirmed: twoDriverConfirmed,
          transportation_plan: transportationPlan,
          location_signature: locationSignature(event),
        }, { onConflict: 'event_id' })
      if (error) {
        console.error('EventDetailPanel: failed to persist plan overrides in DB', error)
        setOverrideSaveError('Could not save this event detail across devices.')
      }
      window.dispatchEvent(new CustomEvent('casa:overrides-updated', { detail: { eventId: event.id } }))
    }
    void persist()
  }, [event?.id, overridesHydratedEventId, verifiedOverride, waitsOverride, driverOverrides, modeOverride, twoDriverConfirmed, transportationPlan, overrideSaveRevision])


  // Lock body scroll while panel is open so the calendar can't scroll behind it
  useEffect(() => {
    if (!event) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [event])

  return (
    <>
      <AnimatePresence initial={false}>
        {event && !showEdit && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.26, ease: PANEL_ENTER_EASE } }}
              exit={{ opacity: 0, transition: { duration: 0.18, ease: PANEL_EXIT_EASE } }}
              className="fixed inset-0 z-scrim"
              style={{ background: 'var(--casa-scrim)' }}
              data-panel-overlay
              onClick={onClose}
              onTouchStart={stopTouch}
              onTouchMove={stopTouch}
              onTouchEnd={stopTouch}
              onPointerDown={stopTouch}
            />

            <motion.div
              key="event-panel-shell"
              initial={{ y: '106%', opacity: 0.985 }}
              animate={{
                y: 0,
                opacity: 1,
                transition: {
                  y: { duration: 0.34, ease: PANEL_ENTER_EASE },
                  opacity: { duration: 0.22, ease: 'easeOut' },
                },
              }}
              exit={{
                y: '104%',
                opacity: 0.985,
                transition: {
                  y: { duration: 0.26, ease: PANEL_EXIT_EASE },
                  opacity: { duration: 0.16, ease: 'easeIn' },
                },
              }}
              drag="y"
              dragControls={panelDragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.18 }}
              dragMomentum={false}
              onDragEnd={(_e, info) => {
                if (info.velocity.y > dragDismissVelocity || info.offset.y > dragDismissOffset) onClose()
              }}
              style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
              className="event-command-center fixed inset-x-2 bottom-2 top-[5vh] z-modal flex flex-col overflow-hidden rounded-modal bg-casa-surface shadow-modal transform-gpu lg:bottom-4 lg:left-auto lg:right-4 lg:top-[6vh] lg:w-[40vw]"
              data-panel-overlay
              data-native-drag
              data-ptr-ignore
              role="dialog"
              aria-modal="true"
              aria-label={`${event.event_type === 'reminder' ? 'Reminder' : 'Event'} details: ${event.title}`}
              onClick={e => e.stopPropagation()}
              onPointerDown={stopTouch}
              onTouchStart={stopTouch}
              onTouchMove={stopTouch}
              onTouchEnd={stopTouch}
            >
              <div
                className="relative h-control-sm flex-shrink-0 px-3"
                style={eventCrownStyle(event, 'cap')}
              >
                <button
                  type="button"
                  className="absolute inset-x-0 top-0 z-10 mx-auto block h-control w-[86px] cursor-grab active:cursor-grabbing"
                  aria-label="Drag down to dismiss panel"
                  style={{ touchAction: 'none' }}
                  data-native-drag
                  data-ptr-ignore
                  onPointerDown={e => panelDragControls.start(e)}
                >
                  <span
                    className="mx-auto mt-1.5 block h-[5px] w-control-sm rounded-full"
                    style={{
                      background: isBirthdayEvent(event)
                        ? 'color-mix(in srgb, var(--color-casa-navy) 38%, transparent)'
                        : 'color-mix(in srgb, var(--color-casa-on-dark) 48%, transparent)',
                    }}
                  />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" data-native-drag data-ptr-ignore>
                <PanelHeader
                  event={event}
                  verified={addressReviewed}
                  modeOverride={modeOverride}
                  onClose={onClose}
                  onConfirmAddress={() => setVerifiedOverride(true)}
                  addressReviewLoading={overridesHydratedEventId !== event.id}
                  addressSaveError={overrideSaveError}
                  onRetryAddressSave={() => setOverrideSaveRevision((revision) => revision + 1)}
                  onSaveAddress={async (place, scope) => {
                    setOverridesHydratedEventId(null)
                    await persistScopedEventLocation({ event, place, scope })
                    queryClient.removeQueries({ queryKey: ['travel-eta'] })
                    await queryClient.invalidateQueries({ queryKey: ['events'] })
                  }}
                  onRosterChange={(names) => {
                    setTransportationPlan((current) => current
                      ? syncTransportationAttendees(current, names)
                      : current)
                  }}
                />
                <PanelBody
                  event={event}
                  modeOverride={modeOverride}
                  waitsOverride={waitsOverride}
                  driverOverrides={driverOverrides}
                  twoDriverConfirmed={twoDriverConfirmed}
                  transportationPlan={transportationPlan}
                  onSetWaitsOverride={(next) => {
                    setTwoDriverConfirmed(false)
                    setWaitsOverride(next)
                  }}
                  onSetDriverOverride={(legIndex, driverId) => {
                    setTwoDriverConfirmed(false)
                    setDriverOverrides((prev) => ({ ...prev, [legIndex]: driverId }))
                  }}
                  onSetModeOverride={setModeOverride}
                  onSetTwoDriverConfirmed={setTwoDriverConfirmed}
                  onSetTransportationPlan={setTransportationPlan}
                />
              </div>
              <PanelFooter event={event} modeOverride={modeOverride} onEdit={() => setShowEdit(true)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {event && (
        <EventEditSheet event={event} open={showEdit} onClose={() => setShowEdit(false)} />
      )}
    </>
  )
}

/* ── Inline Member Editor ───────────────────────────────────── */

function MemberEditor({
  event,
  onRosterChange,
}: {
  event: EventWithDetails
  onRosterChange: (names: string[]) => void
}) {
  const queryClient = useQueryClient()
  const { data: allMembers = [] } = useFamilyMembers()
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [mutationError, setMutationError] = useState<string | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)

  // Close picker on outside tap
  useEffect(() => {
    if (!showPicker) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setShowPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [showPicker])

  const sorted = [...event.members].sort((a, b) => (a.role === 'primary' ? -1 : b.role === 'primary' ? 1 : 0))
  const assignedIds = new Set(event.members.map(m => m.family_member?.id))

  async function makeOwner(memberId: string) {
    setSaving(memberId)
    // Demote current primary, promote new one
    await supabase.from('event_members').update({ role: 'attendee' }).eq('event_id', event.id).eq('role', 'primary')
    await supabase.from('event_members').update({ role: 'primary' }).eq('event_id', event.id).eq('family_member_id', memberId)
    queryClient.invalidateQueries({ queryKey: ['events'] })
    setSaving(null)
  }

  async function removeMember(eventMemberId: string, memberName: string) {
    setSaving(eventMemberId)
    setMutationError(null)
    const { error } = await supabase.from('event_members').delete().eq('id', eventMemberId)
    if (!error) {
      onRosterChange(event.members
        .filter((member) => member.id !== eventMemberId)
        .map((member) => member.family_member?.name?.trim())
        .filter((name): name is string => Boolean(name)))
      queryClient.invalidateQueries({ queryKey: ['events'] })
    } else {
      setMutationError(`Could not remove ${memberName}. ${error.message}`)
    }
    setSaving(null)
  }

  async function addMember(familyMemberId: string) {
    setSaving(familyMemberId)
    setMutationError(null)
    const { error } = await supabase.from('event_members').upsert(
      { event_id: event.id, family_member_id: familyMemberId, role: 'attendee' },
      { onConflict: 'event_id,family_member_id', ignoreDuplicates: true }
    )
    const addedMember = allMembers.find((member) => member.id === familyMemberId)
    if (!error && addedMember) {
      onRosterChange([
        ...event.members
          .map((member) => member.family_member?.name?.trim())
          .filter((name): name is string => Boolean(name)),
        addedMember.name,
      ])
      queryClient.invalidateQueries({ queryKey: ['events'] })
    } else if (error) {
      setMutationError(`Could not add ${addedMember?.name ?? 'that person'}. ${error.message}`)
    }
    setSaving(null)
    setShowPicker(false)
  }

  return (
    <div className={cn('relative flex flex-wrap items-center gap-2', showPicker && 'z-popover')}>
      {mutationError && <p role="alert" className="w-full text-caption text-casa-error">{mutationError}</p>}
      {sorted.map((m) => {
        const isPrimary = m.role === 'primary'
        const isLoading = saving === m.id || saving === m.family_member?.id
        const color = m.family_member?.color_hex ?? 'var(--color-casa-muted)'
        return (
          <div
            key={m.id}
            className="group inline-flex min-h-control-sm items-center gap-1.5 rounded-pill py-1 pl-1 pr-2 text-body-sm font-semibold transition-opacity"
            style={{ background: S.chipFill, border: `1px solid ${S.borderSoft}`, color: S.navy, opacity: isLoading ? 0.6 : 1 }}
          >
            <span
              className="flex size-control-sm shrink-0 items-center justify-center rounded-pill text-caption font-bold text-white"
              style={{ backgroundColor: color }}
            >
              {m.family_member?.name?.[0]}
            </span>
            <span>{m.family_member?.name}</span>

            {/* Promote primary directly from the attendee pill (touch + desktop). */}
            {!isPrimary ? (
              <IconButton
                onClick={() => makeOwner(m.family_member!.id)}
                icon={<Crown size={14} />}
                variant="ghost"
                size="sm"
                className="ml-0.5"
                title={`Make ${m.family_member?.name ?? 'member'} primary`}
                aria-label={`Make ${m.family_member?.name ?? 'member'} primary`}
              />
            ) : (
              <span
                className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center"
                style={{ color: S.goldText, background: S.amberBg }}
                title="Primary attendee"
                aria-label="Primary attendee"
              >
                <Crown size={12} />
              </span>
            )}
            {(event.members.length > 1 || !isPrimary) && (
              <IconButton
                onClick={() => removeMember(m.id, m.family_member?.name ?? 'member')}
                icon={<X size={14} />}
                variant="ghost"
                size="sm"
                className="ml-0.5"
                title="Remove"
                aria-label={`Remove ${m.family_member?.name ?? 'member'}`}
              />
            )}
          </div>
        )
      })}

      {/* Add button */}
      <div className="relative" ref={pickerRef}>
        <Button
          onClick={() => setShowPicker(p => !p)}
          variant="secondary"
          size="sm"
          leadingIcon={<Plus size={14} />}
        >
          Add
        </Button>

        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute left-0 top-full z-popover mt-1.5 flex min-w-[180px] flex-col gap-1 rounded-card border bg-casa-surface p-2 shadow-modal"
              style={{ borderColor: S.borderSoft }}
            >
              {allMembers
                .filter(fm => !assignedIds.has(fm.id))
                .map(fm => (
                  <Button
                    key={fm.id}
                    onClick={() => addMember(fm.id)}
                    disabled={saving === fm.id}
                    variant="ghost"
                    size="sm"
                    fullWidth
                    className="justify-start"
                  >
                    <span
                      className="w-6 h-6 rounded-full text-white text-caption font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: fm.color_hex ?? 'var(--color-casa-muted)' }}
                    >
                      {fm.name?.[0]}
                    </span>
                    <span className="text-body-sm font-medium" style={{ color: S.navy }}>{fm.name}</span>
                  </Button>
                ))}
              {allMembers.filter(fm => !assignedIds.has(fm.id)).length === 0 && (
                <p className="text-caption px-2 py-1" style={{ color: S.label }}>Everyone's added</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Category quick-edit popover ───────────────────────────── */

function CategoryPicker({
  eventId,
  category,
  accent,
  dark = false,
}: {
  eventId: string
  category: string | null | undefined
  accent: string
  dark?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState(category)
  const containerRef = useRef<HTMLDivElement>(null)
  const save = useSaveEnrichmentBatch()
  const label = selectedCategory ? (CATEGORY_LABEL[selectedCategory] ?? selectedCategory) : 'Category'

  useEffect(() => setSelectedCategory(category), [category, eventId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => { document.removeEventListener('mousedown', handler); document.removeEventListener('touchstart', handler) }
  }, [open])

  const handleSelect = async (cat: string) => {
    if (saving) return
    const previousCategory = selectedCategory
    setSaving(true)
    setSaveError(null)
    setSelectedCategory(cat)
    try {
      await save.mutateAsync({ eventId, fields: { category: cat, category_locked: true } })
      setOpen(false)
    } catch (error) {
      setSelectedCategory(previousCategory)
      console.error('CategoryPicker: failed to save category', error)
      setSaveError('Could not save category. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <Chip
        size="sm"
        tone="accent"
        className="capitalize"
        style={dark
          ? { background: `color-mix(in srgb, ${accent} 28%, rgba(255,255,255,0.10))`, color: 'rgba(255,255,255,0.95)', letterSpacing: '0.04em', gap: '0.25rem', border: `1px solid color-mix(in srgb, ${accent} 40%, rgba(255,255,255,0.20))` }
          : { background: `color-mix(in srgb, ${accent} 14%, transparent)`, color: S.navy, letterSpacing: '0.04em', gap: '0.25rem' }
        }
        onClick={() => setOpen((wasOpen) => {
          if (!wasOpen) setSaveError(null)
          return !wasOpen
        })}
        aria-label={`Category: ${label}. Tap to change`}
        aria-expanded={open}
      >
        {saving ? <Loader2 size={12} className="animate-spin" /> : label}
        <ChevronDown size={11} className={cn('transition-transform duration-150', dark ? 'opacity-60' : 'opacity-50', open && 'rotate-180')} />
      </Chip>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ y: -4, scale: 0.97 }}
            animate={{ y: 0, scale: 1 }}
            exit={{ y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-[calc(100%+10px)] z-popover w-64 rounded-card border border-casa-border bg-casa-surface p-3 shadow-modal"
          >
            <p className="mb-2 text-caption font-semibold uppercase tracking-wide" style={{ color: S.muted }}>Change category</p>
            {saveError && <p role="alert" className="mb-2 text-caption text-casa-error">{saveError}</p>}
            <div className="flex flex-wrap gap-1.5">
              {ALL_CATEGORIES_FOR_PICKER.map(cat => (
                <Chip
                  key={cat}
                  size="sm"
                  selected={cat === selectedCategory}
                  onClick={() => void handleSelect(cat)}
                >
                  {CATEGORY_LABEL[cat]}
                </Chip>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ── Header ─────────────────────────────────────────────────── */

function PanelHeader({
  event,
  verified,
  modeOverride,
  onClose,
  onConfirmAddress,
  addressReviewLoading,
  addressSaveError,
  onRetryAddressSave,
  onSaveAddress,
  onRosterChange,
}: {
  event: EventWithDetails
  verified: boolean
  modeOverride: EventMode | null
  onClose: () => void
  onConfirmAddress: () => void
  addressReviewLoading: boolean
  addressSaveError: string | null
  onRetryAddressSave: () => void
  onSaveAddress: (place: TransportationPlace, scope: EventLocationScope) => Promise<void>
  onRosterChange: (names: string[]) => void
}) {
  const category = event.enrichment?.category
  const isBirthday = isBirthdayEvent(event)
  const accent = eventAccentColor(event)
  const primary = event.members?.find((m) => m.role === 'primary') ?? event.members?.[0]
  const eyebrow = primary?.family_member?.name
    ? `${primary.family_member.name}${event.members.length > 1 ? ` +${event.members.length - 1}` : ''}`
    : null
  const isRecurring = Boolean(event.rrule || event.recurrence_master_id)
  const reminder = event.event_type === 'reminder'
  const mode = modeOverride ?? inferEventMode(event)
  const planKind = inferEventPlanKind(event, mode)
  const hostedAtHome = mode === 'hosted'
  const displayStartDay = getEventDisplayStartDay(event)
  const headerWhen = event.all_day
    ? format(displayStartDay, 'EEE, MMM d')
    : format(new Date(event.start_time), 'EEE, MMM d · h:mm a')
  const headerDuration = event.all_day ? 'All day' : formatDuration(new Date(event.start_time), new Date(event.end_time))
  const cleanedTitle = cleanEventTitle(event.title ?? '').trim()
  const rawTitle = (event.title ?? '').trim()
  const displayTitle = cleanedTitle || rawTitle || (category ? (CATEGORY_LABEL[category] ?? category) : 'Event details')
  const avatarMembers = event.members?.slice(0, 5) ?? []
  const avatarOverflow = (event.members?.length ?? 0) - 5
  const attendeeCount = event.members?.length ?? 0
  const hasPeople = attendeeCount > 0
  const [rosterOpen, setRosterOpen] = useState(false)
  const [addressEditorOpen, setAddressEditorOpen] = useState(false)
  const [pendingPlace, setPendingPlace] = useState<TransportationPlace | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [addressEditError, setAddressEditError] = useState<string | null>(null)
  const [addressSaving, setAddressSaving] = useState(false)
  const peopleCountLabel = reminder ? `${attendeeCount} assigned` : `${attendeeCount} attending`
  const editPeopleLabel = reminder ? 'Edit people' : 'Edit attendees'
  const peopleSectionLabel = reminder ? 'Assigned people' : 'Attendees'
  const showAddressSummary = !reminder && (planKind === 'travel' || hostedAtHome || Boolean(event.location_name || event.address))
  const showLowerSection = (hasPeople && rosterOpen) || addressEditorOpen
  const recurring = Boolean(event.rrule || event.recurrence_master_id)

  const commitAddress = async (place: TransportationPlace, scope: EventLocationScope) => {
    setAddressEditError(null)
    setAddressSaving(true)
    try {
      await onSaveAddress(place, scope)
      setAddressEditorOpen(false)
      setPendingPlace(null)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Could not update this address.'
      setAddressEditError(message)
    } finally {
      setAddressSaving(false)
    }
  }

  const requestAddressSave = async (place: TransportationPlace) => {
    if (recurring) {
      setPendingPlace(place)
      setScopeOpen(true)
      return
    }
    await commitAddress(place, 'this')
  }

  return (
    <div>
      {/* ── Navy editorial crown ───────────────────────────────── */}
      <div
        className="relative overflow-visible px-6 pt-4 pb-5"
        style={eventCrownStyle(event, 'body')}
      >
        {isBirthday && <BirthdayCardDecoration className="opacity-60" />}

        {/* Bottom fade — softens the cut to the white attendee strip */}
        <div
          className="pointer-events-none absolute bottom-0 inset-x-0 h-5"
          style={{ background: isBirthday ? undefined : 'linear-gradient(to bottom, transparent, rgba(0,0,0,0.18))' }}
        />

        {/* Top row: owner + compact avatars + close */}
        <div className="relative z-10 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {eyebrow && (
              <span
                className="text-caption font-bold uppercase tracking-widest truncate"
                style={{ color: isBirthday ? S.eyebrow : 'rgba(255,255,255,0.55)' }}
              >
                {eyebrow}
              </span>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center -space-x-1.5">
              {avatarMembers.map((m) => (
                <span
                  key={m.id}
                  title={m.family_member?.name}
                  className={cn('flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-bold text-white ring-[2px]', isBirthday ? 'ring-white' : 'ring-casa-navy')}
                  style={{ backgroundColor: m.family_member?.color_hex ?? 'var(--color-casa-muted)' }}
                >
                  {m.family_member?.name?.[0]}
                </span>
              ))}
              {avatarOverflow > 0 && (
                <span
                  className="ring-casa-navy flex size-6 shrink-0 items-center justify-center rounded-full text-caption font-bold ring-[2px]"
                  style={{ background: 'rgba(255,255,255,0.18)', color: 'rgba(255,255,255,0.85)' }}
                >
                  +{avatarOverflow}
                </span>
              )}
            </div>
            <IconButton
              onClick={onClose}
              icon={<X size={18} />}
              aria-label="Close event details"
              variant="ghost"
              size="sm"
              className={cn(!isBirthday && 'text-white/70 hover:text-white hover:bg-white/10')}
            />
          </div>
        </div>

        {/* Title hero */}
        <h2 className={cn('event-command-center-title relative z-10 mt-2 font-bold leading-tight', isBirthday ? 'text-casa-navy' : 'casa-heading-on-dark')}>
          {isBirthday && <span className="mr-1.5" aria-hidden="true">🎉</span>}
          {displayTitle}
        </h2>

        {/* Meta line: category + date + duration */}
        <div className="relative z-10 mt-2 flex flex-wrap items-center gap-2 text-body-sm">
          {reminder && (
            <Chip
              size="sm"
              className="uppercase"
              style={{
                letterSpacing: '0.06em',
                background: isBirthday ? S.chipFill : 'rgba(255,255,255,0.10)',
                color: isBirthday ? S.navy : 'rgba(255,255,255,0.88)',
                border: `1px solid ${isBirthday ? S.borderMed : 'rgba(255,255,255,0.18)'}`,
              }}
            >
              <Bell size={12} aria-hidden="true" />
              Reminder
            </Chip>
          )}
          <CategoryPicker eventId={event.id} category={category} accent={accent} dark={!isBirthday} />
          <span className={cn('font-semibold', isBirthday ? '' : '')} style={{ color: isBirthday ? S.navy : S.planLabel }}>
            {headerWhen}
          </span>
          <span style={{ color: isBirthday ? S.muted : 'rgba(255,255,255,0.35)' }}>·</span>
          <span style={{ color: isBirthday ? S.muted : 'rgba(255,255,255,0.55)' }}>{headerDuration}</span>
          {isRecurring && (
            <>
              <span style={{ color: isBirthday ? S.muted : 'rgba(255,255,255,0.35)' }}>·</span>
              <span className="text-caption font-semibold" style={{ color: isBirthday ? S.muted : 'rgba(255,255,255,0.55)' }}>Repeats</span>
            </>
          )}
        </div>

        {(hasPeople || showAddressSummary) && (
          <div className="relative mt-3">
            {showAddressSummary ? (
              <AddressReviewSummary
                locationName={event.location_name}
                address={event.address}
                reviewed={verified}
                atHome={hostedAtHome}
                loading={addressReviewLoading}
                birthday={isBirthday}
                saveError={addressSaveError}
                onConfirm={onConfirmAddress}
                onEdit={() => {
                  setAddressEditError(null)
                  setAddressEditorOpen((open) => !open)
                }}
                peopleActionLabel={hasPeople ? (rosterOpen ? 'Done editing' : editPeopleLabel) : undefined}
                onPeopleAction={hasPeople ? () => setRosterOpen((open) => !open) : undefined}
                onRetry={onRetryAddressSave}
              />
            ) : (
              <div className="flex items-center gap-2">
              <Chip
                size="sm"
                className="uppercase"
                style={{
                  letterSpacing: '0.06em',
                  background: 'rgba(255,255,255,0.10)',
                  color: 'rgba(255,255,255,0.82)',
                  border: '1px solid rgba(255,255,255,0.18)',
                }}
              >
                {peopleCountLabel}
              </Chip>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-white/80 hover:text-white hover:bg-white/10"
                  onClick={() => setRosterOpen((open) => !open)}
                >
                  {rosterOpen ? 'Done editing' : editPeopleLabel}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── White strip: attendee editor + destination ─────────── */}
      {showLowerSection && (
        <div style={{ borderBottom: `1px solid ${S.borderSoft}` }}>
          {hasPeople && rosterOpen && (
            <div className="px-6 pt-3 pb-3">
              <div className="mb-2 text-caption font-bold uppercase tracking-wide" style={{ color: S.label }}>
                {peopleSectionLabel}
              </div>
              <MemberEditor event={event} onRosterChange={onRosterChange} />
            </div>
          )}
          {addressEditorOpen && (
            <div className="px-6 py-4">
              <InlinePlaceEditor
                value={{
                  name: event.location_name?.trim() || event.address?.trim() || '',
                  address: event.address?.trim() || '',
                  kind: 'event',
                }}
                ariaLabel="Event location"
                requireAddress={planKind === 'travel'}
                editorOnly
                busy={addressSaving}
                onCancel={() => {
                  setAddressEditorOpen(false)
                  setAddressEditError(null)
                }}
                onConfirm={requestAddressSave}
              />
              {addressEditError && (
                <p role="alert" className="mt-2 text-caption text-casa-error">{addressEditError}</p>
              )}
            </div>
          )}
        </div>
      )}
      <RecurrenceScopeDialog
        open={scopeOpen}
        title="Change recurring event location"
        onClose={() => {
          setScopeOpen(false)
          setPendingPlace(null)
        }}
        onSelect={(scope) => {
          const place = pendingPlace
          setScopeOpen(false)
          if (place) void commitAddress(place, scope)
        }}
      />
    </div>
  )
}


/* ── Body: block-engine command center ─────────────────────── */

function PanelBody({
  event,
  modeOverride,
  waitsOverride,
  driverOverrides,
  twoDriverConfirmed,
  transportationPlan,
  onSetWaitsOverride,
  onSetDriverOverride,
  onSetModeOverride,
  onSetTwoDriverConfirmed,
  onSetTransportationPlan,
}: {
  event: EventWithDetails
  modeOverride: EventMode | null
  waitsOverride: boolean | null
  driverOverrides: Record<number, string>
  twoDriverConfirmed: boolean
  transportationPlan: EventTransportationPlan | null
  onSetWaitsOverride: (value: boolean | null) => void
  onSetDriverOverride: (legIndex: number, driverId: string) => void
  onSetModeOverride: (mode: EventMode | null) => void
  onSetTwoDriverConfirmed: (value: boolean) => void
  onSetTransportationPlan: (plan: EventTransportationPlan | null) => void
}) {
  return (
    <StandardPanelBody
      event={event}
      modeOverride={modeOverride}
      waitsOverride={waitsOverride}
      driverOverrides={driverOverrides}
      twoDriverConfirmed={twoDriverConfirmed}
      transportationPlan={transportationPlan}
      onSetWaitsOverride={onSetWaitsOverride}
      onSetDriverOverride={onSetDriverOverride}
      onSetModeOverride={onSetModeOverride}
      onSetTwoDriverConfirmed={onSetTwoDriverConfirmed}
      onSetTransportationPlan={onSetTransportationPlan}
    />
  )
}


function StandardPanelBody({
  event,
  modeOverride,
  waitsOverride,
  driverOverrides,
  twoDriverConfirmed,
  transportationPlan,
  onSetWaitsOverride,
  onSetDriverOverride,
  onSetModeOverride,
  onSetTwoDriverConfirmed,
  onSetTransportationPlan,
}: {
  event: EventWithDetails
  modeOverride: EventMode | null
  waitsOverride: boolean | null
  driverOverrides: Record<number, string>
  twoDriverConfirmed: boolean
  transportationPlan: EventTransportationPlan | null
  onSetWaitsOverride: (value: boolean | null) => void
  onSetDriverOverride: (legIndex: number, driverId: string) => void
  onSetModeOverride: (mode: EventMode | null) => void
  onSetTwoDriverConfirmed: (value: boolean) => void
  onSetTransportationPlan: (plan: EventTransportationPlan | null) => void
}) {
  const enr = event.enrichment
  const reminder = event.event_type === 'reminder'
  const mode = modeOverride ?? inferEventMode(event)
  const planKind = inferEventPlanKind(event, mode)
  const hasDestination = Boolean(event.location_name || event.address)
  const showLocation = hasDestination || mode === 'hosted'
  const showSuggestedTravel = planKind === 'travel' && !transportationPlan
  const hasChecklist = event.checklist?.length > 0
  const activeFields = getFieldsForCategory(enr?.category)
  const shows = (field: string) => activeFields.includes(field as ReturnType<typeof getFieldsForCategory>[number])
  const hasText = (value: unknown) => {
    if (typeof value === 'string') return value.trim() !== ''
    return value !== null && value !== undefined
  }
  const { data: household = [] } = useFamilyMembers()
  const { data: homeConfig } = useQuery({
    queryKey: ['home-config'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      if (error) throw error
      return (data?.value ?? null) as { address?: string; city?: string; state?: string; zip?: string } | null
    },
  })
  const homeAddress = [homeConfig?.address, homeConfig?.city, homeConfig?.state, homeConfig?.zip].filter(Boolean).join(', ').trim()
  const { data: dayEvents = [] } = useTodayEvents(getEventDisplayStartDay(event))
  const availability = useMemberAvailability(household.map((member) => member.id))

  const commuteDestination = event.address ?? event.location_name ?? null
  const msUntilStart = new Date(event.start_time).getTime() - Date.now()
  const etaRefetchIntervalMs =
    !commuteDestination
      ? false
      : msUntilStart <= 90 * 60_000
        ? 60_000
        : msUntilStart <= 6 * 60 * 60_000
          ? 5 * 60_000
          : false
  const commuteQuery = useTravelEta({
    destination: commuteDestination,
    eventStartIso: event.start_time,
    enabled: !reminder && showSuggestedTravel && Boolean(commuteDestination),
    bufferMins: 10,
    refetchIntervalMs: etaRefetchIntervalMs,
  })
  const routeReady = commuteQuery.data?.found === true
  const liveWeatherQuery = useQuery({
    queryKey: ['event-weather', event.id, commuteDestination],
    enabled: !reminder && showLocation && Boolean(commuteDestination),
    staleTime: 15 * 60_000,
    refetchInterval: etaRefetchIntervalMs,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fetch-event-weather', {
        body: { event_id: event.id },
      })
      if (error) throw error
      return data as { ok?: boolean; weather?: string; skipped?: string }
    },
  })
  let weatherAtVenue = enr?.weather_at_event ?? enr?.weather_summary
  if (liveWeatherQuery.data?.ok && liveWeatherQuery.data.weather) {
    weatherAtVenue = liveWeatherQuery.data.weather
  }
  const plan = reminder ? null : derivePlan(event, mode, {
    household,
    eta: routeReady ? commuteQuery.data : null,
    verified: routeReady,
  })
  const eventStartMs = new Date(event.start_time).getTime()
  const parsedEventEndMs = new Date(event.end_time).getTime()
  const eventEndMs = Number.isNaN(parsedEventEndMs) ? eventStartMs + (60 * 60 * 1000) : parsedEventEndMs
  const driveWindowStartIso = (routeReady
    ? (commuteQuery.data?.leave_by ?? enr?.departure_time)
    : enr?.departure_time) ?? event.start_time
  const driveWindowStart = new Date(driveWindowStartIso)
  const driveWindowEnd = new Date(eventEndMs)
  const rulesByMember = indexAvailabilityRulesByMember(availability.rules)
  const exceptionsByMember = indexAvailabilityExceptionsByMember(availability.exceptions)
  const transportAvailabilityByMember = new Map<string, ReturnType<typeof evaluateMemberAvailabilityForWindow>>()
  const presenceAvailabilityByMember = new Map<string, ReturnType<typeof evaluateMemberAvailabilityForWindow>>()
  const overlappingByMember = new Map<string, { title: string }>()
  for (const other of dayEvents) {
    if (other.id === event.id) continue
    const otherStart = new Date(other.start_time).getTime()
    const otherEnd = new Date(other.end_time).getTime()
    if (!(otherStart < eventEndMs && otherEnd > eventStartMs)) continue
    for (const membership of other.members) {
      const memberId = membership.family_member?.id
      if (!memberId || overlappingByMember.has(memberId)) continue
      overlappingByMember.set(memberId, { title: other.title })
    }
  }
  const adultCanDrive = (member: { role: string; can_drive?: boolean | null }) => {
    if (member.role === 'child') return false
    return member.can_drive ?? (member.role === 'parent' || member.role === 'caregiver')
  }
  for (const member of household) {
    transportAvailabilityByMember.set(
      member.id,
      evaluateMemberAvailabilityForWindow(
        member,
        driveWindowStart,
        driveWindowEnd,
        rulesByMember.get(member.id) ?? [],
        exceptionsByMember.get(member.id) ?? [],
      ),
    )
    presenceAvailabilityByMember.set(
      member.id,
      evaluateMemberAvailabilityForWindow(
        member,
        driveWindowStart,
        driveWindowEnd,
        rulesByMember.get(member.id) ?? [],
        exceptionsByMember.get(member.id) ?? [],
        { requireCanDrive: false },
      ),
    )
  }
  const attendeePool = eventAttendees(event).filter((person) => {
    const householdMatch = household.find((member) => member.id === person.id)
    if (!householdMatch) return true
    return adultCanDrive(householdMatch)
  })
  const householdDriverPool = household
    .filter((m) => (m.role === 'parent' || m.role === 'caregiver') && adultCanDrive(m))
    .map((m) => ({
      id: m.id,
      name: m.name,
      initial: m.name?.[0]?.toUpperCase() ?? '?',
      color: m.color_hex ?? 'var(--color-casa-muted)',
      conflictWith: overlappingByMember.get(m.id)?.title
        ?? (transportAvailabilityByMember.get(m.id)?.available ? null : transportAvailabilityByMember.get(m.id)?.reason ?? 'Unavailable'),
    }))
  const driverPool = [...attendeePool, ...householdDriverPool].reduce<Array<{ id: string; name: string; initial: string; color: string; conflictWith?: string | null }>>((acc, p) => {
    if (!acc.some((x) => x.id === p.id)) acc.push(p)
    return acc
  }, []).map((driver) => ({
    ...driver,
    conflictWith: driver.conflictWith
      ?? overlappingByMember.get(driver.id)?.title
      ?? (transportAvailabilityByMember.get(driver.id)?.available ? null : transportAvailabilityByMember.get(driver.id)?.reason ?? 'Unavailable'),
  }))
  const attendeeIds = new Set(event.members.map((m) => m.family_member?.id).filter(Boolean))
  const remainingHousehold = household.filter((m) => !attendeeIds.has(m.id))
  const availableAdults = remainingHousehold.filter((m) => {
    if (!(m.role === 'parent' || m.role === 'caregiver') || !adultCanDrive(m)) return false
    if (overlappingByMember.has(m.id)) return false
    return transportAvailabilityByMember.get(m.id)?.available ?? true
  }).length
  const coverageRows = remainingHousehold
    .map((m) => {
      const presence = presenceAvailabilityByMember.get(m.id)
      const childNeedsCoverage = (
        m.role === 'child'
        && !overlappingByMember.has(m.id)
        && (presence?.available ?? true)
      )

      return {
        id: m.id,
        name: m.name,
        initial: m.name?.[0]?.toUpperCase() ?? '?',
        color: m.color_hex ?? 'var(--color-casa-muted)',
        status: overlappingByMember.get(m.id)?.title
          ? `At ${overlappingByMember.get(m.id)?.title}`
          : !(presence?.available ?? true)
            ? (presence?.reason ?? 'Unavailable')
            : presence?.softUnavailable
              ? `${presence?.reason ?? 'Blocked hours'} (flex)`
              : m.role === 'child'
                ? (availableAdults > 0 ? 'Home with family' : 'No coverage assigned')
                : 'Available at home',
        ok: overlappingByMember.has(m.id) || !childNeedsCoverage || availableAdults > 0,
      }
    })
  const caregiversAway = event.members.some((m) => {
    const role = m.family_member?.role
    return role === 'parent' || role === 'caregiver'
  })
  const showMeanwhile = planKind === 'travel' && caregiversAway && coverageRows.length > 0

  return (
    <div className="event-command-center-content p-6 space-y-5">
      {/* ── The Plan ── */}
      {plan && (
        <section>
          {plan.kind === 'travel' && !transportationPlan ? (
            <PlanBlock
              plan={plan}
              loading={commuteQuery.isLoading && !commuteQuery.data}
              driverPool={driverPool}
              waitsOverride={waitsOverride}
              driverOverrides={driverOverrides}
              modeOverride={modeOverride}
              twoDriverConfirmed={twoDriverConfirmed}
              onSetWaitsOverride={onSetWaitsOverride}
              onSetDriverOverride={(legIndex, driverId) => {
                const changedLeg = plan.legs[legIndex]
                const isOutbound = changedLeg?.kind === 'drop' || changedLeg?.kind === 'depart'
                if (isOutbound) {
                  const cascadeUpdates: Record<number, string> = { [legIndex]: driverId }
                  plan.legs.forEach((leg, i) => {
                    if (i === legIndex) return
                    const isDownstream = leg.kind === 'stay' || leg.kind === 'return' || leg.kind === 'pickup'
                    if (isDownstream && leg.driver && !driverOverrides[i]) {
                      cascadeUpdates[i] = driverId
                    }
                  })
                  Object.entries(cascadeUpdates).forEach(([idx, id]) =>
                    onSetDriverOverride(Number(idx), id)
                  )
                } else {
                  onSetDriverOverride(legIndex, driverId)
                }
              }}
              onSetModeOverride={onSetModeOverride}
              onSetTwoDriverConfirmed={onSetTwoDriverConfirmed}
              onCustomizePlan={() => {
                const defaultDriver = household.find((member) =>
                  member.can_drive && (member.role === 'parent' || member.role === 'caregiver')
                )
                onSetTransportationPlan(createDefaultTransportationPlan(event, homeAddress, defaultDriver))
              }}
            />
          ) : (
            <NonTravelEventBlock event={event} plan={plan} hasTransportation={Boolean(transportationPlan)} />
          )}
        </section>
      )}

      {!reminder && (transportationPlan || planKind !== 'travel') && (
        <EventTransportationSection
          event={event}
          plan={transportationPlan}
          onChange={onSetTransportationPlan}
          suggestedPlan={planKind === 'travel' && !transportationPlan}
        />
      )}

      {!reminder && hasDestination && showSuggestedTravel && (
        <DepartureRiskBanner event={event} travelEta={routeReady ? commuteQuery.data : null} />
      )}

      {/* ── Where (map + weather + verify state) ── */}
      {!reminder && showLocation && (
        <section>
          <SectionLabel>{mode === 'trip' ? 'Destination' : 'Where'}</SectionLabel>
          <LocationBlock
            eventId={event.id}
            locationName={event.location_name}
            address={event.address}
            lat={event.lat}
            lng={event.lng}
            parkingNotes={shows('parking_notes') || hasText(enr?.parking_notes) ? enr?.parking_notes : null}
            contactPhone={shows('contact_phone') || hasText(enr?.contact_phone) ? enr?.contact_phone : null}
            weatherAtVenue={weatherAtVenue}
            mode={mode}
            transportationNeeded={Boolean(transportationPlan) || planKind === 'travel'}
            accent={eventAccentColor(event)}
          />
        </section>
      )}

      {/* ── Bring / Pack ── */}
      {hasChecklist && (
        <section>
          <SectionLabel>{mode === 'trip' ? 'Pack' : 'Bring'}</SectionLabel>
          <ChecklistSection items={event.checklist} eventId={event.id} />
        </section>
      )}

      {!hasChecklist && enr?.what_to_bring && enr.what_to_bring.length > 0 && (
        <section>
          <SectionLabel>{mode === 'trip' ? 'Pack' : 'Bring'}</SectionLabel>
          <FallbackBringChecklist eventId={event.id} items={enr.what_to_bring} />
        </section>
      )}

      {showMeanwhile && (
        <section>
          <SectionLabel>Meanwhile, the rest of the family · {format(new Date(event.start_time), 'h:mm a')}–{format(new Date(event.end_time), 'h:mm a')}</SectionLabel>
          <div className="rounded-[14px] px-4 py-1.5" style={{ background: S.coverFill }}>
            {coverageRows.map((row, i) => (
              <div key={row.id} className="flex items-center gap-3 py-2.5" style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}>
                <span className="w-[30px] h-[30px] rounded-full text-white text-caption font-bold inline-flex items-center justify-center" style={{ background: row.color }}>
                  {row.initial}
                </span>
                <span className="flex-1 text-body-sm font-semibold" style={{ color: S.navy }}>{row.name}</span>
                <span className="text-body-sm" style={{ color: S.muted }}>{row.status}</span>
                <span className="text-body-sm" style={{ color: row.ok ? S.green : S.goldText }}>{row.ok ? '✓' : '•'}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ── Reference (collapsible: contact, cost, notes, dietary, outfit) ── */}
      <ReferenceBlock
        enr={enr}
        hasText={hasText}
        actions={event.actions ?? []}
        logistics={event.logistics ?? []}
      />

    </div>
  )
}

/* ── Command Center blocks ──────────────────────────────────── */

function NonTravelEventBlock({ event, plan, hasTransportation }: {
  event: EventWithDetails
  plan: PlanModel
  hasTransportation: boolean
}) {
  const birthday = isBirthdayEvent(event)
  const hasLocation = Boolean(event.location_name || event.address)
  const content = {
    at_home: {
      title: birthday ? 'Birthday at home' : 'Happening at home',
      description: 'Everyone is already where they need to be. No driving plan is needed.',
      icon: <House size={20} />,
    },
    coverage: {
      title: hasLocation ? 'Care coverage' : 'At-home coverage',
      description: hasLocation
        ? hasTransportation
          ? 'The care location and transportation plan are listed below.'
          : 'The care location is listed below. Add transportation only when a pickup, drop-off, or return needs coordination.'
        : 'No driving is needed. Attendees and event notes are the source of truth for coverage.',
      icon: <Users size={20} />,
    },
    remote: {
      title: 'Remote event',
      description: 'No drive time is needed. Use the meeting details or event notes to join.',
      icon: <Video size={20} />,
    },
    details: {
      title: birthday ? 'Birthday at home' : 'Event details',
      description: birthday
        ? 'A celebration placeholder with no transportation plan.'
        : hasLocation
          ? 'The location is listed below. No driving logistics are attached to this event.'
          : 'No location or transportation plan is attached to this event.',
      icon: <CalendarDays size={20} />,
    },
    travel: null,
  }[plan.kind]

  if (!content) return null

  return (
    <Card padding="md" className="flex items-start gap-4 border-casa-border bg-casa-bg shadow-none">
      <span className="flex size-control shrink-0 items-center justify-center rounded-button bg-casa-surface text-casa-gold shadow-card">
        {content.icon}
      </span>
      <div className="min-w-0">
        <p className="text-caption font-bold uppercase tracking-wide text-casa-muted">Event overview</p>
        <h3 className="mt-1 font-display text-body-lg font-semibold text-casa-navy">{content.title}</h3>
        {plan.headline && <p className="mt-1 text-body-sm font-semibold text-casa-text">{plan.headline}</p>}
        <p className="mt-2 text-body-sm text-casa-muted">{content.description}</p>
      </div>
    </Card>
  )
}

function TrafficBadge({ deltaMin }: { deltaMin: number | null | undefined }) {
  const pill = trafficPill(deltaMin)
  if (!pill) return null
  const tone =
    pill.tone === 'clear' ? { bg: S.greenBg, fg: S.green }
    : pill.tone === 'light' ? { bg: S.amberBg, fg: S.goldText }
    : { bg: S.redBg, fg: S.red }
  return (
    <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-caption font-bold" style={{ background: tone.bg, color: tone.fg }}>
      {pill.label}
    </span>
  )
}

function DriverChip({
  driver,
  options,
  onSelectDriver,
}: {
  driver: { id: string; name: string; initial: string; color: string } | null | undefined
  options: Array<{ id: string; name: string; initial: string; color: string; conflictWith?: string | null }>
  onSelectDriver?: (driverId: string) => void
}) {
  const [open, setOpen] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (evt: MouseEvent | TouchEvent) => {
      if (!pickerRef.current || pickerRef.current.contains(evt.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  if (!driver) return null
  const sortedOptions = [...options].sort((a, b) => {
    const aSelected = a.id === driver.id
    const bSelected = b.id === driver.id
    if (aSelected !== bSelected) return aSelected ? -1 : 1
    const aBusy = Boolean(a.conflictWith && !aSelected)
    const bBusy = Boolean(b.conflictWith && !bSelected)
    if (aBusy !== bBusy) return aBusy ? 1 : -1
    return a.name.localeCompare(b.name)
  })
  return (
    <div className={cn('relative shrink-0', open ? 'z-popover' : 'z-10')} ref={pickerRef}>
      <Button
        onClick={() => setOpen((prev) => !prev)}
        variant="secondary"
        size="sm"
        className="rounded-pill border-dashed"
      >
        <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-caption font-bold" style={{ backgroundColor: driver.color }}>
          {driver.initial}
        </span>
        {driver.name}
        <ChevronRight size={13} className={cn('ml-0.5 transition-transform', open && 'rotate-90')} />
      </Button>
      <AnimatePresence>
        {open && options.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-[calc(100%+6px)] z-popover max-h-[min(50vh,280px)] min-w-[230px] overflow-y-auto overscroll-contain rounded-card border bg-casa-surface p-1.5 shadow-modal"
            style={{ borderColor: S.borderSoft }}
          >
            {sortedOptions.map((option) => {
              const selected = option.id === driver.id
              return (
                <Button
                  key={option.id}
                  onClick={() => {
                    if (option.conflictWith && option.id !== driver.id) {
                      const ok = window.confirm(`${option.name} is already assigned to "${option.conflictWith}" during this time. Assign anyway?`)
                      if (!ok) return
                    }
                    onSelectDriver?.(option.id)
                    setOpen(false)
                  }}
                  variant="ghost"
                  size="sm"
                  fullWidth
                  className="rounded-lg px-2.5 py-1.5 text-left"
                  contentClassName="w-full justify-start"
                  style={selected ? { background: S.coverFill } : option.conflictWith ? { background: S.amberBg } : undefined}
                >
                  <span className="w-6 h-6 rounded-full text-white text-caption font-bold inline-flex items-center justify-center" style={{ background: option.color }}>
                    {option.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-body-sm font-semibold" style={{ color: S.navy }}>{option.name}</span>
                    {option.conflictWith && !selected && (
                      <span className="block truncate text-caption" style={{ color: S.goldText }}>
                        Busy: {option.conflictWith}
                      </span>
                    )}
                  </span>
                  {option.conflictWith && !selected && (
                    <span className="text-caption font-bold uppercase" style={{ color: S.goldText, letterSpacing: '0.06em' }}>Busy</span>
                  )}
                  {selected && <Check size={14} style={{ color: S.green }} />}
                </Button>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PlanBlock({
  plan,
  loading,
  driverPool,
  waitsOverride,
  driverOverrides,
  modeOverride,
  twoDriverConfirmed,
  onSetWaitsOverride,
  onSetDriverOverride,
  onSetModeOverride,
  onSetTwoDriverConfirmed,
  onCustomizePlan,
}: {
  plan: PlanModel
  loading?: boolean
  driverPool: Array<{ id: string; name: string; initial: string; color: string; conflictWith?: string | null }>
  waitsOverride: boolean | null
  driverOverrides: Record<number, string>
  modeOverride: EventMode | null
  twoDriverConfirmed: boolean
  onSetWaitsOverride: (value: boolean | null) => void
  onSetDriverOverride: (legIndex: number, driverId: string) => void
  onSetModeOverride: (mode: EventMode | null) => void
  onSetTwoDriverConfirmed: (value: boolean) => void
  onCustomizePlan: () => void
}) {
  const withDriverOverrides = plan.legs.map((leg, i) => {
    const overrideDriverId = driverOverrides[i]
    if (!overrideDriverId || !leg.driver) return leg
    const overrideDriver = driverPool.find((d) => d.id === overrideDriverId)
    return overrideDriver ? { ...leg, driver: overrideDriver } : leg
  })

  const waits = waitsOverride ?? Boolean(withDriverOverrides.find((l) => l.kind === 'stay')?.waits)
  const effectiveLegs = withDriverOverrides.map((leg) => {
    if (leg.kind !== 'stay' || plan.mode !== 'appointment') return leg
    if (!waits) {
      const fallback = leg.title.includes('waits on site') ? 'At appointment' : leg.title
      return { ...leg, waits: false, title: fallback }
    }
    const driveLeg = withDriverOverrides.find((l) => l.kind === 'drop' || l.kind === 'depart')
    return { ...leg, waits: true, title: `${driveLeg?.driver?.name ?? 'Driver'} waits on site` }
  })

  const hostedRecipient = deriveHostedRecipientName(withDriverOverrides)
  const renderedLegs = applyAssignmentNarrative(plan.mode, effectiveLegs, hostedRecipient)
  const effective = derivePlanPresentation(plan.mode, renderedLegs, hostedRecipient)
  useEffect(() => {
    if (!effective.twoDrivers && twoDriverConfirmed) onSetTwoDriverConfirmed(false)
  }, [effective.twoDrivers, twoDriverConfirmed, onSetTwoDriverConfirmed])

  const legDot = (kind: string) =>
    kind === 'drop' || kind === 'depart' ? { color: S.navy, halo: 'color-mix(in srgb, var(--color-casa-navy) 12%, transparent)' }
    : kind === 'stay' || kind === 'host' ? { color: S.gold, halo: 'color-mix(in srgb, var(--color-casa-gold) 18%, transparent)' }
    : { color: S.green, halo: 'color-mix(in srgb, var(--color-casa-success) 15%, transparent)' }
  const [modeMenuOpen, setModeMenuOpen] = useState(false)
  const modePickerRef = useRef<HTMLDivElement | null>(null)
  const selectedMode = modeOverride ?? 'auto'

  useEffect(() => {
    if (!modeMenuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!modePickerRef.current?.contains(event.target as Node)) setModeMenuOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setModeMenuOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [modeMenuOpen])

  return (
    <div className="relative rounded-2xl overflow-visible" style={{ border: `1px solid ${S.borderMed}` }}>
      <div className="rounded-t-2xl px-[18px] py-3.5 flex items-center justify-between gap-2" style={{ background: S.navy }}>
        <div className="min-w-0">
          <p className="text-caption font-bold uppercase" style={{ color: S.planLabel, letterSpacing: '0.12em' }}>The Plan</p>
          {plan.headline && <p className="mt-0.5 truncate font-display text-body-lg font-semibold text-casa-surface">{plan.headline}</p>}
        </div>
        <div ref={modePickerRef} className="relative shrink-0">
          <Button
            onClick={() => setModeMenuOpen((open) => !open)}
            variant="ghost"
            size="sm"
            className="rounded-pill bg-white/10 px-2.5 text-caption font-bold text-white hover:bg-white/20 hover:text-white"
            aria-expanded={modeMenuOpen}
            aria-haspopup="dialog"
            aria-label="Open mode options"
          >
            {effective.pattern}
            <span className="text-caption font-bold rounded-pill px-1.5 py-px" style={{ color: 'var(--color-casa-text)', background: S.goldBadge }}>
              {modeOverride ? 'MANUAL' : 'AUTO'}
            </span>
            <ChevronRight size={12} className={cn('transition-transform', modeMenuOpen && 'rotate-90')} />
          </Button>
          {modeMenuOpen && (
            <div
              role="dialog"
              aria-label="Mode options"
              className="absolute right-0 top-[calc(100%+8px)] z-20 w-[320px] max-w-[calc(100vw-48px)] rounded-xl p-3"
              style={{ background: 'var(--color-casa-surface)', border: `1px solid ${S.borderMed}`, boxShadow: '0 18px 34px rgba(27,42,74,0.18)' }}
            >
              <p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.08em' }}>
                Mode
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MODE_OVERRIDE_OPTIONS.map((option) => {
                  const selected = selectedMode === option.value
                  return (
                    <Button
                      key={option.value}
                      variant={selected ? 'strong' : 'secondary'}
                      size="sm"
                      className="rounded-pill px-3 text-caption font-bold"
                      onClick={() => {
                        onSetModeOverride(option.value === 'auto' ? null : option.value)
                        setModeMenuOpen(false)
                      }}
                      aria-pressed={selected}
                    >
                      {option.label}
                      {option.helper && (
                        <span
                          className="rounded-pill px-1.5 py-px text-caption font-bold uppercase"
                          style={selected
                            ? { background: 'rgba(255,255,255,0.18)', color: 'var(--color-casa-surface)' }
                            : { background: S.goldBadge, color: 'var(--color-casa-text)' }}
                        >
                          {option.helper}
                        </span>
                      )}
                    </Button>
                  )
                })}
              </div>
              {!modeOverride && (
                <p className="mt-2 text-caption" style={{ color: S.muted }}>
                  Auto is active and should improve as Casa learns your routines.
                </p>
              )}
              {modeOverride && (
                <p className="mt-2 text-caption" style={{ color: S.goldText }}>
                  Manual mode override is active.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-[18px] pt-2 text-caption" style={{ color: S.label }}>Tap a driver to reassign →</div>
      <div className="px-[18px] pb-2">
        <ol>
          {renderedLegs.map((leg, i) => {
            const driverId = leg.driver?.id
            return (
              <li key={i} className="flex items-center gap-3.5 py-3" style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}>
                <span className="flex-none w-3 h-3 rounded-full" style={{ background: legDot(leg.kind).color, boxShadow: `0 0 0 4px ${legDot(leg.kind).halo}` }} />
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-body-sm font-bold leading-tight" style={{ color: S.navy }}>{leg.title}</p>
                    {leg.detail && <p className="text-caption mt-0.5" style={{ color: S.muted }}>{leg.detail}</p>}
                    {leg.trafficDeltaMin != null && (
                      <div className="mt-1"><TrafficBadge deltaMin={leg.trafficDeltaMin} /></div>
                    )}
                  </div>
                  <DriverChip
                    driver={leg.driver}
                    options={driverPool}
                    onSelectDriver={driverId ? (nextDriverId) => onSetDriverOverride(i, nextDriverId) : undefined}
                  />
                </div>
              </li>
            )
          })}
        </ol>

        {loading && (
          <p className="text-caption mt-2 flex items-center gap-1.5" style={{ color: S.label }}>
            <Loader2 size={12} className="animate-spin" /> Calculating drive times…
          </p>
        )}

        {renderedLegs.some((l) => l.estimate) && (
          <div className="mt-3 rounded-lg px-3 py-2.5 text-caption" style={{ color: S.goldText, background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            ⚠ Drive times are <strong>estimates</strong> until you confirm the address above.
          </div>
        )}

        {plan.mode === 'appointment' && renderedLegs.some((l) => l.kind === 'stay') && (
          <Switch
            checked={waits}
            onCheckedChange={onSetWaitsOverride}
            label="Someone waits on site"
            className="mt-3 rounded-button border border-casa-border bg-casa-bg px-3"
          />
        )}

        {effective.twoDrivers && (
          <div className="mt-3 rounded-lg px-3 py-2.5 text-caption flex items-center gap-2" style={{ color: S.goldText, background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            <strong>Two drivers</strong> — {twoDriverConfirmed ? 'assignments locked in.' : 'both need to be locked in.'}
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto min-h-0 p-0 font-bold underline hover:bg-transparent"
              onClick={() => onSetTwoDriverConfirmed(true)}
            >
              {twoDriverConfirmed ? 'Locked' : 'Confirm'}
            </Button>
          </div>
        )}

        {effective.yourTime && (
          <div className="mt-3 rounded-lg px-3 py-2" style={{ background: S.yourTimeFill }}>
            <p className="text-body-sm" style={{ color: S.navy }}>
              <span className="font-bold">Your time:</span> {effective.yourTime}
            </p>
          </div>
        )}
        <Button variant="secondary" size="sm" className="mb-2 mt-3" onClick={onCustomizePlan}>
          <Pencil size={14} /> Customize stops and locations
        </Button>
      </div>
    </div>
  )
}

function deriveHostedRecipientName(legs: PlanModel['legs']): string | null {
  for (const leg of legs) {
    if (leg.kind !== 'host' || !leg.title) continue
    const handoffMatch = leg.title.match(/\bto\s+(.+)$/i)
    if (handoffMatch?.[1]) return handoffMatch[1].trim().replace(/[.]+$/, '')
    const coverageMatch = leg.title.match(/\bcovers?\s+(.+)$/i)
    if (coverageMatch?.[1]) return coverageMatch[1].trim().replace(/[.]+$/, '')
  }
  return null
}

function applyAssignmentNarrative(
  mode: PlanModel['mode'],
  legs: PlanModel['legs'],
  recipientName: string | null,
): PlanModel['legs'] {
  if (mode !== 'hosted') return legs
  return legs.map((leg, index) => {
    if (leg.kind !== 'host') return leg
    const assignee = leg.driver?.name ?? 'Caregiver'
    if (index === 0 || /^hand off/i.test(leg.title)) {
      return { ...leg, title: recipientName ? `${assignee} hands over ${recipientName}` : `${assignee} handles handoff` }
    }
    if (index === 1 || /\bcovers?\b/i.test(leg.title)) {
      return { ...leg, title: recipientName ? `${assignee} covers ${recipientName}` : `${assignee} covers` }
    }
    return leg
  })
}

function derivePlanPresentation(mode: PlanModel['mode'], legs: PlanModel['legs'], recipientName?: string | null) {
  const dropLeg = legs.find((l) => l.kind === 'drop' || l.kind === 'depart')
  const pickLeg = legs.find((l) => l.kind === 'pickup' || l.kind === 'return')
  const stayLeg = legs.find((l) => l.kind === 'stay')
  const waits = stayLeg?.waits ?? false

  const dropDriver = dropLeg?.driver?.name ?? null
  const pickDriver = pickLeg?.driver?.name ?? null
  const driver = dropDriver ?? pickDriver ?? 'The driver'
  const stayWindow = stayLeg?.detail?.match(/(\d{1,2}:\d{2}\s?(?:AM|PM).*?\d{1,2}:\d{2}\s?(?:AM|PM))/i)?.[1] ?? null

  let pattern = 'Plan'
  let twoDrivers = false
  if (mode === 'hosted') pattern = 'At home'
  else if (mode === 'trip') {
    pattern = 'Day trip'
    twoDrivers = Boolean(dropDriver && pickDriver && dropDriver !== pickDriver)
  } else if (dropLeg && pickLeg) {
    if (waits) pattern = 'Stay & wait'
    else if (dropDriver && pickDriver && dropDriver === pickDriver) pattern = 'Drop & return'
    else if (dropDriver && pickDriver) { pattern = 'Drop & pickup'; twoDrivers = true }
    else pattern = 'Drop & return'
  } else if (pickLeg) pattern = deriveSingleStopPattern(pickLeg.title)
  else if (dropLeg) pattern = 'Drop & go'

  const yourTime =
    pattern === 'Stay & wait' ? `${driver} is committed the full ${stayWindow ?? 'visit'}.`
    : pattern === 'Drop & return' ? `Same driver both ways — ${driver} is free in between.`
    : pattern === 'Drop & pickup' ? `Split between ${dropDriver ?? 'one'} & ${pickDriver ?? 'another'} — nobody's stuck the whole time.`
    : pattern === 'Pickup only' ? `One quick pickup by ${driver}.`
    : pattern === 'Drop-off only' ? `One quick drop-off by ${driver}.`
    : pattern === 'Pickup / Drop-off' ? `Quick pickup/drop-off run by ${driver}.`
    : pattern === 'At home' ? (() => {
      const hostDrivers = Array.from(new Set(
        legs
          .filter((leg) => leg.kind === 'host')
          .map((leg) => leg.driver?.name)
          .filter((name): name is string => Boolean(name)),
      ))
      if (hostDrivers.length >= 2) {
        return recipientName
          ? `${hostDrivers[0]} hands off to ${hostDrivers[1]} for ${recipientName}.`
          : `${hostDrivers[0]} hands off to ${hostDrivers[1]}.`
      }
      if (hostDrivers.length === 1) {
        return recipientName
          ? `No driving. ${hostDrivers[0]} is covering ${recipientName}.`
          : `No driving. ${hostDrivers[0]} is covering at home.`
      }
      return 'No driving. Coverage is set at home.'
    })()
    : pattern === 'Day trip' ? `${driver} drives both ways — everyone's out for the day.`
    : null

  return { pattern, twoDrivers, yourTime }
}

function ReferenceBlock({
  enr,
  hasText,
  actions,
  logistics,
}: {
  enr: EventEnrichment | null
  hasText: (v: unknown) => boolean
  actions: EventActionItem[]
  logistics: EventLogistic[]
}) {
  const [open, setOpen] = useState(false)
  const rows: React.ReactNode[] = []
  const source = enr ?? null

  if (hasText(source?.contact_name) || hasText(source?.contact_phone)) {
    rows.push(
      <div key="contact">
        <p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Contact</p>
        <p className="text-body-sm mt-1" style={{ color: S.navy }}>
          {source?.contact_name}
          {source?.contact_name && source?.contact_phone && ' · '}
          {source?.contact_phone && <a href={`tel:${source.contact_phone.replace(/\D/g, '')}`} style={{ color: S.gold, fontWeight: 600 }}>{source.contact_phone}</a>}
        </p>
      </div>,
    )
  }
  if (hasText(source?.cost_estimate)) {
    rows.push(
      <div key="cost">
        <p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Cost</p>
        <p className="text-body-sm mt-1" style={{ color: S.navy }}>{source?.cost_estimate}</p>
      </div>,
    )
  }
  if (hasText(source?.outfit_suggestion)) {
    rows.push(<div key="outfit"><p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>What to wear</p><p className="text-body-sm mt-1" style={{ color: S.muted }}>{source?.outfit_suggestion}</p></div>)
  }
  if (hasText(source?.dietary_notes)) {
    rows.push(<div key="diet"><p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Dietary notes</p><p className="text-body-sm mt-1" style={{ color: S.muted }}>{source?.dietary_notes}</p></div>)
  }
  if (hasText(source?.meal_impact)) {
    rows.push(
      <div key="meal">
        <p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Meal impact</p>
        <p className="text-body-sm mt-1" style={{ color: S.muted }}>{source?.meal_impact}</p>
      </div>,
    )
  }
  if (hasText(source?.prep_notes)) {
    rows.push(<div key="notes"><p className="text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Notes</p><p className="text-body-sm mt-1 whitespace-pre-line leading-relaxed" style={{ color: S.muted }}>{source?.prep_notes}</p></div>)
  }
  if (actions.length > 0) {
    rows.push(
      <div key="actions">
        <p className="text-caption font-bold uppercase mb-1.5" style={{ color: S.label, letterSpacing: '0.1em' }}>Prep lane</p>
        <ActionItemsSection items={actions} />
      </div>,
    )
  }
  if (logistics.length > 0) {
    rows.push(
      <div key="logistics">
        <p className="text-caption font-bold uppercase mb-1.5" style={{ color: S.label, letterSpacing: '0.1em' }}>Logistics</p>
        <LogisticsSection items={logistics} />
      </div>,
    )
  }

  return (
    <section className="pt-1">
      <Button
        onClick={() => setOpen((o) => !o)}
        variant="ghost"
        fullWidth
        className="border-t border-casa-border py-2.5 text-left hover:bg-transparent"
        contentClassName="w-full justify-between"
      >
        <span>
          <span className="block text-caption font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Reference</span>
          <span className="block text-caption" style={{ color: S.muted }}>Contact, cost, notes</span>
        </span>
        <ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} style={{ color: S.label }} />
      </Button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="pt-1.5 pb-3 space-y-2.5">
              {rows.length > 0 ? rows : (
                <p className="text-body-sm" style={{ color: S.label }}>No reference details yet.</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* ── Checklist with optimistic toggle ───────────────────────── */

function ChecklistSection({ items }: { items: EventChecklistItem[]; eventId: string }) {
  const [localChecked, setLocalChecked] = useState<Record<string, boolean>>({})
  const qc = useQueryClient()

  const toggle = async (item: EventChecklistItem) => {
    const newVal = !(localChecked[item.id] ?? item.checked)
    setLocalChecked((prev) => ({ ...prev, [item.id]: newVal }))
    await supabase.from('event_checklist_items').update({ checked: newVal }).eq('id', item.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }

  return (
    <div>
      {items.map((item, i) => {
        const checked = localChecked[item.id] ?? item.checked
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5 min-h-[44px] cursor-pointer"
            style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}
            onClick={() => toggle(item)}
          >
            {checked ? (
              <span className="flex-none w-[22px] h-[22px] rounded-md flex items-center justify-center text-white" style={{ background: S.navy }}>
                <Check size={13} />
              </span>
            ) : (
              <span className="flex-none w-[22px] h-[22px] rounded-md border-2 border-casa-navy/25" />
            )}
            <span className="text-body-sm" style={{ color: checked ? S.label : S.navy, textDecoration: checked ? 'line-through' : 'none' }}>
              {item.label}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function ActionItemsSection({ items }: { items: EventActionItem[] }) {
  const [localCompleted, setLocalCompleted] = useState<Record<string, boolean>>({})
  const qc = useQueryClient()

  const toggle = async (item: EventActionItem) => {
    const nextCompleted = !(localCompleted[item.id] ?? item.completed)
    setLocalCompleted((prev) => ({ ...prev, [item.id]: nextCompleted }))
    const payload = {
      completed: nextCompleted,
      completed_at: nextCompleted ? new Date().toISOString() : null,
    }
    await supabase.from('event_action_items').update(payload).eq('id', item.id)
    qc.invalidateQueries({ queryKey: ['events'] })
  }

  return (
    <div>
      {items.map((item, i) => {
        const completed = localCompleted[item.id] ?? item.completed
        return (
          <div
            key={item.id}
            className="flex items-center gap-3 py-2.5 min-h-[44px] cursor-pointer"
            style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}
            onClick={() => toggle(item)}
          >
            {completed ? (
              <span className="flex-none w-[22px] h-[22px] rounded-md flex items-center justify-center text-white" style={{ background: S.navy }}>
                <Check size={13} />
              </span>
            ) : (
              <span className="flex-none w-[22px] h-[22px] rounded-md border-2 border-casa-navy/25" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-body-sm" style={{ color: completed ? S.label : S.navy, textDecoration: completed ? 'line-through' : 'none' }}>
                {item.title}
              </p>
              {item.description && (
                <p className="text-caption" style={{ color: S.muted }}>
                  {item.description}
                </p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function LogisticsSection({ items }: { items: EventLogistic[] }) {
  return (
    <div className="rounded-[14px] px-4 py-1.5" style={{ background: S.coverFill }}>
      {items.map((item, i) => (
        <div key={item.id} className="py-2.5" style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}>
          <div className="flex items-start gap-3">
            <span className="mt-1 h-2.5 w-2.5 rounded-full bg-casa-navy/60" />
            <div className="min-w-0">
              <p className="text-body-sm font-semibold" style={{ color: S.navy }}>{item.title}</p>
              {(item.time || item.location_name) && (
                <p className="text-caption" style={{ color: S.muted }}>
                  {[item.time, item.location_name].filter(Boolean).join(' · ')}
                </p>
              )}
              {item.description && (
                <p className="text-caption mt-0.5" style={{ color: S.muted }}>{item.description}</p>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function FallbackBringChecklist({ items, eventId }: { items: string[]; eventId: string }) {
  const storageKey = `event-command-center-bring:${eventId}`
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return {}
      const parsed = JSON.parse(raw) as Record<string, boolean>
      return parsed && typeof parsed === 'object' ? parsed : {}
    } catch (error) {
      console.warn('EventDetailPanel: failed to read fallback bring checklist state', error)
      return {}
    }
  })

  const toggle = (index: number) => {
    const key = `${index}`
    setChecked((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      try {
        localStorage.setItem(storageKey, JSON.stringify(next))
      } catch (error) {
        console.warn('EventDetailPanel: failed to persist fallback bring checklist state', error)
      }
      return next
    })
  }

  return (
    <div>
      {items.map((item, i) => {
        const isChecked = Boolean(checked[`${i}`])
        return (
          <div
            key={`${item}-${i}`}
            className="flex items-center gap-3 py-2.5 min-h-[44px] cursor-pointer"
            style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}
            onClick={() => toggle(i)}
          >
            {isChecked ? (
              <span className="flex-none w-[22px] h-[22px] rounded-md flex items-center justify-center text-white" style={{ background: S.navy }}>
                <Check size={13} />
              </span>
            ) : (
              <span className="flex-none w-[22px] h-[22px] rounded-md border-2 border-casa-navy/25" />
            )}
            <span className="text-body-sm" style={{ color: isChecked ? S.label : S.navy, textDecoration: isChecked ? 'line-through' : 'none' }}>
              {item}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── LocationBlock ──────────────────────────────────────────── */

function LocationBlock({ eventId, locationName, address, lat, lng, parkingNotes, contactPhone, weatherAtVenue, mode, transportationNeeded, accent }: {
  eventId: string
  locationName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  parkingNotes?: string | null
  contactPhone?: string | null
  weatherAtVenue?: string | null
  mode: EventMode
  transportationNeeded: boolean
  accent: string
}) {
  const [savedLocal, setSavedLocal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [geocodeState, setGeocodeState] = useState<'idle' | 'loading' | 'error' | 'done'>('idle')
  const [fallbackCoords, setFallbackCoords] = useState<{ lat: number; lng: number } | null>(null)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const savePlace = useSavePlace()
  const queryClient = useQueryClient()
  const { data: homeConfig } = useQuery({
    queryKey: ['home-config'],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('value').eq('key', 'home_config').maybeSingle()
      if (error) throw error
      return (data?.value ?? null) as { address?: string; city?: string; state?: string; zip?: string } | null
    },
  })

  const homeAddress = [homeConfig?.address, homeConfig?.city, homeConfig?.state, homeConfig?.zip].filter(Boolean).join(', ').trim() || null
  const effectiveLocationName = locationName?.trim() || address?.trim() || (mode === 'hosted' && homeAddress ? 'Home' : null)
  const effectiveAddress = address?.trim() || (mode === 'hosted' ? homeAddress : null)
  const sourceHasDestination = Boolean(locationName?.trim() || address?.trim())

  const existingPlace = findSavedPlace(savedPlaces, effectiveLocationName, effectiveAddress)
  const isAlreadySaved = Boolean(existingPlace) || savedLocal

  const mapsQuery = effectiveAddress
    ? (effectiveLocationName ? `${effectiveLocationName}, ${effectiveAddress}` : effectiveAddress)
    : (effectiveLocationName ?? '')
  const googleMapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null
  const callUrl = contactPhone ? `tel:${contactPhone.replace(/\D/g, '')}` : null
  const effectiveLat = lat ?? fallbackCoords?.lat ?? null
  const effectiveLng = lng ?? fallbackCoords?.lng ?? null
  const hasCoordinates = effectiveLat != null && effectiveLng != null
  const hasDestination = Boolean(effectiveLocationName || effectiveAddress)
  const mapEmbedUrl = hasCoordinates
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${encodeURIComponent(`${effectiveLng - 0.01},${effectiveLat - 0.01},${effectiveLng + 0.01},${effectiveLat + 0.01}`)}&layer=mapnik&marker=${encodeURIComponent(`${effectiveLat},${effectiveLng}`)}`
    : null
  const needsGeocode = hasDestination && !hasCoordinates
  const technicalStatus: AddressTechnicalStatus =
    needsGeocode && geocodeState === 'error'
      ? 'unavailable'
      : needsGeocode
        ? 'checking'
        : 'ready'

  const resolveCoordsFromPlaceSearch = useCallback(async () => {
    if (!mapsQuery) return null
    const { data, error } = await supabase.functions.invoke('place-search', { body: { query: mapsQuery } })
    if (error) return null
    const first = (data as { places?: Array<{ lat?: number | null; lng?: number | null }> })?.places?.[0]
    if (first?.lat == null || first?.lng == null) return null
    return { lat: first.lat, lng: first.lng }
  }, [mapsQuery])

  useEffect(() => {
    setFallbackCoords(null)
    setGeocodeState('idle')
  }, [eventId, effectiveLocationName, effectiveAddress])

  useEffect(() => {
    if (!needsGeocode || geocodeState === 'loading' || geocodeState === 'done') return
    let cancelled = false
    const run = async () => {
      setGeocodeState('loading')
      if (sourceHasDestination) {
        try {
          const { data, error } = await supabase.functions.invoke('geocode-event-location', {
            body: { event_id: eventId },
          })
          if (cancelled) return
          const geocodeData = data as { ok?: boolean; lat?: number | null; lng?: number | null } | null
          if (!error && geocodeData?.ok && geocodeData.lat != null && geocodeData.lng != null) {
            setFallbackCoords({ lat: geocodeData.lat, lng: geocodeData.lng })
            setGeocodeState('done')
            queryClient.invalidateQueries({ queryKey: ['events'] })
            return
          }
        } catch {
          // Falls through to secondary place-search lookup.
        }
      }

      const fallback = await resolveCoordsFromPlaceSearch()
      if (cancelled) return
      if (fallback) {
        setFallbackCoords(fallback)
        setGeocodeState('done')
        return
      }
      setGeocodeState('error')
    }
    void run()
    return () => { cancelled = true }
  }, [eventId, geocodeState, needsGeocode, queryClient, resolveCoordsFromPlaceSearch, sourceHasDestination])

  async function handleSave() {
    if (isAlreadySaved || saving || (!effectiveLocationName && !effectiveAddress)) return
    setSaving(true)
    try {
      await savePlace.mutateAsync({
        name: effectiveLocationName ?? effectiveAddress ?? 'Unknown Place',
        address: effectiveAddress ?? null,
        phone: contactPhone ?? null,
        notes: null,
        category: 'other',
      })
      setSavedLocal(true)
    } catch { /* non-fatal */ }
    setSaving(false)
  }

  return (
    <div className="rounded-[14px] overflow-hidden" style={{ border: `1px solid ${S.borderMed}` }}>
      <div
        style={{
          height: 'clamp(360px, 42vh, 400px)',
          minHeight: 360,
          background: 'linear-gradient(135deg, var(--color-casa-info-soft), var(--color-casa-success-soft))',
        }}
        className="relative overflow-hidden"
      >
        {mapEmbedUrl ? (
          <iframe
            title="Event location map"
            src={mapEmbedUrl}
            className="w-full h-full border-0"
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
          />
        ) : (
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%,-100%) rotate(-45deg)',
              width: 22,
              height: 22,
              background: accent,
              borderRadius: '50% 50% 50% 0',
              boxShadow: '0 3px 6px rgba(0,0,0,0.2)',
            }}
          />
        )}
        {needsGeocode && geocodeState === 'loading' && (
          <div className="absolute inset-0 bg-white/55 backdrop-blur-[1px] flex items-center justify-center">
            <span className="inline-flex items-center gap-1.5 text-caption font-semibold rounded-pill px-3 py-1.5" style={{ background: 'var(--color-casa-surface)', color: S.navy }}>
              <Loader2 size={12} className="animate-spin" /> Resolving map snapshot…
            </span>
          </div>
        )}
        {weatherAtVenue && (
          <div className="absolute left-3 top-2.5 text-caption rounded-md px-2 py-0.5" style={{ background: 'rgba(255,255,255,.85)', color: S.muted }}>
            {weatherAtVenue}
          </div>
        )}
      </div>
      <div className="p-4">
        {parkingNotes && <div className="mt-1 text-body-sm text-casa-muted">{parkingNotes}</div>}
        {needsGeocode && geocodeState === 'error' && (
          <div className="mt-2 rounded-lg px-3 py-2 text-caption" style={{ background: S.amberBg, border: `1px solid ${S.amberBorder}`, color: S.goldText }}>
            Map snapshot unavailable for this address.
            <Button
              variant="ghost"
              size="sm"
              className="ml-2 min-h-0 p-0 font-semibold underline hover:bg-transparent"
              onClick={() => setGeocodeState('idle')}
            >
              Retry
            </Button>
          </div>
        )}
        {hasDestination ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <AddressTechnicalStatusChip status={technicalStatus} />
            <span className="text-caption text-casa-muted">
              {technicalStatus === 'ready'
                ? (transportationNeeded ? 'Available for maps and travel calculations.' : 'Available for maps and directions.')
                : technicalStatus === 'checking'
                  ? 'Resolving the destination for maps and travel.'
                  : 'Review the address or retry the map lookup.'}
            </span>
          </div>
        ) : null}
        <div className="flex gap-2 mt-3">
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center py-2.5 rounded-[10px] text-body-sm font-semibold inline-flex items-center justify-center gap-1.5 text-white"
              style={{ background: S.navy }}
            >
              <Navigation size={14} />
              {mode === 'pickup' ? 'Navigate to car line' : 'Navigate'}
            </a>
          )}
          {callUrl && (
            <a
              href={callUrl}
              className="flex-1 text-center py-2.5 rounded-[10px] text-body-sm font-semibold inline-flex items-center justify-center"
              style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
            >
              Call
            </a>
          )}
        </div>
        {hasDestination && (
          <div className="mt-2">
            <Button
              onClick={handleSave}
              disabled={isAlreadySaved || saving}
              variant="secondary"
              fullWidth
              className="text-body-sm font-semibold"
            >
              {isAlreadySaved ? 'Saved place' : saving ? 'Saving…' : 'Save place'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Footer ─────────────────────────────────────────────────── */

function PanelFooter({ event, modeOverride, onEdit }: { event: EventWithDetails; modeOverride: EventMode | null; onEdit: () => void }) {
  const mode = modeOverride ?? inferEventMode(event)
  const contactName = event.enrichment?.contact_name?.trim() || null
  const contactPhone = event.enrichment?.contact_phone?.replace(/\D/g, '') || null
  const contactFirst = contactName?.split(' ')[0] || 'contact'
  const mapsQuery = event.address
    ? (event.location_name ? `${event.location_name}, ${event.address}` : event.address)
    : (event.location_name ?? '')
  const mapsUrl = mapsQuery
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
    : null
  const smsUrl = contactPhone ? `sms:${contactPhone}` : null
  const callUrl = contactPhone ? `tel:${contactPhone}` : null

  let primaryLabel = mode === 'pickup' ? 'Navigate to car line' : 'Navigate'
  let primaryHref = mode === 'hosted' ? null : mapsUrl
  let primaryIcon: React.ReactNode = <Navigation size={16} />
  if (mode === 'hosted' && smsUrl) {
    primaryLabel = `Message ${contactFirst}`
    primaryHref = smsUrl
    primaryIcon = <MessageSquare size={16} />
  }

  let secondaryLabel = mode === 'trip' ? 'Share float plan' : 'Share'
  let secondaryHref: string | null = null
  let secondaryIcon: React.ReactNode = <Share2 size={15} />
  if (mode === 'hosted' && callUrl) {
    secondaryLabel = `Call ${contactFirst}`
    secondaryHref = callUrl
    secondaryIcon = <Phone size={15} />
  }

  const handleShare = async () => {
    const when = event.all_day
      ? `${format(getEventDisplayStartDay(event), 'EEE, MMM d')} · All day`
      : `${format(new Date(event.start_time), 'EEE, MMM d · h:mm a')}–${format(new Date(event.end_time), 'h:mm a')}`
    const text = `${event.title} — ${when}${event.location_name ? ` @ ${event.location_name}` : ''}`
    try {
      if (navigator.share) await navigator.share({ title: event.title, text })
      else await navigator.clipboard.writeText(text)
    } catch { /* user cancelled */ }
  }

  return (
    <div className="flex flex-none items-center gap-2.5 bg-casa-surface px-5 py-3.5" style={{ borderTop: `1px solid ${S.borderMed}` }}>
      <IconButton
        onClick={onEdit}
        title="Edit details"
        icon={<Pencil size={16} />}
        aria-label="Edit event details"
        variant="secondary"
      />
      {primaryHref && (
        <a
          href={primaryHref}
          target="_blank"
          rel="noreferrer"
          className="casa-action-primary inline-flex min-h-control flex-1 items-center justify-center gap-2 rounded-button bg-casa-gold px-4 text-center text-body-sm font-bold shadow-card transition-colors hover:brightness-110"
          style={{ background: S.gold, color: S.navy }}
        >
          {primaryIcon}
          {primaryLabel}
        </a>
      )}
      {secondaryHref ? (
        <a
          href={secondaryHref}
          className="inline-flex min-h-control items-center gap-2 rounded-button border border-casa-border bg-casa-surface px-4 text-body-sm font-medium text-casa-navy transition-colors hover:bg-casa-bg"
          style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
        >
          {secondaryIcon}
          {secondaryLabel}
        </a>
      ) : (
        <Button
          onClick={handleShare}
          variant="secondary"
          leadingIcon={secondaryIcon}
        >
          {secondaryLabel}
        </Button>
      )}
    </div>
  )
}

/* ── Shared sub-components ───────────────────────────────────── */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
      {children}
    </p>
  )
}

function formatDuration(start: Date, end: Date): string {
  const mins = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000))
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
