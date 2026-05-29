/**
 * TripDetailPage
 *
 * Full travel intelligence view:
 * - Outbound journey timeline (leave home → airport → flight → hotel)
 * - Destination weather forecast
 * - Return journey timeline (hotel checkout → airport → flight → home)
 * - Packing checklist
 * - Home coverage notes
 * - AI travel tips
 */

import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { format, formatDistanceToNow } from 'date-fns'
import {
  Plane, Hotel, Home, MapPin, Clock, ArrowLeft, CheckSquare, Square,
  Sun, Cloud, CloudRain, CloudSnow, Wind,
  ChevronRight, Phone, Hash, Armchair, DoorOpen, RefreshCw, Loader2,
  Users, Luggage,
} from 'lucide-react'
import { cn } from '../utils/cn'
import { useTrip, type WeatherDay, type PackingItem } from '../hooks/useTrips'
import { supabase } from '../lib/supabase'

// ── Helpers ────────────────────────────────────────────────────────────────

function parseNominal(iso: string): { h: number; m: number; dateStr: string } {
  const [datePart, timePart] = iso.split('T')
  const timeDigits = (timePart ?? '12:00:00').replace(/[Z+-].*$/, '')
  const [h, m] = timeDigits.split(':').map(Number)
  return { h, m, dateStr: datePart }
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  if (!iso.includes('T')) return format(new Date(iso + 'T12:00:00'), 'h:mm a')
  const { h, m } = parseNominal(iso)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—'
  const str = iso.includes('T') ? iso : iso + 'T12:00:00'
  return format(new Date(str), 'EEE MMM d')
}

function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  const str = iso.includes('T') ? iso : iso + 'T12:00:00'
  return format(new Date(str), 'MMM d')
}

