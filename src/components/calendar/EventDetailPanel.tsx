import { useState, useEffect, useRef } from 'react'
import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, MapPin, Clock, Cloud, AlertTriangle,
  Pencil, Navigation, Share2, CheckSquare, Square,
  Phone, DollarSign, Utensils, ChevronRight, Sparkles,
  Plane, Loader2, ExternalLink, Paperclip,
  Home, Hotel, Hash, DoorOpen, Armchair, Luggage, Users,
  Sun, CloudRain, CloudSnow, Wind,
  Crown, Plus,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { cn } from '../../utils/cn'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import type { EventChecklistItem } from '../../types'
import { getFieldsForCategory, CATEGORY_LABEL } from './categoryFields'
import EventEditSheet from './EventEditSheet'
import type { Trip } from '../../hooks/useTrips'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'

const CONFIDENCE_CONFIG = {
  high:   { color: '#22c55e', label: 'High confidence', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  medium: { color: '#f59e0b', label: 'Needs review',    bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200'   },
  low:    { color: '#ef4444', label: 'Needs attention', bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200'     },
}

interface EventDetailPanelProps {
  event: EventWithDetails | null
  onClose: () => void
}

function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth < 768)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)')
    const handler = (e: MediaQueryListEvent) => setMobile(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return mobile
}

export default function EventDetailPanel({ event, onClose }: EventDetailPanelProps) {
  const [showEdit, setShowEdit] = useState(false)
  const isMobile = useIsMobile()

  return (
    <>
      <AnimatePresence>
        {event && (
          <>
            {isMobile && (
              <motion.div
                key="backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="fixed inset-0 bg-black/40 z-[54]"
                onClick={onClose}
              />
            )}
            {isMobile ? (
              <motion.div
                key="panel"
                initial={{ y: '100%' }}
                animate={{ y: 0 }}
                exit={{ y: '100%' }}
                transition={{ type: 'tween', duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
                drag="y"
                dragConstraints={{ top: 0 }}
                dragElastic={{ top: 0, bottom: 0.15 }}
                dragMomentum={false}
                onDragEnd={(_e, info) => {
                  if (info.velocity.y > 300 || info.offset.y > 140) onClose()
                }}
                style={{ willChange: 'transform', touchAction: 'none' }}
                className="fixed inset-x-0 bottom-0 top-[5vh] bg-casa-surface rounded-t-2xl shadow-[0_-8px_40px_rgba(0,0,0,0.18)] z-[55] flex flex-col cursor-grab active:cursor-grabbing"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                  <div className="w-9 h-1 bg-casa-divider rounded-full" />
                </div>
                <PanelHeader event={event} onClose={onClose} />
                <PanelBody event={event} />
                <PanelFooter event={event} onEdit={() => setShowEdit(true)} />
              </motion.div>
            ) : (
              <motion.div
                key="panel"
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 30, stiffness: 180 }}
                className="fixed top-0 right-0 h-full w-[420px] bg-casa-surface border-l border-casa-border shadow-modal z-[55] flex flex-col"
                onClick={e => e.stopPropagation()}
              >
                <PanelHeader event={event} onClose={onClose} />
                <PanelBody event={event} />
                <PanelFooter event={event} onEdit={() => setShowEdit(true)} />
              </motion.div>
            )}
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
    <div className="flex flex-wrap items-center gap-2 mt-3 relative">
      {sorted.map((m) => {
        const isPrimary = m.role === 'primary'
        const isLoading = saving === m.id || saving === m.family_member?.id
        return (
          <div
            key={m.id}
            className="flex items-center gap-1 pl-2 pr-1 py-1 rounded-pill text-white text-caption font-semibold transition-opacity"
            style={{ backgroundColor: m.family_member?.color_hex ?? '#888', opacity: isLoading ? 0.6 : 1 }}
          >
            {/* Initial circle */}
            <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[9px] font-bold shrink-0">
              {m.family_member?.name?.[0]}
            </span>
            <span>{m.family_member?.name}</span>

            {/* Crown: shown on primary (to indicate), clickable on non-primary to promote */}
            {!isPrimary && (
              <button
                onClick={() => makeOwner(m.family_member!.id)}
                className="ml-0.5 w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                title="Make primary"
              >
                <Crown size={11} />
              </button>
            )}
            {isPrimary && (
              <span className="ml-0.5 w-5 h-5 flex items-center justify-center opacity-80" title="Primary">
                <Crown size={11} />
              </span>
            )}

            {/* Remove — always available (even primary, just can't remove last person) */}
            {event.members.length > 1 || !isPrimary ? (
              <button
                onClick={() => removeMember(m.id)}
                className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors"
                title="Remove"
              >
                <X size={11} />
              </button>
            ) : null}
          </div>
        )
      })}

      {/* Add button */}
      <div className="relative" ref={pickerRef}>
        <button
          onClick={() => setShowPicker(p => !p)}
          className="flex items-center gap-1 px-2.5 py-1 rounded-pill border-2 border-dashed border-casa-border text-casa-muted text-caption font-semibold hover:border-casa-gold hover:text-casa-gold transition-colors"
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
              className="absolute top-full mt-1.5 left-0 z-20 bg-casa-surface border border-casa-border rounded-card shadow-modal p-2 flex flex-col gap-1 min-w-[140px]"
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
                      className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0"
                      style={{ backgroundColor: fm.color_hex ?? '#888' }}
                    >
                      {fm.name?.[0]}
                    </span>
                    <span className="text-body-sm font-medium text-casa-navy">{fm.name}</span>
                  </button>
                ))}
              {allMembers.filter(fm => !assignedIds.has(fm.id)).length === 0 && (
                <p className="text-caption text-casa-muted px-2 py-1">Everyone's added</p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Header ─────────────────────────────────────────────────── */

function PanelHeader({ event, onClose }: { event: EventWithDetails; onClose: () => void }) {
  const primaryColor = event.members[0]?.family_member?.color_hex ?? '#C9A96E'
  const urgentAction = event.actions?.find((a) => a.is_urgent && !a.completed)
  const confidence = event.enrichment?.confidence as keyof typeof CONFIDENCE_CONFIG | undefined
  const conf = confidence ? CONFIDENCE_CONFIG[confidence] : null
  const category = event.enrichment?.category

  return (
    <div className="border-b border-casa-border">
      <div className="h-1 w-full" style={{ backgroundColor: primaryColor }} />

      <div className="p-6 pb-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-casa-muted hover:text-casa-navy rounded-full hover:bg-casa-divider transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="font-display text-display-md text-casa-navy pr-8 mb-1 leading-tight">
          {event.title}
        </h2>
        <p className="text-body text-casa-muted">
          {format(new Date(event.start_time), 'EEEE, MMMM d')}
          {' · '}
          {format(new Date(event.start_time), 'h:mm a')} – {format(new Date(event.end_time), 'h:mm a')}
        </p>

        {/* Confidence + category pills */}
        <div className="flex items-center flex-wrap gap-2 mt-3">
          {category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-caption font-semibold bg-casa-bg border border-casa-border text-casa-muted capitalize">
              {CATEGORY_LABEL[category] ?? category}
            </span>
          )}
          {conf && (
            <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-caption font-semibold border', conf.bg, conf.text, conf.border)}>
              <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: conf.color }} />
              {conf.label}
            </span>
          )}
        </div>

        {/* Inline member editor — tap × to remove, crown to promote, + to add */}
        <MemberEditor event={event} />

        {/* Urgent action banner */}
        {urgentAction && (
          <div className="mt-3 flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-card">
            <AlertTriangle size={15} className="text-casa-warning shrink-0 mt-0.5" />
            <div>
              <p className="text-body-sm font-semibold text-casa-text">{urgentAction.title}</p>
              {urgentAction.description && (
                <p className="text-caption text-casa-muted mt-0.5">{urgentAction.description}</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Travel Intelligence Banner ─────────────────────────────── */

const TRAVEL_CATEGORIES = ['travel', 'work']

// ── Trip helpers ─────────────────────────────────────────────────────────────

// Trip timestamps are stored as nominal local times (e.g. 07:04:00Z = "7:04 AM").
// We intentionally parse the digits directly — never apply UTC→local conversion.
function parseNominalISO(iso: string): { h: number; m: number; date: Date } {
  // "2026-06-02T07:04:00Z" or "2026-06-02T07:04:00-04:00" → always read the literal digits
  const [datePart, timePart] = iso.split('T')
  const [year, month, day] = datePart.split('-').map(Number)
  const timeDigits = timePart.replace(/[Z+-].*$/, '')  // strip offset suffix
  const [hour, min] = timeDigits.split(':').map(Number)
  return { h: hour, m: min, date: new Date(year, month - 1, day) }
}

function fmtTripTime(iso: string | null): string {
  if (!iso) return '—'
  if (!iso.includes('T')) return format(new Date(iso), 'h:mm a')
  const { h, m } = parseNominalISO(iso)
  const d = new Date(2000, 0, 1, h, m)
  return format(d, 'h:mm a')
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  // Date-only strings (no T) are fine to parse directly
  if (!iso.includes('T')) return format(new Date(iso + 'T12:00:00'), 'MMM d')
  const { date } = parseNominalISO(iso)
  return format(date, 'MMM d')
}

function flightDuration(dep: string | null, arr: string | null): string {
  if (!dep || !arr) return ''
  const toMins = (iso: string) => {
    const { h, m } = parseNominalISO(iso)
    return h * 60 + m
  }
  const mins = Math.round(toMins(arr) - toMins(dep))
  const absMins = Math.abs(mins)
  const h = Math.floor(absMins / 60); const mm = absMins % 60
  return h > 0 ? `${h}h ${mm}m` : `${mm}m`
}

function subtractMinutes(iso: string | null, mins: number): string | null {
  if (!iso || !iso.includes('T')) return iso
  const { h, m } = parseNominalISO(iso)
  const total = h * 60 + m - mins
  const newH = Math.floor(((total % 1440) + 1440) % 1440 / 60)
  const newM = ((total % 60) + 60) % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  const datePart = iso.split('T')[0]
  return `${datePart}T${pad(newH)}:${pad(newM)}:00Z`
}

function tripWeatherIcon(condition: string): React.ReactNode {
  const c = condition.toLowerCase()
  if (c.includes('snow')) return <CloudSnow size={16} className="text-blue-300" />
  if (c.includes('rain') || c.includes('drizzle')) return <CloudRain size={16} className="text-blue-400" />
  if (c.includes('cloud')) return <Cloud size={16} className="text-gray-400" />
  if (c.includes('wind')) return <Wind size={16} className="text-teal-400" />
  return <Sun size={16} className="text-amber-400" />
}

function TripSectionHead({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-bold text-casa-muted uppercase tracking-widest mb-3 mt-1">
      <span className="text-casa-gold">{icon}</span>
      {label}
    </div>
  )
}

function TripTimelineStep({ icon, title, subtitle, time, timeLabel, detail, accent = false, connector = true }: {
  icon: React.ReactNode; title: string; subtitle?: string; time?: string
  timeLabel?: string; detail?: React.ReactNode; accent?: boolean; connector?: boolean
}) {
  return (
    <div className="flex gap-2.5">
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 border-2',
          accent ? 'bg-casa-navy border-casa-navy text-white' : 'bg-white border-casa-border text-casa-navy'
        )}>
          {icon}
        </div>
        {connector && <div className="w-px flex-1 min-h-[20px] bg-casa-border mt-1" />}
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={cn('font-semibold text-sm', accent ? 'text-casa-navy' : 'text-casa-text')}>{title}</p>
            {subtitle && <p className="text-[11px] text-casa-muted mt-0.5">{subtitle}</p>}
          </div>
          {time && (
            <div className="text-right flex-shrink-0">
              <p className="text-sm font-bold text-casa-navy">{time}</p>
              {timeLabel && <p className="text-[10px] text-casa-gold font-medium">{timeLabel}</p>}
            </div>
          )}
        </div>
        {detail && <div className="mt-2">{detail}</div>}
      </div>
    </div>
  )
}

function TripFlightCard({ airline, flightNum, seat, terminal, confirmation, departs, arrives, origin, dest }: {
  airline: string | null; flightNum: string | null; seat: string | null; terminal: string | null
  confirmation: string | null; departs: string | null; arrives: string | null; origin: string | null; dest: string | null
}) {
  return (
    <div className="bg-casa-navy rounded-xl p-3 text-white">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <Plane size={12} className="text-casa-gold" />
          <span className="text-sm font-bold">{flightNum ?? '—'}</span>
          <span className="text-xs text-white/60">·</span>
          <span className="text-xs text-white/70">{airline ?? 'Airline'}</span>
        </div>
        <div className="flex items-center gap-1 bg-green-500/20 text-green-400 text-[9px] font-bold px-1.5 py-0.5 rounded-full">
          <div className="w-1 h-1 rounded-full bg-green-400" />
          ON TIME
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="text-center">
          <p className="text-lg font-bold">{origin ?? '???'}</p>
          <p className="text-[9px] text-white/50 uppercase">Origin</p>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="text-[9px] text-white/50">{flightDuration(departs, arrives)}</div>
          <div className="flex items-center gap-1 w-full my-1">
            <div className="h-px flex-1 bg-white/20" />
            <Plane size={10} className="text-casa-gold" />
            <div className="h-px flex-1 bg-white/20" />
          </div>
          <div className="text-[9px] text-white/50">{fmtTripTime(departs)} → {fmtTripTime(arrives)}</div>
        </div>
        <div className="text-center">
          <p className="text-lg font-bold">{dest ?? '???'}</p>
          <p className="text-[9px] text-white/50 uppercase">Dest</p>
        </div>
      </div>
      {(seat || terminal || confirmation) && (
        <div className="flex gap-3 mt-2 pt-2 border-t border-white/10">
          {seat && <span className="flex items-center gap-1 text-[10px] text-white/60"><Armchair size={10} />Seat {seat}</span>}
          {terminal && <span className="flex items-center gap-1 text-[10px] text-white/60"><DoorOpen size={10} />Terminal {terminal}</span>}
          {confirmation && <span className="flex items-center gap-1 text-[10px] text-white/60"><Hash size={10} />{confirmation}</span>}
        </div>
      )}
    </div>
  )
}

function TripWeatherCard({ day }: { day: { date: string; high: number; low: number; condition: string } }) {
  const date = new Date(day.date + 'T12:00:00')
  return (
    <div className="flex-1 bg-white rounded-xl p-2 text-center border border-casa-border">
      <p className="text-[10px] text-casa-muted font-medium">{format(date, 'EEE')}</p>
      <p className="text-[9px] text-casa-muted/70">{format(date, 'M/d')}</p>
      <div className="my-1.5 flex justify-center">{tripWeatherIcon(day.condition)}</div>
      <p className="text-xs font-bold text-casa-navy">{day.high}°</p>
      <p className="text-[10px] text-casa-muted">{day.low}°</p>
    </div>
  )
}

function TravelIntelligenceBody({ trip }: { trip: Trip }) {
  const navigate = useNavigate()
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  function toggleItem(i: number) {
    setCheckedItems(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n })
  }
  const packing = (trip.packing_suggestions ?? []) as { item: string; reason?: string }[]
  const weather = (trip.destination_weather ?? []) as { date: string; high: number; low: number; condition: string }[]
  const homeTasks = trip.home_coverage_notes ? trip.home_coverage_notes.split('\n').filter(Boolean) : []

  // Prefer leg events when available, fall back to legacy trip columns
  const outboundLeg = trip.legs?.find(l => l.leg_type === 'flight_outbound')
  const hotelLeg = trip.legs?.find(l => l.leg_type === 'hotel')
  const returnLeg = trip.legs?.find(l => l.leg_type === 'flight_return')

  // Parse "MemberName | Flight UA1972 ORD→PBI" → { origin, dest }
  function parseLegRoute(title: string): { origin: string | null; dest: string | null } {
    const m = title.match(/([A-Z]{3})→([A-Z]{3})/)
    if (m) return { origin: m[1], dest: m[2] }
    return { origin: null, dest: null }
  }

  // Derive outbound flight display values
  const outFlightNum = outboundLeg?.flight_number ?? trip.outbound_flight_number
  const outDeparts = outboundLeg?.start_time ?? trip.outbound_departs_at
  const outArrives = outboundLeg?.end_time ?? trip.outbound_arrives_at
  const outConfirmation = outboundLeg?.confirmation_number ?? trip.outbound_confirmation
  const outRoute = outboundLeg ? parseLegRoute(outboundLeg.title) : { origin: null, dest: null }
  const outOrigin = outRoute.origin ?? trip.outbound_origin_airport
  const outDest = outRoute.dest ?? trip.outbound_dest_airport

  // Derive hotel display values
  const hotelName = hotelLeg?.location_name ?? hotelLeg?.title.split(' | ').slice(1).join(' | ') ?? trip.hotel_name
  const hotelConfirmation = hotelLeg?.confirmation_number ?? trip.hotel_confirmation

  // Derive return flight display values
  const retFlightNum = returnLeg?.flight_number ?? trip.return_flight_number
  const retDeparts = returnLeg?.start_time ?? trip.return_departs_at
  const retArrives = returnLeg?.end_time ?? trip.return_arrives_at
  const retConfirmation = returnLeg?.confirmation_number ?? trip.return_confirmation
  const retRoute = returnLeg ? parseLegRoute(returnLeg.title) : { origin: null, dest: null }
  const retOrigin = retRoute.origin ?? trip.return_origin_airport
  const retDest = retRoute.dest ?? trip.return_dest_airport

  const hasReturnFlight = !!(retFlightNum || retDeparts)

  return (
    <div className="space-y-1">
      <TripSectionHead label="Outbound Journey" icon={<Plane size={11} />} />
      <TripTimelineStep
        icon={<Home size={14} />}
        title="Leave Home"
        subtitle={`~${trip.drive_to_airport_min ?? 60} min drive to airport`}
        time={fmtTripTime(trip.leave_home_by)}
        accent
      />
      <TripTimelineStep
        icon={<Plane size={14} />}
        title={`${outOrigin ?? 'Airport'} — Departure`}
        subtitle={`Arrive at security by ${fmtTripTime(subtractMinutes(outDeparts, 90))}`}
        time={fmtTripTime(outDeparts)}
        detail={
          <TripFlightCard
            airline={trip.outbound_airline} flightNum={outFlightNum}
            seat={trip.outbound_seat} terminal={trip.outbound_terminal} confirmation={outConfirmation}
            departs={outDeparts} arrives={outArrives}
            origin={outOrigin} dest={outDest}
          />
        }
      />
      <TripTimelineStep
        icon={<MapPin size={14} />}
        title={`${outDest ?? 'Destination'} — Arrival`}
        subtitle={`~${trip.drive_from_airport_min ?? 30} min to hotel`}
        time={fmtTripTime(outArrives)}
        connector={!!hotelName}
      />
      {hotelName && (
        <TripTimelineStep
          icon={<Hotel size={14} />}
          title={hotelName}
          subtitle={trip.hotel_address ?? undefined}
          time={trip.hotel_checkin_time ?? '3:00 PM'}
          timeLabel="Check-in"
          connector={false}
          detail={
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-casa-muted mt-1">
              {hotelConfirmation && <span className="flex items-center gap-1"><Hash size={10} />{hotelConfirmation}</span>}
              {trip.hotel_phone && <span className="flex items-center gap-1"><Phone size={10} />{trip.hotel_phone}</span>}
              {trip.hotel_checkout_date && <span className="flex items-center gap-1"><DoorOpen size={10} />Checkout {trip.hotel_checkout_time} · {fmtDateShort(trip.hotel_checkout_date)}</span>}
            </div>
          }
        />
      )}

      {weather.length > 0 && (
        <div className="pt-2">
          <TripSectionHead label={`Weather — ${trip.destination_city ?? 'Destination'}`} icon={<Sun size={11} />} />
          <div className="flex gap-1.5">
            {weather.slice(0, 5).map((d, i) => <TripWeatherCard key={i} day={d} />)}
          </div>
        </div>
      )}

      {hasReturnFlight && (
        <div className="pt-2">
          <TripSectionHead label="Return Journey" icon={<Plane size={11} style={{ transform: 'scaleX(-1)' }} />} />
          {hotelName && (
            <TripTimelineStep
              icon={<Hotel size={14} />}
              title={`${hotelName} — Checkout`}
              subtitle={`Leave by ${fmtTripTime(trip.leave_hotel_by)}`}
              time={trip.hotel_checkout_time ?? '11:00 AM'}
              timeLabel={fmtDateShort(trip.hotel_checkout_date)}
              accent
            />
          )}
          <TripTimelineStep
            icon={<Plane size={14} />}
            title={`${retOrigin ?? 'Airport'} — Departure`}
            subtitle={`Security by ${fmtTripTime(subtractMinutes(retDeparts, 90))}`}
            time={fmtTripTime(retDeparts)}
            detail={
              <TripFlightCard
                airline={trip.return_airline} flightNum={retFlightNum}
                seat={trip.return_seat} terminal={trip.return_terminal} confirmation={retConfirmation}
                departs={retDeparts} arrives={retArrives}
                origin={retOrigin} dest={retDest}
              />
            }
          />
          <TripTimelineStep
            icon={<Home size={14} />}
            title="Arrive Home"
            time={fmtTripTime(retArrives)}
            connector={false}
          />
        </div>
      )}

      {packing.length > 0 && (
        <div className="pt-2">
          <TripSectionHead label="What to Pack" icon={<Luggage size={11} />} />
          <div className="bg-white rounded-xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
            {packing.map((p, i) => (
              <button key={i} onClick={() => toggleItem(i)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left">
                {checkedItems.has(i)
                  ? <CheckSquare size={14} className="text-casa-gold flex-shrink-0" />
                  : <Square size={14} className="text-casa-muted flex-shrink-0" />
                }
                <div className={cn('flex-1', checkedItems.has(i) && 'opacity-50 line-through')}>
                  <p className="text-xs text-casa-navy font-medium">{p.item}</p>
                  {p.reason && <p className="text-[10px] text-casa-muted">{p.reason}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {homeTasks.length > 0 && (
        <div className="pt-2">
          <TripSectionHead label="While You're Away" icon={<Users size={11} />} />
          <div className="bg-white rounded-xl border border-casa-border px-3 py-2.5 space-y-1.5">
            {homeTasks.map((t, i) => (
              <div key={i} className="flex items-start gap-2">
                <ChevronRight size={12} className="text-casa-gold mt-0.5 flex-shrink-0" />
                <p className="text-[11px] text-casa-text">{t}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {trip.ai_notes && (
        <div className="bg-casa-navy/5 rounded-xl px-3 py-2.5 border border-casa-navy/10 mt-2">
          <p className="text-[10px] text-casa-muted font-semibold mb-1">Travel Tips</p>
          <p className="text-[11px] text-casa-text leading-relaxed">{trip.ai_notes}</p>
        </div>
      )}

      <button
        onClick={() => navigate(`/trips/${trip.id}`)}
        className="w-full flex items-center justify-center gap-2 pt-3 pb-1 text-xs text-casa-muted hover:text-casa-navy transition-colors font-medium"
      >
        <ExternalLink size={12} />
        Open full trip view
      </button>
    </div>
  )
}

/* ── Body ───────────────────────────────────────────────────── */

// Find the best-matching trip for an event. Checks leg trip_id first, then
// falls back to legacy date/destination matching.
async function findTrip(memberId: string, eventDate: string, event: EventWithDetails): Promise<Trip | null> {
  // 0) New model: event is a leg with trip_id
  if ((event as EventWithDetails & { trip_id?: string | null }).trip_id) {
    const tripId = (event as EventWithDetails & { trip_id?: string | null }).trip_id!
    const { data: byTripId } = await supabase
      .from('trips').select('*, legs:events!trip_id(*)')
      .eq('id', tripId)
      .maybeSingle()
    if (byTripId) return byTripId as Trip
  }

  // 1) Best: trip directly linked to this event (legacy event_id link)
  if (event.id) {
    const { data: byEventId } = await supabase
      .from('trips').select('*, legs:events!trip_id(*)')
      .eq('event_id', event.id)
      .maybeSingle()
    if (byEventId) return byEventId as Trip
  }

  // 2) Exact overlap: trip spans the event date
  const { data: exact } = await supabase
    .from('trips').select('*, legs:events!trip_id(*)')
    .eq('family_member_id', memberId)
    .lte('trip_start_date', eventDate)
    .gte('trip_end_date', eventDate)
    .maybeSingle()
  if (exact) return exact as Trip

  // 3) Fuzzy: trip starts within ±3 days of the event date
  const d = new Date(eventDate)
  const lo = new Date(d); lo.setDate(d.getDate() - 1)
  const hi = new Date(d); hi.setDate(d.getDate() + 3)
  const { data: nearby } = await supabase
    .from('trips').select('*, legs:events!trip_id(*)')
    .eq('family_member_id', memberId)
    .gte('trip_start_date', lo.toISOString().slice(0, 10))
    .lte('trip_start_date', hi.toISOString().slice(0, 10))
    .order('trip_start_date')
  if (!nearby || nearby.length === 0) return null

  // If only one nearby trip, use it
  if (nearby.length === 1) return nearby[0] as Trip

  // Multiple — prefer trip linked to this event, then match by destination keyword
  const haystack = [
    event.title,
    event.logistics?.[0]?.location_name,
    event.enrichment?.route_summary,
  ].filter(Boolean).join(' ').toLowerCase()
  const match = (nearby as Trip[]).find(t =>
    (t.destination_city && haystack.includes(t.destination_city.toLowerCase())) ||
    (t.destination_state && haystack.includes(t.destination_state.toLowerCase()))
  )
  return match ?? nearby[0] as Trip
}

function PanelBody({ event, onEventUpdated }: { event: EventWithDetails; onEventUpdated?: () => void }) {
  const enr = event.enrichment
  const category = enr?.category
  const isTravel = TRAVEL_CATEGORIES.includes(category ?? '')

  const primaryMember = event.members.find(m => m.role === 'primary') ?? event.members[0]
  const memberId = primaryMember?.family_member?.id
  const eventDate = event.start_time?.slice(0, 10)

  const [trip, setTrip] = useState<Trip | null | undefined>(undefined)
  const [scanning, setScanning] = useState(false)
  const [scanDone, setScanDone] = useState(false)
  const [pdfError, setPdfError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isTravel || !memberId || !eventDate) { setTrip(null); return }
    setTrip(undefined)
    findTrip(memberId, eventDate, event).then(setTrip)
  }, [isTravel, memberId, eventDate])

  async function reloadTrip() {
    if (!memberId || !eventDate) return
    const found = await findTrip(memberId, eventDate, event)
    setTrip(found)
    onEventUpdated?.()
  }

  // ↺ Rescan: re-extracts from stored email body (no Gmail search)
  async function reprocessTrip() {
    if (!trip) return
    setScanning(true)
    const { data, error } = await supabase.functions.invoke('scan-travel-emails', {
      body: { reprocess_trip_id: trip.id, event_id: event.id },
    })
    if (error) console.error('[TravelRescan] error:', error)
    else console.log('[TravelRescan] result:', data)
    await reloadTrip()
    setScanning(false)
    setScanDone(true)
  }

  // Initial Gmail scan (first time, no trip yet)
  async function scanGmail() {
    setScanning(true)
    const { data, error } = await supabase.functions.invoke('scan-travel-emails', {
      body: {
        ...(memberId ? { family_member_id: memberId } : {}),
        event_id: event.id,
        event_date: eventDate,
        event_location: event.logistics?.[0]?.location_name ?? event.title,
      },
    })
    if (error) console.error('[TravelScan] error:', error)
    else console.log('[TravelScan] result:', data)
    await reloadTrip()
    setScanning(false)
    setScanDone(true)
  }

  // PDF upload: extract text client-side, send to function
  async function handlePdfFile(file: File) {
    setPdfError(null)
    setScanning(true)
    try {
      const { getDocument, GlobalWorkerOptions } = await import('pdfjs-dist')
      GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).href
      const arrayBuffer = await file.arrayBuffer()
      const pdf = await getDocument({ data: arrayBuffer }).promise
      let text = ''
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i)
        const content = await page.getTextContent()
        text += content.items.map((item: { str?: string } & object) => ('str' in item ? (item as { str: string }).str : '')).join(' ') + '\n'
      }
      if (text.trim().length < 50) throw new Error('Could not extract text from PDF')

      const { data, error } = await supabase.functions.invoke('scan-travel-emails', {
        body: {
          raw_text: text.slice(0, 20000),
          source_subject: file.name.replace('.pdf', ''),
          family_member_id: memberId,
          event_id: event.id,
          ...(trip ? { existing_trip_id: trip.id } : {}),
        },
      })
      if (error) throw new Error(error.message)
      console.log('[PDFScan] result:', data)
      await reloadTrip()
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'PDF processing failed')
    }
    setScanning(false)
    setScanDone(true)
  }

  // ── Travel event with trip data: show full inline travel intelligence ──
  if (isTravel && trip) {
    return (
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* "Travel Intelligence Ready" badge */}
        <div className="flex items-center gap-3 px-3 py-2.5 bg-casa-navy rounded-xl">
          <div className="w-7 h-7 rounded-full bg-casa-gold/20 flex items-center justify-center flex-shrink-0">
            <Plane size={13} className="text-casa-gold" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-white">
              ✈ Travel Intelligence Ready
              {trip.source_type === 'pdf' && <span className="ml-1.5 text-[10px] font-normal text-white/40">PDF</span>}
            </p>
            <p className="text-[11px] text-white/50 truncate">
              {(trip.legs?.find(l => l.leg_type === 'flight_outbound')?.flight_number ?? trip.outbound_flight_number) && `${trip.legs?.find(l => l.leg_type === 'flight_outbound')?.flight_number ?? trip.outbound_flight_number} · `}
              {trip.legs?.find(l => l.leg_type === 'hotel')?.location_name ?? trip.hotel_name ?? trip.destination_city ?? 'Gmail-sourced trip details below'}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* PDF attach */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning}
              title="Attach updated PDF itinerary"
              className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
            >
              <Paperclip size={13} />
            </button>
            {/* Rescan from stored email */}
            <button
              onClick={reprocessTrip}
              disabled={scanning}
              title={trip.source_email_body ? 'Re-extract from original email' : 'Re-scan Gmail for this trip'}
              className="text-white/30 hover:text-white/70 transition-colors disabled:opacity-40"
            >
              {scanning ? <Loader2 size={13} className="animate-spin" /> : <span className="text-[10px] font-medium">↺ rescan</span>}
            </button>
          </div>
        </div>
        {/* Hidden PDF file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handlePdfFile(f); e.target.value = '' } }}
        />

        <TravelIntelligenceBody trip={trip} />
      </div>
    )
  }

  // ── Travel event with no trip found: scan prompt ──
  if (isTravel && trip === null) {
    const scanPrompt = (
      <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
        <div className="flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-xs font-semibold text-amber-800">Flight info not found</p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              {scanDone
                ? 'No travel emails detected. Try attaching a PDF itinerary below.'
                : 'Scan Gmail to auto-detect flight and hotel details.'}
            </p>
            {pdfError && <p className="text-[11px] text-red-600 mt-1">PDF error: {pdfError}</p>}
          </div>
        </div>
        <div className="mt-2 flex gap-2">
          {!scanDone && (
            <button
              onClick={scanGmail}
              disabled={scanning}
              className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-amber-500 text-white text-xs font-bold hover:bg-amber-600 transition-colors disabled:opacity-60"
            >
              {scanning ? <Loader2 size={12} className="animate-spin" /> : <Plane size={12} />}
              {scanning ? 'Scanning Gmail…' : 'Scan Gmail'}
            </button>
          )}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={scanning}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-700 text-xs font-bold hover:bg-amber-50 transition-colors disabled:opacity-60"
          >
            {scanning ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />}
            {scanning ? 'Processing…' : 'Attach PDF'}
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) { handlePdfFile(f); e.target.value = '' } }}
        />
      </div>
    )
    return <StandardPanelBody event={event} topSlot={scanPrompt} />
  }

  // ── Non-travel or still loading ──
  return <StandardPanelBody event={event} />
}

function StandardPanelBody({ event, topSlot }: { event: EventWithDetails; topSlot?: React.ReactNode }) {
  const enr = event.enrichment
  const reminder = event.event_type === 'reminder'
  const hasLogistics = !reminder && event.logistics?.length > 0
  const hasChecklist = event.checklist?.length > 0
  const hasActions = event.actions?.filter((a) => !a.is_urgent).length > 0
  const activeFields = getFieldsForCategory(enr?.category)
  const shows = (field: string) => activeFields.includes(field as ReturnType<typeof getFieldsForCategory>[number])

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6">
      {topSlot}

      {hasLogistics && (
        <section>
          <SectionLabel>Location & Logistics</SectionLabel>
          <ol className="space-y-3">
            {event.logistics.map((step, i) => (
              <li key={step.id} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="text-lg leading-none">{step.icon ?? '•'}</span>
                  {i < event.logistics.length - 1 && <div className="w-px flex-1 bg-casa-divider mt-1" />}
                </div>
                <div className="pb-3 min-w-0">
                  <p className="text-body-sm font-semibold text-casa-navy leading-tight">
                    {step.title}
                    {step.time && <span className="font-normal text-casa-muted ml-1.5">{format(new Date(step.time), 'h:mm a')}</span>}
                  </p>
                  {step.description && <p className="text-caption text-casa-muted mt-0.5">{step.description}</p>}
                  {step.location_name && (
                    <p className="text-caption text-casa-gold mt-0.5 flex items-center gap-1"><MapPin size={11} /> {step.location_name}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!hasLogistics && !reminder && (event.location_name || enr?.departure_time) && (
        <section>
          <SectionLabel>Location & Logistics</SectionLabel>
          <div className="space-y-3">
            {enr?.departure_time && (
              <InfoRow icon={<Clock size={16} className="text-casa-gold" />}>
                <p className="text-body-sm font-semibold text-casa-navy">Leave by {format(new Date(enr.departure_time), 'h:mm a')}</p>
                {enr.route_summary && <p className="text-caption text-casa-muted">{enr.route_summary}</p>}
                {enr.drive_time_mins && <p className="text-caption text-casa-muted">{enr.drive_time_mins} min drive</p>}
              </InfoRow>
            )}
            {event.location_name && (
              <InfoRow icon={<MapPin size={16} className="text-casa-error" />}>
                <p className="text-body-sm font-semibold text-casa-navy">{event.location_name}</p>
                {event.address && <p className="text-caption text-casa-muted">{event.address}</p>}
                {shows('parking_notes') && enr?.parking_notes && <p className="text-caption text-casa-muted mt-0.5">{enr.parking_notes}</p>}
              </InfoRow>
            )}
          </div>
        </section>
      )}

      {enr?.weather_summary && (
        <section>
          <SectionLabel>Weather at Venue</SectionLabel>
          <div className="flex items-center gap-2 bg-casa-bg rounded-button px-3 py-2 w-fit">
            <Cloud size={16} className="text-casa-gold" />
            <span className="text-body-sm text-casa-navy font-medium">{enr.weather_summary}</span>
          </div>
        </section>
      )}

      {hasChecklist && (
        <section>
          <SectionLabel>What to Bring</SectionLabel>
          <ChecklistSection items={event.checklist} eventId={event.id} />
        </section>
      )}

      {!hasChecklist && shows('what_to_bring') && enr?.what_to_bring && enr.what_to_bring.length > 0 && (
        <section>
          <SectionLabel>What to Bring</SectionLabel>
          <div className="space-y-2">
            {enr.what_to_bring.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <Square size={16} className="text-casa-border shrink-0" />
                <span className="text-body-sm text-casa-text">{item}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {hasActions && (
        <section>
          <SectionLabel>To Do</SectionLabel>
          <div className="space-y-2">
            {event.actions.filter((a) => !a.is_urgent).map((action) => (
              <div key={action.id} className={cn(
                'flex items-start gap-3 p-3 rounded-card border',
                action.completed ? 'border-casa-divider opacity-50' : 'border-casa-border bg-casa-bg',
              )}>
                <ChevronRight size={14} className="text-casa-gold mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className={cn('text-body-sm font-semibold text-casa-navy', action.completed && 'line-through')}>{action.title}</p>
                  {action.description && <p className="text-caption text-casa-muted mt-0.5">{action.description}</p>}
                  {action.due_date && <p className="text-caption text-casa-muted mt-0.5">Due {format(new Date(action.due_date), 'MMM d')}</p>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {enr && (
        <>
          {shows('outfit_suggestion') && enr.outfit_suggestion && (
            <section><SectionLabel>What to Wear</SectionLabel><p className="text-body-sm text-casa-text">{enr.outfit_suggestion}</p></section>
          )}
          {shows('contact_name') && (enr.contact_name || enr.contact_phone) && (
            <section>
              <SectionLabel>Contact</SectionLabel>
              <InfoRow icon={<Phone size={16} className="text-casa-muted" />}>
                {enr.contact_name && <p className="text-body-sm font-semibold text-casa-navy">{enr.contact_name}</p>}
                {enr.contact_phone && <p className="text-caption text-casa-muted">{enr.contact_phone}</p>}
              </InfoRow>
            </section>
          )}
          {shows('cost_estimate') && enr.cost_estimate && (
            <section>
              <SectionLabel>Cost Estimate</SectionLabel>
              <InfoRow icon={<DollarSign size={16} className="text-casa-muted" />}><p className="text-body-sm text-casa-navy">{enr.cost_estimate}</p></InfoRow>
            </section>
          )}
          {shows('dietary_notes') && enr.dietary_notes && (
            <section><SectionLabel>Dietary Notes</SectionLabel><p className="text-body-sm text-casa-text">{enr.dietary_notes}</p></section>
          )}
          {shows('meal_impact') && enr.meal_impact && (
            <section>
              <SectionLabel>Meal Impact</SectionLabel>
              <InfoRow icon={<Utensils size={16} className="text-casa-muted" />}><p className="text-body-sm text-casa-text">{enr.meal_impact}</p></InfoRow>
            </section>
          )}
          {shows('prep_notes') && enr.prep_notes && (
            <section><SectionLabel>Notes</SectionLabel><p className="text-body-sm text-casa-text whitespace-pre-line leading-relaxed">{enr.prep_notes}</p></section>
          )}
        </>
      )}

      {!enr && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <Sparkles size={22} className="text-casa-muted" />
          <p className="text-body-sm text-casa-muted">No AI enrichment yet.</p>
          <p className="text-caption text-casa-muted">Tap Re-enrich above to generate details for this event.</p>
        </div>
      )}
    </div>
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
    <div className="space-y-2">
      {items.map((item) => {
        const checked = localChecked[item.id] ?? item.checked
        return (
          <label key={item.id} className="flex items-start gap-3 cursor-pointer group" onClick={() => toggle(item)}>
            {checked
              ? <CheckSquare size={18} className="text-casa-gold shrink-0 mt-0.5" />
              : <Square size={18} className="text-casa-border group-hover:text-casa-gold transition-colors shrink-0 mt-0.5" />
            }
            <div className="min-w-0">
              <p className={cn('text-body-sm text-casa-text', checked && 'line-through opacity-50')}>{item.label}</p>
              {item.note && <p className="text-caption text-casa-muted">{item.note}</p>}
            </div>
          </label>
        )
      })}
    </div>
  )
}

/* ── Footer ─────────────────────────────────────────────────── */

function PanelFooter({ event, onEdit }: { event: EventWithDetails; onEdit: () => void }) {
  const mapsUrl = event.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.address)}`
    : event.location_name
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(event.location_name)}`
    : null

  return (
    <div className="p-4 border-t border-casa-border flex gap-2">
      <button
        onClick={onEdit}
        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
      >
        <Pencil size={15} />
        Edit Details
      </button>
      {mapsUrl && (
        <a
          href={mapsUrl}
          target="_blank"
          rel="noreferrer"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-bg transition-colors"
        >
          <Navigation size={15} />
          Directions
        </a>
      )}
      <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 transition-all">
        <Share2 size={15} />
        Share
      </button>
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

function InfoRow({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="shrink-0 mt-0.5">{icon}</div>
      <div className="min-w-0 space-y-0.5">{children}</div>
    </div>
  )
}
