import { useState, useEffect, useRef, useCallback } from 'react'
import { format } from 'date-fns'
import { motion, AnimatePresence, useDragControls } from 'framer-motion'
import {
  X, MapPin, Navigation, ChevronRight,
  Loader2, Crown, Plus, Check, Pencil, Share2, Phone, MessageSquare,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import { useTodayEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import type { EventChecklistItem, EventEnrichment, EventActionItem, EventLogistic, SavedPlace } from '../../types'
import { getFieldsForCategory, CATEGORY_LABEL } from './categoryFields'
import EventEditSheet from './EventEditSheet'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useSavedPlaces, useSavePlace, findSavedPlace } from '../../hooks/useSavedPlaces'
import { useTravelEta } from '../../hooks/useTravelEta'
import { useMemberAvailability } from '../../hooks/useMemberAvailability'
import { DepartureRiskBanner } from '../shared/DepartureRiskBanner'
import {
  inferEventMode, derivePlan, eventAccentColor, trafficPill, eventAttendees,
  deriveSingleStopPattern, type PlanModel, type EventMode,
} from '../../lib/eventCommandCenter'
import {
  evaluateMemberAvailabilityForWindow,
  indexAvailabilityExceptionsByMember,
  indexAvailabilityRulesByMember,
} from '../../lib/memberAvailability'
import { locationSignature, overridesStorageKey } from '../../lib/eventPlanOverrides'
import { getEventDisplayStartDay } from '../../utils/eventTime'

// ── Exact design tokens from the Event Command Center handoff (SPEC §2) ──────
const S = {
  navy: 'var(--color-casa-navy)',
  navyHex: '#1B2A44',
  muted: 'var(--color-casa-muted)',
  label: 'color-mix(in srgb, var(--color-casa-muted) 85%, white)',
  eyebrow: 'color-mix(in srgb, var(--color-casa-muted) 75%, white)',
  planLabel: 'color-mix(in srgb, white 65%, var(--color-casa-navy))',
  chipFill: 'var(--color-casa-bg)',
  yourTimeFill: 'var(--color-casa-bg)',
  coverFill: 'var(--color-casa-bg)',
  gold: 'var(--color-casa-gold)',
  goldHex: '#C6A15B',
  goldBadge: 'color-mix(in srgb, var(--color-casa-gold) 72%, white)',
  goldText: 'color-mix(in srgb, var(--color-casa-warning) 70%, var(--color-casa-text))',
  amberBg: '#FCF3E0',
  amberBorder: '#EAD3A0',
  green: 'var(--color-casa-success)',
  greenHex: '#2F8F5B',
  greenBg: '#E6F4EC',
  red: 'var(--color-casa-error)',
  redBg: '#FBEAE7',
  borderSoft: 'color-mix(in srgb, var(--color-casa-navy) 8%, transparent)',
  borderMed: 'color-mix(in srgb, var(--color-casa-navy) 10%, transparent)',
  hair: 'color-mix(in srgb, var(--color-casa-navy) 6%, transparent)',
}
const serif = { fontFamily: "'Source Serif 4', Georgia, serif" }
const MODE_OVERRIDE_OPTIONS: Array<{ value: 'auto' | EventMode; label: string; helper?: string }> = [
  { value: 'auto', label: 'Auto' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'hosted', label: 'Hosted' },
  { value: 'trip', label: 'Trip' },
]

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full, 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

function verifyFromTrustedSource(event: EventWithDetails, savedPlaces: SavedPlace[] = []): boolean {
  if (findSavedPlace(savedPlaces ?? [], event.location_name, event.address)) return true
  if (event.lat == null || event.lng == null) return false
  if (event.enrichment?.confidence === 'low') return false
  return true
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
  const { data: savedPlaces = [] } = useSavedPlaces()
  const isMobile = useIsMobile()
  const panelDragControls = useDragControls()
  const dragDismissOffset = isMobile ? 150 : 180
  const dragDismissVelocity = isMobile ? 550 : 700
  const sourceVerified = event ? verifyFromTrustedSource(event, savedPlaces) : false
  const effectiveVerified = verifiedOverride ?? sourceVerified

  useEffect(() => {
    if (!event) return
    let raw: string | null = null
    try {
      raw = localStorage.getItem(overridesStorageKey(event.id))
    } catch (error) {
      console.warn('EventDetailPanel: failed to read persisted plan overrides', error)
    }
    if (!raw) {
      setVerifiedOverride(null)
      setWaitsOverride(null)
      setDriverOverrides({})
      setModeOverride(null)
      setTwoDriverConfirmed(false)
      return
    }
    try {
      const parsed = JSON.parse(raw) as {
        verified?: boolean | null
        waits?: boolean | null
        driverOverrides?: Record<number, string>
        modeOverride?: EventMode | 'travel' | null
        twoDriverConfirmed?: boolean
        locationSignature?: string
      }
      const currentLocationSignature = locationSignature(event)
      const locationMatches = parsed.locationSignature === currentLocationSignature
      setVerifiedOverride(locationMatches ? (parsed.verified ?? null) : null)
      setWaitsOverride(parsed.waits ?? null)
      setDriverOverrides(parsed.driverOverrides ?? {})
      const persistedMode = parsed.modeOverride ?? null
      setModeOverride(persistedMode === 'travel' ? 'appointment' : persistedMode)
      setTwoDriverConfirmed(Boolean(parsed.twoDriverConfirmed))
    } catch (error) {
      console.warn('EventDetailPanel: failed to parse persisted plan overrides', error)
      setVerifiedOverride(null)
      setWaitsOverride(null)
      setDriverOverrides({})
      setModeOverride(null)
      setTwoDriverConfirmed(false)
    }
  }, [event?.id])

  useEffect(() => {
    if (!event) return
    const hasOverrides = verifiedOverride != null || waitsOverride != null || Object.keys(driverOverrides).length > 0 || modeOverride != null || twoDriverConfirmed
    if (!hasOverrides) {
      try {
        localStorage.removeItem(overridesStorageKey(event.id))
      } catch (error) {
        console.warn('EventDetailPanel: failed to clear persisted plan overrides', error)
      }
      return
    }
    try {
      localStorage.setItem(
        overridesStorageKey(event.id),
        JSON.stringify({
          verified: verifiedOverride,
          waits: waitsOverride,
          driverOverrides,
          modeOverride,
          twoDriverConfirmed,
          locationSignature: locationSignature(event),
        }),
      )
    } catch (error) {
      console.warn('EventDetailPanel: failed to persist plan overrides', error)
    }
  }, [event?.id, verifiedOverride, waitsOverride, driverOverrides, modeOverride, twoDriverConfirmed])

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
        {event && (
          <>
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[54]"
              style={{ background: 'linear-gradient(180deg,rgba(27,42,68,0.28),rgba(27,42,68,0.12) 45%,rgba(27,42,68,0.06))' }}
              data-panel-overlay
              onClick={onClose}
              onTouchStart={stopTouch}
              onTouchMove={stopTouch}
              onTouchEnd={stopTouch}
              onPointerDown={stopTouch}
            />

            <motion.div
              key="event-panel-shell"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%', transition: { duration: 0.24, ease: [0.4, 0, 1, 1] } }}
              transition={{ type: 'spring', stiffness: 320, damping: 30, mass: 0.92, bounce: 0.18 }}
              drag="y"
              dragControls={panelDragControls}
              dragListener={false}
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.22 }}
              dragMomentum={false}
              onDragEnd={(_e, info) => {
                if (info.velocity.y > dragDismissVelocity || info.offset.y > dragDismissOffset) onClose()
              }}
              style={{ willChange: 'transform', backfaceVisibility: 'hidden' }}
              className="event-command-center fixed inset-x-2 bottom-2 top-[5vh] lg:top-[6vh] lg:bottom-4 lg:left-auto lg:right-4 lg:w-[40vw] bg-white rounded-3xl shadow-[0_14px_44px_rgba(6,10,36,0.28)] z-[55] flex flex-col overflow-hidden transform-gpu"
              data-panel-overlay
              data-native-drag
              data-ptr-ignore
              onClick={e => e.stopPropagation()}
              onPointerDown={stopTouch}
              onTouchStart={stopTouch}
              onTouchMove={stopTouch}
              onTouchEnd={stopTouch}
            >
              <div className="flex-shrink-0 px-3 pt-3 pb-1.5">
                <button
                  type="button"
                  className="mx-auto block h-6 w-[86px] cursor-grab active:cursor-grabbing"
                  aria-label="Drag down to dismiss panel"
                  style={{ touchAction: 'none' }}
                  data-native-drag
                  data-ptr-ignore
                  onPointerDown={e => panelDragControls.start(e)}
                >
                  <span className="mx-auto mt-1.5 block w-11 h-[5px] rounded-full" style={{ background: 'rgba(27,42,68,0.18)' }} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden overscroll-contain" data-native-drag data-ptr-ignore>
                <PanelHeader
                  event={event}
                  verified={effectiveVerified}
                  modeOverride={modeOverride}
                  onClose={onClose}
                  onEdit={() => setShowEdit(true)}
                />
                <PanelBody
                  event={event}
                  verified={effectiveVerified}
                  modeOverride={modeOverride}
                  waitsOverride={waitsOverride}
                  driverOverrides={driverOverrides}
                  twoDriverConfirmed={twoDriverConfirmed}
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
                  onSetVerifiedOverride={setVerifiedOverride}
                  onEdit={() => setShowEdit(true)}
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

function MemberEditor({ event }: { event: EventWithDetails }) {
  const queryClient = useQueryClient()
  const { data: allMembers = [] } = useFamilyMembers()
  const [showPicker, setShowPicker] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
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

  async function removeMember(eventMemberId: string) {
    setSaving(eventMemberId)
    await supabase.from('event_members').delete().eq('id', eventMemberId)
    queryClient.invalidateQueries({ queryKey: ['events'] })
    setSaving(null)
  }

  async function addMember(familyMemberId: string) {
    setSaving(familyMemberId)
    await supabase.from('event_members').upsert(
      { event_id: event.id, family_member_id: familyMemberId, role: 'attendee' },
      { onConflict: 'event_id,family_member_id', ignoreDuplicates: true }
    )
    queryClient.invalidateQueries({ queryKey: ['events'] })
    setSaving(null)
    setShowPicker(false)
  }

  return (
    <div className="flex flex-wrap items-center gap-2 relative">
      {sorted.map((m) => {
        const isPrimary = m.role === 'primary'
        const isLoading = saving === m.id || saving === m.family_member?.id
        const color = m.family_member?.color_hex ?? 'var(--color-casa-muted)'
        return (
          <div
            key={m.id}
            className="group inline-flex items-center gap-1.5 rounded-pill pl-1 pr-2 py-1 text-[13px] font-semibold transition-opacity"
            style={{ background: S.chipFill, border: `1px solid ${S.borderSoft}`, color: S.navy, opacity: isLoading ? 0.6 : 1 }}
          >
            <span
              className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0"
              style={{ backgroundColor: color }}
            >
              {m.family_member?.name?.[0]}
            </span>
            <span>{m.family_member?.name}</span>

            {/* Promote primary directly from the attendee pill (touch + desktop). */}
            {!isPrimary ? (
              <button
                onClick={() => makeOwner(m.family_member!.id)}
                className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors"
                style={{ color: S.label, background: 'transparent' }}
                title={`Make ${m.family_member?.name ?? 'member'} primary`}
                aria-label={`Make ${m.family_member?.name ?? 'member'} primary`}
              >
                <Crown size={12} />
              </button>
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
              <button
                onClick={() => removeMember(m.id)}
                className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center transition-colors hover:bg-casa-bg"
                style={{ color: S.label, background: 'transparent' }}
                title="Remove"
                aria-label={`Remove ${m.family_member?.name ?? 'member'}`}
              >
                <X size={12} />
              </button>
            )}
          </div>
        )
      })}

      {/* Add button */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(p => !p)}
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-pill border border-dashed text-[13px] font-semibold transition-colors"
          style={{ borderColor: S.borderMed, color: S.label }}
        >
          <Plus size={12} /> Add
        </button>

        <AnimatePresence>
          {showPicker && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.15 }}
              className="absolute top-full mt-1.5 left-0 z-20 bg-white border rounded-2xl shadow-[0_12px_32px_rgba(6,10,36,0.16)] p-2 flex flex-col gap-1 min-w-[150px]"
              style={{ borderColor: S.borderSoft }}
            >
              {allMembers
                .filter(fm => !assignedIds.has(fm.id))
                .map(fm => (
                  <button
                    key={fm.id}
                    onClick={() => addMember(fm.id)}
                    disabled={saving === fm.id}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg hover:bg-casa-bg transition-colors text-left"
                  >
                    <span
                      className="w-6 h-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: fm.color_hex ?? 'var(--color-casa-muted)' }}
                    >
                      {fm.name?.[0]}
                    </span>
                    <span className="text-[14px] font-medium" style={{ color: S.navy }}>{fm.name}</span>
                  </button>
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

/* ── Header ─────────────────────────────────────────────────── */

function PanelHeader({
  event,
  verified,
  modeOverride,
  onClose,
  onEdit,
}: {
  event: EventWithDetails
  verified: boolean
  modeOverride: EventMode | null
  onClose: () => void
  onEdit: () => void
}) {
  const category = event.enrichment?.category
  const accent = eventAccentColor(event)
  const primary = event.members?.find((m) => m.role === 'primary') ?? event.members?.[0]
  const eyebrow = primary?.family_member?.name
    ? `${primary.family_member.name}${event.members.length > 1 ? ` +${event.members.length - 1}` : ''}`
    : null
  const isRecurring = Boolean(event.rrule || event.recurrence_master_id)
  const reminder = event.event_type === 'reminder'
  const mode = modeOverride ?? inferEventMode(event)
  const hostedAtHome = mode === 'hosted'
  const displayStartDay = getEventDisplayStartDay(event)
  const headerWhen = event.all_day
    ? format(displayStartDay, 'EEE, MMM d')
    : format(new Date(event.start_time), 'EEE, MMM d · h:mm a')
  const headerDuration = event.all_day ? 'All day' : formatDuration(new Date(event.start_time), new Date(event.end_time))

  return (
    <div className="px-7 pt-6 pb-5" style={{ borderBottom: `1px solid ${S.borderSoft}` }}>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {category && (
            <span
              className="text-[11px] font-semibold rounded-pill px-2.5 py-1 capitalize"
              style={{ background: hexToRgba(accent, 0.14), color: S.navy, letterSpacing: '0.04em' }}
            >
              {CATEGORY_LABEL[category] ?? category}
            </span>
          )}
          {isRecurring && (
            <span className="text-[11px] font-semibold rounded-pill px-2.5 py-1" style={{ background: S.hair, color: S.muted }}>
              ↻ Repeats
            </span>
          )}
        </div>
        <button
          onClick={onClose}
          className="w-[30px] h-[30px] rounded-full flex items-center justify-center transition-colors hover:bg-casa-bg"
          style={{ color: S.label }}
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {eyebrow && (
        <div className="flex items-center gap-2 mt-3.5">
          <span className="w-[9px] h-[9px] rounded-full" style={{ background: accent }} />
          <span className="text-[11px] font-bold uppercase" style={{ color: S.eyebrow, letterSpacing: '0.13em' }}>{eyebrow}</span>
        </div>
      )}

      <h2 className="event-command-center-title mt-1.5" style={{ ...serif, fontWeight: 600, letterSpacing: '-0.01em', color: S.navy }}>
        {event.title.includes(' | ') ? event.title.split(' | ').slice(1).join(' | ') : event.title}
      </h2>
      <div className="flex items-center gap-2 mt-2 text-[14px]" style={{ color: S.muted }}>
        <span className="font-semibold" style={{ color: S.navy }}>{headerWhen}</span>
        <span>·</span>
        <span>{headerDuration}</span>
      </div>

      {!reminder && event.members?.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] font-bold uppercase mb-2" style={{ color: S.label, letterSpacing: '0.12em' }}>
            {hostedAtHome ? 'At home' : 'Going'}
          </div>
          <MemberEditor event={event} />
        </div>
      )}

      {!reminder && mode !== 'hosted' && (
        <DestinationHeaderCard
          locationName={event.location_name}
          address={event.address}
          verified={verified}
          atHome={hostedAtHome}
          onCheckAddress={onEdit}
          accent={accent}
        />
      )}
    </div>
  )
}


/* ── Body: block-engine command center ─────────────────────── */

function PanelBody({
  event,
  verified,
  modeOverride,
  waitsOverride,
  driverOverrides,
  twoDriverConfirmed,
  onSetWaitsOverride,
  onSetDriverOverride,
  onSetModeOverride,
  onSetTwoDriverConfirmed,
  onSetVerifiedOverride,
  onEdit,
}: {
  event: EventWithDetails
  verified: boolean
  modeOverride: EventMode | null
  waitsOverride: boolean | null
  driverOverrides: Record<number, string>
  twoDriverConfirmed: boolean
  onSetWaitsOverride: (value: boolean | null) => void
  onSetDriverOverride: (legIndex: number, driverId: string) => void
  onSetModeOverride: (mode: EventMode | null) => void
  onSetTwoDriverConfirmed: (value: boolean) => void
  onSetVerifiedOverride: (value: boolean | null) => void
  onEdit: () => void
}) {
  return (
    <StandardPanelBody
      event={event}
      verified={verified}
      modeOverride={modeOverride}
      waitsOverride={waitsOverride}
      driverOverrides={driverOverrides}
      twoDriverConfirmed={twoDriverConfirmed}
      onSetWaitsOverride={onSetWaitsOverride}
      onSetDriverOverride={onSetDriverOverride}
      onSetModeOverride={onSetModeOverride}
      onSetTwoDriverConfirmed={onSetTwoDriverConfirmed}
      onSetVerifiedOverride={onSetVerifiedOverride}
      onEdit={onEdit}
    />
  )
}


function StandardPanelBody({
  event,
  verified,
  modeOverride,
  waitsOverride,
  driverOverrides,
  twoDriverConfirmed,
  onSetWaitsOverride,
  onSetDriverOverride,
  onSetModeOverride,
  onSetTwoDriverConfirmed,
  onSetVerifiedOverride,
  onEdit,
}: {
  event: EventWithDetails
  verified: boolean
  modeOverride: EventMode | null
  waitsOverride: boolean | null
  driverOverrides: Record<number, string>
  twoDriverConfirmed: boolean
  onSetWaitsOverride: (value: boolean | null) => void
  onSetDriverOverride: (legIndex: number, driverId: string) => void
  onSetModeOverride: (mode: EventMode | null) => void
  onSetTwoDriverConfirmed: (value: boolean) => void
  onSetVerifiedOverride: (value: boolean | null) => void
  onEdit: () => void
}) {
  const enr = event.enrichment
  const reminder = event.event_type === 'reminder'
  const mode = modeOverride ?? inferEventMode(event)
  const showTravelLocation = mode !== 'hosted'
  const hasChecklist = event.checklist?.length > 0
  const activeFields = getFieldsForCategory(enr?.category)
  const shows = (field: string) => activeFields.includes(field as ReturnType<typeof getFieldsForCategory>[number])
  const hasText = (value: unknown) => {
    if (typeof value === 'string') return value.trim() !== ''
    return value !== null && value !== undefined
  }
  const { data: household = [] } = useFamilyMembers()
  const queryClient = useQueryClient()
  const { data: dayEvents = [] } = useTodayEvents(getEventDisplayStartDay(event))
  const availability = useMemberAvailability(household.map((member) => member.id))

  const commuteDestination = event.address ?? event.location_name ?? null
  const msUntilStart = new Date(event.start_time).getTime() - Date.now()
  const etaRefetchIntervalMs =
    !verified
      ? false
      : msUntilStart <= 90 * 60_000
        ? 60_000
        : msUntilStart <= 6 * 60 * 60_000
          ? 5 * 60_000
          : false
  const commuteQuery = useTravelEta({
    destination: commuteDestination,
    eventStartIso: event.start_time,
    enabled: !reminder && showTravelLocation && verified && Boolean(commuteDestination),
    bufferMins: 10,
    refetchIntervalMs: etaRefetchIntervalMs,
  })
  const liveWeatherQuery = useQuery({
    queryKey: ['event-weather', event.id, verified],
    enabled: !reminder && showTravelLocation && verified && Boolean(commuteDestination),
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
  const hasDestination = Boolean(event.location_name || event.address)

  const plan = reminder ? null : derivePlan(event, mode, {
    household,
    eta: verified ? commuteQuery.data : null,
    verified,
  })
  const eventStartMs = new Date(event.start_time).getTime()
  const parsedEventEndMs = new Date(event.end_time).getTime()
  const eventEndMs = Number.isNaN(parsedEventEndMs) ? eventStartMs + (60 * 60 * 1000) : parsedEventEndMs
  const driveWindowStartIso = (verified
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
  const showMeanwhile = mode !== 'hosted' && caregiversAway && coverageRows.length > 0

  return (
    <div className="event-command-center-content p-6 space-y-5">
      {/* ── The Plan ── */}
      {plan && (
        <section>
          <PlanBlock
            plan={plan}
            loading={verified && commuteQuery.isLoading && !commuteQuery.data}
            driverPool={driverPool}
            waitsOverride={waitsOverride}
            driverOverrides={driverOverrides}
            modeOverride={modeOverride}
            twoDriverConfirmed={twoDriverConfirmed}
            onSetWaitsOverride={onSetWaitsOverride}
            onSetDriverOverride={onSetDriverOverride}
            onSetModeOverride={onSetModeOverride}
            onSetTwoDriverConfirmed={onSetTwoDriverConfirmed}
          />
        </section>
      )}

      {!reminder && hasDestination && mode !== 'hosted' && (
        <DepartureRiskBanner event={event} travelEta={verified ? commuteQuery.data : null} />
      )}

      {/* ── Where (map + weather + verify state) ── */}
      {!reminder && showTravelLocation && (
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
            onEditAddress={() => {
              onSetVerifiedOverride(false)
              queryClient.removeQueries({ queryKey: ['travel-eta'] })
              onEdit()
            }}
            onConfirmAddress={() => onSetVerifiedOverride(true)}
            verified={verified}
            mode={mode}
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
                <span className="w-[30px] h-[30px] rounded-full text-white text-[12px] font-bold inline-flex items-center justify-center" style={{ background: row.color }}>
                  {row.initial}
                </span>
                <span className="flex-1 text-[14px] font-semibold" style={{ color: S.navy }}>{row.name}</span>
                <span className="text-[13px]" style={{ color: S.muted }}>{row.status}</span>
                <span className="text-[13px]" style={{ color: row.ok ? S.green : S.goldText }}>{row.ok ? '✓' : '•'}</span>
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

function DestinationHeaderCard({ locationName, address, verified, atHome, onCheckAddress, accent }: {
  locationName: string | null
  address: string | null
  verified: boolean
  atHome: boolean
  onCheckAddress?: () => void
  accent: string
}) {
  const hasDestination = Boolean(locationName || address)
  const headline = locationName ?? (atHome ? 'Home' : 'Destination needed')
  const subline = address ?? (!atHome ? 'Add an address to unlock live drive times.' : null)
  const border = verified ? hexToRgba(S.greenHex, 0.28) : S.amberBorder
  const bg = verified ? S.greenBg : S.amberBg
  return (
    <div className="mt-4 flex items-center gap-3 rounded-xl px-3 py-2.5" style={{ border: `1px solid ${border}`, background: bg }}>
      <span
        className="flex-none w-[26px] h-[26px] rounded-lg flex items-center justify-center bg-white"
        style={{ border: `1px solid ${S.borderSoft}`, color: accent }}
      >
        <MapPin size={14} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-bold leading-tight truncate" style={{ color: S.navy }}>{headline}</div>
        {subline && <div className="text-[12px] truncate" style={{ color: S.muted }}>{subline}</div>}
      </div>
      {verified ? (
        <span className="flex-none text-[12px] font-bold rounded-pill px-2.5 py-1.5 inline-flex items-center gap-1" style={{ color: S.green, background: 'var(--color-casa-surface)' }}>
          ✓ Confirmed
        </span>
      ) : atHome ? (
        <span className="flex-none text-[12px] font-bold rounded-pill px-2.5 py-1.5" style={{ color: S.muted, background: 'var(--color-casa-surface)' }}>
          At home
        </span>
      ) : (
        <button
          onClick={onCheckAddress}
          className="flex-none text-[12px] font-bold rounded-pill px-2.5 py-1.5"
          style={{ color: S.goldText, background: 'var(--color-casa-surface)' }}
        >
          {hasDestination ? 'Check address ›' : 'Add destination'}
        </button>
      )}
    </div>
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
    <span className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>
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
    <div className={cn('relative shrink-0', open ? 'z-[95]' : 'z-10')} ref={pickerRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        type="button"
        className="min-h-[44px] inline-flex items-center gap-1.5 rounded-pill pl-2 pr-3 py-1 text-[13px] font-semibold"
        style={{ border: `1px dashed ${S.borderMed}`, color: S.navy }}
      >
        <span className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[11px] font-bold" style={{ backgroundColor: driver.color }}>
          {driver.initial}
        </span>
        {driver.name}
        <ChevronRight size={13} className={cn('ml-0.5 transition-transform', open && 'rotate-90')} />
      </button>
      <AnimatePresence>
        {open && options.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className="absolute right-0 top-[calc(100%+6px)] z-[80] min-w-[230px] max-h-[min(50vh,280px)] overflow-y-auto overscroll-contain rounded-xl border bg-white p-1.5 shadow-[0_12px_28px_rgba(6,10,36,0.16)]"
            style={{ borderColor: S.borderSoft }}
          >
            {sortedOptions.map((option) => {
              const selected = option.id === driver.id
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => {
                    if (option.conflictWith && option.id !== driver.id) {
                      const ok = window.confirm(`${option.name} is already assigned to "${option.conflictWith}" during this time. Assign anyway?`)
                      if (!ok) return
                    }
                    onSelectDriver?.(option.id)
                    setOpen(false)
                  }}
                  className="w-full min-h-[44px] rounded-lg px-2.5 py-1.5 flex items-center gap-2 text-left hover:bg-casa-bg"
                  style={selected ? { background: S.coverFill } : option.conflictWith ? { background: S.amberBg } : undefined}
                >
                  <span className="w-6 h-6 rounded-full text-white text-[11px] font-bold inline-flex items-center justify-center" style={{ background: option.color }}>
                    {option.initial}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold" style={{ color: S.navy }}>{option.name}</span>
                    {option.conflictWith && !selected && (
                      <span className="block truncate text-[11px]" style={{ color: S.goldText }}>
                        Busy: {option.conflictWith}
                      </span>
                    )}
                  </span>
                  {option.conflictWith && !selected && (
                    <span className="text-[10px] font-bold uppercase" style={{ color: S.goldText, letterSpacing: '0.06em' }}>Busy</span>
                  )}
                  {selected && <Check size={14} style={{ color: S.green }} />}
                </button>
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
    kind === 'drop' || kind === 'depart' ? { color: S.navy, halo: hexToRgba(S.navyHex, 0.12) }
    : kind === 'stay' || kind === 'host' ? { color: S.gold, halo: hexToRgba(S.goldHex, 0.18) }
    : { color: S.green, halo: hexToRgba(S.greenHex, 0.15) }
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
          <p className="text-[10px] font-bold uppercase" style={{ color: S.planLabel, letterSpacing: '0.12em' }}>The Plan</p>
          {plan.headline && <p className="truncate mt-0.5" style={{ ...serif, fontSize: 18, fontWeight: 600, color: 'var(--color-casa-surface)' }}>{plan.headline}</p>}
        </div>
        <div ref={modePickerRef} className="relative shrink-0">
          <button
            type="button"
            onClick={() => setModeMenuOpen((open) => !open)}
            className="inline-flex items-center gap-1.5 rounded-pill bg-white/10 px-2.5 py-1 text-[11px] font-bold text-white"
            aria-expanded={modeMenuOpen}
            aria-haspopup="dialog"
            aria-label="Open mode options"
          >
            {effective.pattern}
            <span className="text-[9px] font-bold rounded-pill px-1.5 py-px" style={{ color: 'var(--color-casa-text)', background: S.goldBadge }}>
              {modeOverride ? 'MANUAL' : 'AUTO'}
            </span>
            <ChevronRight size={12} className={cn('transition-transform', modeMenuOpen && 'rotate-90')} />
          </button>
          {modeMenuOpen && (
            <div
              role="dialog"
              aria-label="Mode options"
              className="absolute right-0 top-[calc(100%+8px)] z-20 w-[320px] max-w-[calc(100vw-48px)] rounded-xl p-3"
              style={{ background: 'var(--color-casa-surface)', border: `1px solid ${S.borderMed}`, boxShadow: '0 18px 34px rgba(27,42,74,0.18)' }}
            >
              <p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.08em' }}>
                Mode
              </p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {MODE_OVERRIDE_OPTIONS.map((option) => {
                  const selected = selectedMode === option.value
                  return (
                    <button
                      key={option.value}
                      type="button"
                      className="min-h-[42px] rounded-pill px-3 text-[12px] font-bold inline-flex items-center justify-center gap-1.5 transition-colors"
                      style={selected
                        ? { background: S.navy, color: 'var(--color-casa-surface)' }
                        : { background: S.chipFill, color: S.navy, border: `1px solid ${S.borderSoft}` }}
                      onClick={() => {
                        onSetModeOverride(option.value === 'auto' ? null : option.value)
                        setModeMenuOpen(false)
                      }}
                      aria-pressed={selected}
                    >
                      {option.label}
                      {option.helper && (
                        <span
                          className="rounded-pill px-1.5 py-px text-[9px] font-bold uppercase"
                          style={selected
                            ? { background: 'rgba(255,255,255,0.18)', color: 'var(--color-casa-surface)' }
                            : { background: S.goldBadge, color: 'var(--color-casa-text)' }}
                        >
                          {option.helper}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              {!modeOverride && (
                <p className="mt-2 text-[11px]" style={{ color: S.muted }}>
                  Auto is active and should improve as Casa learns your routines.
                </p>
              )}
              {modeOverride && (
                <p className="mt-2 text-[11px]" style={{ color: S.goldText }}>
                  Manual mode override is active.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="px-[18px] pt-2 text-[11px]" style={{ color: S.label }}>Tap a driver to reassign →</div>
      <div className="px-[18px] pb-2">
        <ol>
          {renderedLegs.map((leg, i) => {
            const driverId = leg.driver?.id
            return (
              <li key={i} className="flex items-center gap-3.5 py-3" style={i > 0 ? { borderTop: `1px solid ${S.hair}` } : undefined}>
                <span className="flex-none w-3 h-3 rounded-full" style={{ background: legDot(leg.kind).color, boxShadow: `0 0 0 4px ${legDot(leg.kind).halo}` }} />
                <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-bold leading-tight" style={{ color: S.navy }}>{leg.title}</p>
                    {leg.detail && <p className="text-[12px] mt-0.5" style={{ color: S.muted }}>{leg.detail}</p>}
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
          <p className="text-[12px] mt-2 flex items-center gap-1.5" style={{ color: S.label }}>
            <Loader2 size={12} className="animate-spin" /> Calculating drive times…
          </p>
        )}

        {renderedLegs.some((l) => l.estimate) && (
          <div className="mt-3 rounded-lg px-3 py-2.5 text-[12px]" style={{ color: S.goldText, background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            ⚠ Drive times are <strong>estimates</strong> until you confirm the address above.
          </div>
        )}

        {plan.mode === 'appointment' && renderedLegs.some((l) => l.kind === 'stay') && (
          <button
            type="button"
            onClick={() => onSetWaitsOverride(!waits)}
            className="mt-3 min-h-[44px] w-full rounded-[10px] px-3 py-2.5 flex items-center justify-between gap-3 text-[13px] font-semibold"
            style={{ color: S.navy, border: `1px solid ${S.borderSoft}`, background: S.chipFill }}
          >
            <span className="text-left">Someone waits on site</span>
            <span className="inline-flex w-[40px] h-[22px] rounded-pill p-0.5 shrink-0" style={{ background: waits ? S.green : hexToRgba(S.navyHex, 0.22) }}>
              <span
                className="block w-[18px] h-[18px] rounded-full bg-white shadow"
                style={{ transform: waits ? 'translateX(18px)' : 'translateX(0px)', transition: 'transform 180ms ease' }}
              />
            </span>
          </button>
        )}

        {effective.twoDrivers && (
          <div className="mt-3 rounded-lg px-3 py-2.5 text-[12px] flex items-center gap-2" style={{ color: S.goldText, background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            <strong>Two drivers</strong> — {twoDriverConfirmed ? 'assignments locked in.' : 'both need to be locked in.'}
            <button
              className="ml-auto underline font-bold"
              onClick={() => onSetTwoDriverConfirmed(true)}
              type="button"
            >
              {twoDriverConfirmed ? 'Locked' : 'Confirm'}
            </button>
          </div>
        )}

        {effective.yourTime && (
          <div className="mt-3 rounded-lg px-3 py-2" style={{ background: S.yourTimeFill }}>
            <p className="text-[13px]" style={{ color: S.navy }}>
              <span className="font-bold">Your time:</span> {effective.yourTime}
            </p>
          </div>
        )}
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
        <p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Contact</p>
        <p className="text-[14px] mt-1" style={{ color: S.navy }}>
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
        <p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Cost</p>
        <p className="text-[14px] mt-1" style={{ color: S.navy }}>{source?.cost_estimate}</p>
      </div>,
    )
  }
  if (hasText(source?.outfit_suggestion)) {
    rows.push(<div key="outfit"><p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>What to wear</p><p className="text-[14px] mt-1" style={{ color: S.muted }}>{source?.outfit_suggestion}</p></div>)
  }
  if (hasText(source?.dietary_notes)) {
    rows.push(<div key="diet"><p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Dietary notes</p><p className="text-[14px] mt-1" style={{ color: S.muted }}>{source?.dietary_notes}</p></div>)
  }
  if (hasText(source?.meal_impact)) {
    rows.push(
      <div key="meal">
        <p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Meal impact</p>
        <p className="text-[14px] mt-1" style={{ color: S.muted }}>{source?.meal_impact}</p>
      </div>,
    )
  }
  if (hasText(source?.prep_notes)) {
    rows.push(<div key="notes"><p className="text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Notes</p><p className="text-[14px] mt-1 whitespace-pre-line leading-relaxed" style={{ color: S.muted }}>{source?.prep_notes}</p></div>)
  }
  if (actions.length > 0) {
    rows.push(
      <div key="actions">
        <p className="text-[11px] font-bold uppercase mb-1.5" style={{ color: S.label, letterSpacing: '0.1em' }}>Prep lane</p>
        <ActionItemsSection items={actions} />
      </div>,
    )
  }
  if (logistics.length > 0) {
    rows.push(
      <div key="logistics">
        <p className="text-[11px] font-bold uppercase mb-1.5" style={{ color: S.label, letterSpacing: '0.1em' }}>Logistics</p>
        <LogisticsSection items={logistics} />
      </div>,
    )
  }

  return (
    <section className="pt-1">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center justify-between w-full text-left py-2.5"
        style={{ borderTop: `1px solid ${S.borderMed}` }}
      >
        <span>
          <span className="block text-[11px] font-bold uppercase" style={{ color: S.label, letterSpacing: '0.1em' }}>Reference</span>
          <span className="block text-[12px]" style={{ color: S.muted }}>Contact, cost, notes</span>
        </span>
        <ChevronRight size={16} className={cn('transition-transform', open && 'rotate-90')} style={{ color: S.label }} />
      </button>
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
                <p className="text-[13px]" style={{ color: S.label }}>No reference details yet.</p>
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
              <span className="flex-none w-[22px] h-[22px] rounded-md" style={{ border: `2px solid ${hexToRgba(S.navyHex, 0.25)}` }} />
            )}
            <span className="text-[14px]" style={{ color: checked ? S.label : S.navy, textDecoration: checked ? 'line-through' : 'none' }}>
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
              <span className="flex-none w-[22px] h-[22px] rounded-md" style={{ border: `2px solid ${hexToRgba(S.navyHex, 0.25)}` }} />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[14px]" style={{ color: completed ? S.label : S.navy, textDecoration: completed ? 'line-through' : 'none' }}>
                {item.title}
              </p>
              {item.description && (
                <p className="text-[12px]" style={{ color: S.muted }}>
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
            <span className="mt-1 w-2.5 h-2.5 rounded-full" style={{ background: hexToRgba(S.navyHex, 0.6) }} />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold" style={{ color: S.navy }}>{item.title}</p>
              {(item.time || item.location_name) && (
                <p className="text-[12px]" style={{ color: S.muted }}>
                  {[item.time, item.location_name].filter(Boolean).join(' · ')}
                </p>
              )}
              {item.description && (
                <p className="text-[12px] mt-0.5" style={{ color: S.muted }}>{item.description}</p>
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
              <span className="flex-none w-[22px] h-[22px] rounded-md" style={{ border: `2px solid ${hexToRgba(S.navyHex, 0.25)}` }} />
            )}
            <span className="text-[14px]" style={{ color: isChecked ? S.label : S.navy, textDecoration: isChecked ? 'line-through' : 'none' }}>
              {item}
            </span>
          </div>
        )
      })}
    </div>
  )
}

/* ── LocationBlock ──────────────────────────────────────────── */

function LocationBlock({ eventId, locationName, address, lat, lng, parkingNotes, contactPhone, weatherAtVenue, onEditAddress, onConfirmAddress, verified, mode, accent }: {
  eventId: string
  locationName: string | null
  address: string | null
  lat: number | null
  lng: number | null
  parkingNotes?: string | null
  contactPhone?: string | null
  weatherAtVenue?: string | null
  onEditAddress: () => void
  onConfirmAddress: () => void
  verified: boolean
  mode: EventMode
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
  const effectiveLocationName = locationName ?? (mode === 'hosted' && homeAddress ? 'Home' : null)
  const effectiveAddress = address ?? (mode === 'hosted' ? homeAddress : null)
  const sourceHasDestination = Boolean(locationName || address)

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

  const verifyBorder = verified ? S.borderMed : S.amberBorder
  const title = effectiveLocationName ?? effectiveAddress ?? (mode === 'hosted' ? 'Home' : 'Destination needed')
  const subtitle = hasDestination
    ? [effectiveAddress, parkingNotes].filter(Boolean).join(' · ')
    : mode === 'hosted'
      ? 'Hosted at home — no driving required.'
      : 'Add an address to unlock live drive times.'

  return (
    <div className="rounded-[14px] overflow-hidden" style={{ border: `1px solid ${verifyBorder}` }}>
      <div style={{ height: 104, background: 'linear-gradient(135deg,#DCE6DA,#C9DBD9)' }} className="relative overflow-hidden">
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
            <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-pill px-3 py-1.5" style={{ background: 'var(--color-casa-surface)', color: S.navy }}>
              <Loader2 size={12} className="animate-spin" /> Resolving map snapshot…
            </span>
          </div>
        )}
        {weatherAtVenue && (
          <div className="absolute left-3 top-2.5 text-[11px] rounded-md px-2 py-0.5" style={{ background: 'rgba(255,255,255,.85)', color: S.muted }}>
            {weatherAtVenue}
          </div>
        )}
      </div>
      <div className="p-4">
        <div className="text-[15px] font-bold" style={{ color: S.navy }}>{title}</div>
        {subtitle && (
          <div className="text-[13px] mt-0.5" style={{ color: S.muted }}>
            {subtitle}
          </div>
        )}
        {needsGeocode && geocodeState === 'error' && (
          <div className="mt-2 rounded-lg px-3 py-2 text-[12px]" style={{ background: S.amberBg, border: `1px solid ${S.amberBorder}`, color: S.goldText }}>
            Map snapshot unavailable for this address.
            <button
              type="button"
              className="ml-2 underline font-semibold"
              onClick={() => setGeocodeState('idle')}
            >
              Retry
            </button>
          </div>
        )}
        {verified && hasDestination ? (
          <div className="mt-3 text-[12px] font-semibold flex items-center gap-1.5" style={{ color: S.green }}>
            <Check size={13} /> Address confirmed · drive times are live
          </div>
        ) : !hasDestination && mode !== 'hosted' ? (
          <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            <div className="text-[13px] font-bold" style={{ color: S.goldText }}>Missing destination</div>
            <div className="text-[12px] mt-0.5" style={{ color: S.muted }}>Add an address before we calculate travel and leave times.</div>
            <div className="flex gap-2 mt-2.5">
              <button onClick={onEditAddress} className="text-[12px] font-bold rounded-pill px-3.5 py-1.5" style={{ color: S.goldText, border: `1px solid ${S.goldBadge}` }}>
                Add address
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-3 rounded-lg px-3 py-2.5" style={{ background: S.amberBg, border: `1px solid ${S.amberBorder}` }}>
            <div className="text-[13px] font-bold" style={{ color: S.goldText }}>Is this the right place?</div>
            <div className="text-[12px] mt-0.5" style={{ color: S.muted }}>Confirm the pin before we trust the drive time.</div>
            <div className="flex gap-2 mt-2.5">
              <button onClick={onConfirmAddress} className="text-[12px] font-bold rounded-pill px-3.5 py-1.5 text-white" style={{ background: S.green }}>
                Yes, confirm
              </button>
              <button onClick={onEditAddress} className="text-[12px] font-bold rounded-pill px-3.5 py-1.5" style={{ color: S.goldText, border: `1px solid ${S.goldBadge}` }}>
                Edit address
              </button>
            </div>
          </div>
        )}
        <div className="flex gap-2 mt-3">
          {googleMapsUrl && (
            <a
              href={googleMapsUrl}
              target="_blank"
              rel="noreferrer"
              className="flex-1 text-center py-2.5 rounded-[10px] text-[14px] font-semibold inline-flex items-center justify-center gap-1.5 text-white"
              style={{ background: S.navy }}
            >
              <Navigation size={14} />
              {mode === 'pickup' ? 'Navigate to car line' : 'Navigate'}
            </a>
          )}
          {callUrl && (
            <a
              href={callUrl}
              className="flex-1 text-center py-2.5 rounded-[10px] text-[14px] font-semibold inline-flex items-center justify-center"
              style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
            >
              Call
            </a>
          )}
          {!googleMapsUrl && mode !== 'hosted' && (
            <button
              onClick={onEditAddress}
              className="flex-1 text-center py-2.5 rounded-[10px] text-[14px] font-semibold"
              style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
            >
              Add destination
            </button>
          )}
        </div>
        {hasDestination && (
          <div className="mt-2">
            <button
              onClick={handleSave}
              disabled={isAlreadySaved || saving}
              className="w-full text-center py-2 rounded-[10px] text-[13px] font-semibold"
              style={{ border: `1px solid ${S.borderMed}`, color: isAlreadySaved ? S.gold : S.navy, opacity: isAlreadySaved ? 0.8 : 1 }}
            >
              {isAlreadySaved ? 'Saved place' : saving ? 'Saving…' : 'Save place'}
            </button>
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
    <div className="flex-none flex items-center gap-2.5 px-5 py-3.5 bg-white" style={{ borderTop: `1px solid ${S.borderMed}` }}>
      <button
        onClick={onEdit}
        title="Edit details"
        className="w-11 h-11 rounded-xl flex items-center justify-center transition-colors hover:bg-casa-bg"
        style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
      >
        <Pencil size={16} />
      </button>
      {primaryHref && (
        <a
          href={primaryHref}
          target="_blank"
          rel="noreferrer"
          className="flex-1 text-center py-3 rounded-xl text-[15px] font-bold inline-flex items-center justify-center gap-2"
          style={{ background: S.gold, color: S.navy }}
        >
          {primaryIcon}
          {primaryLabel}
        </a>
      )}
      {secondaryHref ? (
        <a
          href={secondaryHref}
          className="px-4 h-11 rounded-xl text-[14px] font-semibold inline-flex items-center gap-2"
          style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
        >
          {secondaryIcon}
          {secondaryLabel}
        </a>
      ) : (
        <button
          onClick={handleShare}
          className="px-4 h-11 rounded-xl text-[14px] font-semibold inline-flex items-center gap-2"
          style={{ border: `1px solid ${S.borderMed}`, color: S.navy }}
        >
          {secondaryIcon}
          {secondaryLabel}
        </button>
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