function flightDuration(dep: string | null, arr: string | null): string {
  if (!dep || !arr) return ''
  // Compute duration from literal digits (nominal times, same-day assumption for outbound)
  const { h: dh, m: dm } = parseNominal(dep)
  const { h: ah, m: am } = parseNominal(arr)
  let mins = (ah * 60 + am) - (dh * 60 + dm)
  if (mins < 0) mins += 24 * 60 // crosses midnight
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function countdownLabel(iso: string | null): string | null {
  if (!iso) return null
  // Use nominal time as local time for countdown
  const str = iso.includes('T') ? iso.replace(/[Z+-]\d.*$/, '') : iso + 'T12:00:00'
  const diff = new Date(str).getTime() - Date.now()
  if (diff < 0) return 'already departed'
  if (diff < 24 * 3600000) return `in ${formatDistanceToNow(new Date(str))}`
  return null
}

function subtractMinutes(iso: string | null, mins: number): string | null {
  if (!iso || !iso.includes('T')) return iso ?? null
  const { h, m, dateStr } = parseNominal(iso)
  let total = h * 60 + m - mins
  if (total < 0) total += 24 * 60
  const newH = Math.floor(total / 60)
  const newM = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dateStr}T${pad(newH)}:${pad(newM)}:00`
}

function weatherIcon(condition: string): React.ReactNode {
  const c = condition.toLowerCase()
  if (c.includes('snow')) return <CloudSnow size={20} className="text-blue-300" />
  if (c.includes('rain') || c.includes('drizzle')) return <CloudRain size={20} className="text-blue-400" />
  if (c.includes('cloud')) return <Cloud size={20} className="text-gray-400" />
  if (c.includes('wind')) return <Wind size={20} className="text-teal-400" />
  return <Sun size={20} className="text-amber-400" />
}

// ── Sub-components ─────────────────────────────────────────────────────────

function TimelineStep({
  icon, title, subtitle, time, timeLabel, detail, accent = false, connector = true,
}: {
  icon: React.ReactNode
  title: string
  subtitle?: string
  time?: string
  timeLabel?: string
  detail?: React.ReactNode
  accent?: boolean
  connector?: boolean
}) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className={cn(
          'w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border-2',
          accent ? 'bg-casa-navy border-casa-navy text-white' : 'bg-white border-casa-border text-casa-navy'
        )}>
          {icon}
        </div>
        {connector && <div className="w-px flex-1 min-h-[28px] bg-casa-border mt-1" />}
      </div>
      <div className="flex-1 pb-5">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className={cn('font-semibold text-sm', accent ? 'text-casa-navy' : 'text-casa-text')}>{title}</p>
            {subtitle && <p className="text-caption text-casa-muted mt-0.5">{subtitle}</p>}
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

function FlightCard({ airline, flightNum, seat, terminal, confirmation, departs, arrives, origin, dest }: {
  airline: string | null
  flightNum: string | null
  seat: string | null
  terminal: string | null
  confirmation: string | null
  departs: string | null
  arrives: string | null
  origin: string | null
  dest: string | null
}) {
  return (
    <div className="bg-casa-navy rounded-2xl p-4 text-white mt-2">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Plane size={14} className="text-casa-gold" />
          <span className="text-sm font-bold">{flightNum ?? '—'}</span>
          <span className="text-xs text-white/60">·</span>
          <span className="text-xs text-white/70">{airline ?? 'Airline'}</span>
        </div>
        <div className="flex items-center gap-1.5 bg-green-500/20 text-green-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
          <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
          ON TIME
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className="text-center">
          <p className="text-xl font-bold">{origin ?? '???'}</p>
          <p className="text-[10px] text-white/50 uppercase">Origin</p>
        </div>
        <div className="flex-1 flex flex-col items-center">
          <div className="text-[10px] text-white/50">{flightDuration(departs, arrives)}</div>
          <div className="flex items-center gap-1 w-full my-1">
            <div className="h-px flex-1 bg-white/20" />
            <Plane size={12} className="text-casa-gold" />
            <div className="h-px flex-1 bg-white/20" />
          </div>
          <div className="text-[10px] text-white/50">{fmtTime(departs)} → {fmtTime(arrives)}</div>
        </div>
        <div className="text-center">
          <p className="text-xl font-bold">{dest ?? '???'}</p>
          <p className="text-[10px] text-white/50 uppercase">Dest</p>
        </div>
      </div>

      <div className="flex gap-3 mt-3 pt-3 border-t border-white/10">
        {seat && (
          <div className="flex items-center gap-1 text-[11px] text-white/60">
            <Armchair size={11} />
            <span>Seat {seat}</span>
          </div>
        )}
        {terminal && (
          <div className="flex items-center gap-1 text-[11px] text-white/60">
            <DoorOpen size={11} />
            <span>Terminal {terminal}</span>
          </div>
        )}
        {confirmation && (
          <div className="flex items-center gap-1 text-[11px] text-white/60">
            <Hash size={11} />
            <span>{confirmation}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function WeatherCard({ day }: { day: WeatherDay }) {
  const date = new Date(day.date + 'T12:00:00')
  return (
    <div className="flex-1 bg-white rounded-xl p-3 text-center border border-casa-border">
      <p className="text-[11px] text-casa-muted font-medium">{format(date, 'EEE')}</p>
      <p className="text-[10px] text-casa-muted/70">{format(date, 'M/d')}</p>
      <div className="my-2 flex justify-center">{weatherIcon(day.condition)}</div>
      <p className="text-xs font-bold text-casa-navy">{day.high}°</p>
      <p className="text-[10px] text-casa-muted">{day.low}°</p>
      <p className="text-[9px] text-casa-muted/70 mt-1 capitalize leading-tight">{day.condition}</p>
    </div>
  )
}

function SectionHead({ label, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-bold text-casa-muted uppercase tracking-widest mb-4 mt-2">
      <span className="text-casa-gold">{icon}</span>
      {label}
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function TripDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: trip, isLoading, error } = useTrip(id ?? '')
  const [checkedItems, setCheckedItems] = useState<Set<number>>(new Set())
  const [scanning, setScanning] = useState(false)
  const [scanMsg, setScanMsg] = useState('')

  function goBack() {
    if (window.history.length > 1) {
      navigate(-1)
    } else {
      navigate('/')
    }
  }

  function toggleItem(i: number) {
    setCheckedItems(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  async function rescan() {
    if (!trip?.family_member_id) return
    setScanning(true)
    setScanMsg('')
    try {
      const { data } = await supabase.functions.invoke('scan-travel-emails', {
        body: { family_member_id: trip.family_member_id },
      })
      setScanMsg(data?.results?.[0]?.trips_found === 0
        ? 'No new trips found.'
        : `Found ${data?.results?.[0]?.trips_found} trip(s). Refresh to see updates.`
      )
    } catch {
      setScanMsg('Scan failed — check settings.')
    }
    setScanning(false)
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={28} className="animate-spin text-casa-gold" />
      </div>
    )
  }

  if (error || !trip) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <p className="text-casa-muted">Trip not found.</p>
        <button onClick={goBack} className="text-casa-gold text-sm">← Go back</button>
      </div>
    )
  }

  const countdown = countdownLabel(trip.leave_home_by)
  const packing = (trip.packing_suggestions ?? []) as PackingItem[]
  const weather = (trip.destination_weather ?? []) as WeatherDay[]
  const homeTasks = trip.home_coverage_notes
    ? trip.home_coverage_notes.split('\n').filter(Boolean)
    : []

  return (
    <div className="min-h-screen bg-casa-bg">
      {/* ── Header ─────────────────────────────────────── */}
      <div className="bg-casa-navy px-5 pt-12 pb-6 relative overflow-hidden">
        <div className="absolute inset-0 opacity-5" style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, white 0%, transparent 60%)' }} />
        <button onClick={goBack} className="flex items-center gap-1 text-white/60 text-sm mb-4">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-8 h-8 rounded-full bg-casa-gold flex items-center justify-center text-white font-bold text-sm">
                {trip.traveler_name[0]}
              </div>
              <span className="text-white/70 text-sm font-medium">{trip.traveler_name}</span>
            </div>
            <h1 className="text-2xl font-bold text-white leading-tight">
              {trip.destination_city ?? 'Work Trip'}
              {trip.destination_state && `, ${trip.destination_state}`}
            </h1>
            <p className="text-white/50 text-sm mt-1">
              {fmtDate(trip.trip_start_date)} – {fmtDateShort(trip.trip_end_date)}
            </p>
          </div>
          <div className={cn(
            'text-xs font-bold px-2.5 py-1 rounded-full',
            trip.status === 'confirmed' ? 'bg-green-500/20 text-green-300' : 'bg-amber-500/20 text-amber-300'
          )}>
            {trip.status === 'confirmed' ? '✓ Confirmed' : 'Needs Review'}
          </div>
        </div>

        {countdown && (
          <div className="mt-3 flex items-center gap-1.5 bg-casa-gold/20 text-casa-gold text-xs font-bold px-3 py-1.5 rounded-xl w-fit">
            <Clock size={11} />
            Leave home {countdown}
          </div>
        )}
      </div>

      {/* ── Body ───────────────────────────────────────── */}
      <div className="px-4 py-6 max-w-2xl mx-auto">

        {/* OUTBOUND */}
        <SectionHead label="Outbound Journey" icon={<Plane size={12} />} />
        <div>
          <TimelineStep
            icon={<Home size={16} />}
            title="Leave Home"
            subtitle={trip.leave_home_by ? `~${trip.drive_to_airport_min ?? 60} min drive to airport` : 'Calculate based on flight time'}
            time={fmtTime(trip.leave_home_by)}
            timeLabel={countdown ?? undefined}
            accent
          />

          <TimelineStep
            icon={<Plane size={16} />}
            title={`${trip.outbound_origin_airport ?? 'Airport'} — Departure`}
            subtitle={`Arrive at security by ${fmtTime(subtractMinutes(trip.outbound_departs_at, 90))}`}
            time={fmtTime(trip.outbound_departs_at)}
            detail={
              <FlightCard
                airline={trip.outbound_airline}
                flightNum={trip.outbound_flight_number}
                seat={trip.outbound_seat}
                terminal={trip.outbound_terminal}
                confirmation={trip.outbound_confirmation}
                departs={trip.outbound_departs_at}
                arrives={trip.outbound_arrives_at}
                origin={trip.outbound_origin_airport}
                dest={trip.outbound_dest_airport}
              />
            }
          />

          {trip.layover_airport && (
            <TimelineStep
              icon={<Clock size={16} />}
              title={`Layover — ${trip.layover_airport}`}
              subtitle={
                trip.layover_departs_at && trip.layover_arrives_at
                  ? `${flightDuration(trip.layover_arrives_at, trip.layover_departs_at)} connection`
                  : 'Connecting flight'
              }
              time={fmtTime(trip.layover_departs_at)}
              detail={trip.layover_flight_number ? (
                <FlightCard
                  airline={trip.layover_airline}
                  flightNum={trip.layover_flight_number}
                  seat={null}
                  terminal={null}
                  confirmation={null}
                  departs={trip.layover_departs_at}
                  arrives={trip.layover_arrives_at}
                  origin={trip.layover_airport}
                  dest={trip.outbound_dest_airport}
                />
              ) : null}
            />
          )}

          <TimelineStep
            icon={<MapPin size={16} />}
            title={`${trip.outbound_dest_airport ?? 'Destination'} — Arrival`}
            subtitle={`~${trip.drive_from_airport_min ?? 30} min to hotel`}
            time={fmtTime(trip.outbound_arrives_at)}
          />

          {trip.hotel_name && (
            <TimelineStep
              icon={<Hotel size={16} />}
              title={trip.hotel_name}
              subtitle={trip.hotel_address ?? undefined}
              time={trip.hotel_checkin_time ?? '3:00 PM'}
              timeLabel="Check-in"
              connector={false}
              detail={
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-casa-muted mt-1">
                  {trip.hotel_confirmation && (
                    <span className="flex items-center gap-1"><Hash size={11} />{trip.hotel_confirmation}</span>
                  )}
                  {trip.hotel_phone && (
                    <span className="flex items-center gap-1"><Phone size={11} />{trip.hotel_phone}</span>
                  )}
                  {trip.hotel_checkout_date && (
                    <span className="flex items-center gap-1"><DoorOpen size={11} />Checkout {trip.hotel_checkout_time} · {fmtDateShort(trip.hotel_checkout_date)}</span>
                  )}
                </div>
              }
            />
          )}
        </div>

        {/* WEATHER */}
        {weather.length > 0 && (
          <div className="mt-6">
            <SectionHead label={`Weather — ${trip.destination_city ?? 'Destination'}`} icon={<Sun size={12} />} />
            <div className="flex gap-2">
              {weather.slice(0, 5).map((d, i) => <WeatherCard key={i} day={d} />)}
            </div>
          </div>
        )}

        {/* RETURN */}
        {(trip.return_flight_number || trip.return_departs_at) && (
          <div className="mt-6">
            <SectionHead label="Return Journey" icon={<Plane size={12} style={{ transform: 'scaleX(-1)' }} />} />
            <div>
              {trip.hotel_name && (
                <TimelineStep
                  icon={<Hotel size={16} />}
                  title={`${trip.hotel_name} — Checkout`}
                  subtitle={`Leave by ${fmtTime(trip.leave_hotel_by)} for your flight`}
                  time={trip.hotel_checkout_time ?? '11:00 AM'}
                  timeLabel={fmtDateShort(trip.hotel_checkout_date)}
                  accent
                />
              )}

              <TimelineStep
                icon={<Plane size={16} />}
                title={`${trip.return_origin_airport ?? 'Airport'} — Departure`}
                subtitle={`Arrive at security by ${fmtTime(subtractMinutes(trip.return_departs_at, 90))}`}
                time={fmtTime(trip.return_departs_at)}
                detail={
                  <FlightCard
                    airline={trip.return_airline}
                    flightNum={trip.return_flight_number}
                    seat={trip.return_seat}
                    terminal={trip.return_terminal}
                    confirmation={trip.return_confirmation}
                    departs={trip.return_departs_at}
                    arrives={trip.return_arrives_at}
                    origin={trip.return_origin_airport}
                    dest={trip.return_dest_airport}
                  />
                }
              />

              <TimelineStep
                icon={<Home size={16} />}
                title="Arrive Home"
                subtitle={trip.return_dest_airport ? `Landing at ${trip.return_dest_airport}` : 'Home airport'}
                time={fmtTime(trip.return_arrives_at)}
                connector={false}
              />
            </div>
          </div>
        )}

        {/* PACKING */}
        {packing.length > 0 && (
          <div className="mt-6">
            <SectionHead label="What to Pack" icon={<Luggage size={12} />} />
            <div className="bg-white rounded-2xl border border-casa-border divide-y divide-casa-divider overflow-hidden">
              {packing.map((p, i) => (
                <button
                  key={i}
                  onClick={() => toggleItem(i)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left"
                >
                  {checkedItems.has(i)
                    ? <CheckSquare size={16} className="text-casa-gold flex-shrink-0" />
                    : <Square size={16} className="text-casa-muted flex-shrink-0" />
                  }
                  <div className={cn('flex-1', checkedItems.has(i) && 'opacity-50 line-through')}>
                    <p className="text-sm text-casa-navy font-medium">{p.item}</p>
                    {p.reason && <p className="text-caption text-casa-muted">{p.reason}</p>}
                  </div>
                </button>
              ))}
            </div>
            {checkedItems.size > 0 && (
              <p className="text-caption text-casa-gold mt-2 text-right">
                {checkedItems.size}/{packing.length} packed ✓
              </p>
            )}
          </div>
        )}

        {/* HOME COVERAGE */}
        {homeTasks.length > 0 && (
          <div className="mt-6">
            <SectionHead label="While You're Away" icon={<Users size={12} />} />
            <div className="bg-white rounded-2xl border border-casa-border px-4 py-3 space-y-2">
              {homeTasks.map((t, i) => (
                <div key={i} className="flex items-start gap-2">
                  <ChevronRight size={14} className="text-casa-gold mt-0.5 flex-shrink-0" />
                  <p className="text-caption text-casa-text">{t}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* AI NOTES */}
        {trip.ai_notes && (
          <div className="mt-6 bg-casa-navy/5 rounded-2xl px-4 py-3 border border-casa-navy/10">
            <p className="text-caption text-casa-muted font-semibold mb-1">Travel Tips</p>
            <p className="text-caption text-casa-text leading-relaxed">{trip.ai_notes}</p>
          </div>
        )}

        {/* Rescan footer */}
        <div className="mt-8 pb-8 flex flex-col items-center gap-2">
          <button
            onClick={rescan}
            disabled={scanning}
            className="flex items-center gap-2 text-sm text-casa-muted hover:text-casa-navy transition-colors"
          >
            {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            Rescan Gmail for updates
          </button>
          {scanMsg && <p className="text-caption text-casa-gold">{scanMsg}</p>}
        </div>
      </div>
    </div>
  )
}
