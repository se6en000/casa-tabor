/**
 * TripCard — compact trip summary card shown on home/briefing
 * when an upcoming trip is within 7 days.
 */

import { format } from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { Plane, Clock, MapPin, ChevronRight, Hotel } from 'lucide-react'
import { cn } from '../../utils/cn'
import type { Trip } from '../../hooks/useTrips'

// Read literal time digits — stored times are nominal local (no TZ conversion)
function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  if (!iso.includes('T')) return format(new Date(iso + 'T12:00:00'), 'h:mm a')
  const timePart = iso.split('T')[1].replace(/[Z+-].*$/, '')
  const [h, m] = timePart.split(':').map(Number)
  return format(new Date(2000, 0, 1, h, m), 'h:mm a')
}

// Append T12:00:00 so date-only strings are never shifted to previous day by UTC parsing
function fmtDateShort(iso: string | null): string {
  if (!iso) return '—'
  const str = iso.includes('T') ? iso : iso + 'T12:00:00'
  return format(new Date(str), 'EEE MMM d')
}

function daysUntil(iso: string | null): number {
  if (!iso) return 999
  const str = iso.includes('T') ? iso : iso + 'T12:00:00'
  return Math.ceil((new Date(str).getTime() - Date.now()) / 86400000)
}

export default function TripCard({ trip }: { trip: Trip }) {
  const navigate = useNavigate()
  const days = daysUntil(trip.trip_start_date ?? null)
  const isToday = days <= 0
  const isTomorrow = days === 1

  const urgencyLabel = isToday
    ? 'TODAY'
    : isTomorrow
    ? 'TOMORROW'
    : `IN ${days} DAYS`

  return (
    <button
      onClick={() => navigate(`/trips/${trip.id}`)}
      className="w-full text-left"
    >
      <div className={cn(
        'rounded-2xl border overflow-hidden transition-all hover:shadow-md',
        isToday ? 'border-casa-gold bg-gradient-to-br from-casa-navy to-[#1a2a4a]'
          : 'border-casa-border bg-white'
      )}>
        {/* Header row */}
        <div className={cn(
          'px-4 pt-3 pb-2 flex items-center justify-between',
          isToday && 'text-white'
        )}>
          <div className="flex items-center gap-2">
            <div className={cn(
              'w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold',
              isToday ? 'bg-casa-gold text-white' : 'bg-casa-navy text-white'
            )}>
              {trip.traveler_name[0]}
            </div>
            <div>
              <p className={cn('text-sm font-semibold', isToday ? 'text-white' : 'text-casa-navy')}>
                {trip.traveler_name}
              </p>
              <p className={cn('text-[10px] font-bold tracking-wide', isToday ? 'text-casa-gold' : 'text-casa-gold')}>
                ✈ {urgencyLabel}
              </p>
            </div>
          </div>
          <ChevronRight size={14} className={isToday ? 'text-white/50' : 'text-casa-muted'} />
        </div>

        {/* Destination */}
        <div className={cn('px-4 pb-2 flex items-center gap-1.5', isToday ? 'text-white/80' : 'text-casa-text')}>
          <MapPin size={12} className={isToday ? 'text-casa-gold' : 'text-casa-gold'} />
          <span className="text-sm font-medium">
            {trip.destination_city ?? 'Unknown destination'}
            {trip.destination_state && `, ${trip.destination_state}`}
          </span>
          <span className={cn('text-xs', isToday ? 'text-white/40' : 'text-casa-muted')}>
            · {fmtDateShort(trip.trip_start_date)} – {fmtDateShort(trip.trip_end_date)}
          </span>
        </div>

        {/* Flight info */}
        <div className={cn(
          'mx-3 mb-3 rounded-xl px-3 py-2.5',
          isToday ? 'bg-white/10' : 'bg-casa-bg'
        )}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Plane size={12} className="text-casa-gold" />
              <span className={cn('text-xs font-bold', isToday ? 'text-white' : 'text-casa-navy')}>
                {trip.outbound_flight_number ?? 'Flight'}
              </span>
              {trip.outbound_airline && (
                <span className={cn('text-[10px]', isToday ? 'text-white/50' : 'text-casa-muted')}>
                  · {trip.outbound_airline}
                </span>
              )}
            </div>
            <span className={cn('text-xs font-semibold', isToday ? 'text-white/80' : 'text-casa-text')}>
              {fmtTime(trip.outbound_departs_at)} → {fmtTime(trip.outbound_arrives_at)}
            </span>
          </div>

          {trip.leave_home_by && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <Clock size={11} className="text-amber-400" />
              <span className={cn('text-[11px]', isToday ? 'text-amber-300' : 'text-amber-600')}>
                Leave home by {fmtTime(trip.leave_home_by)}
              </span>
            </div>
          )}

          {trip.hotel_name && (
            <div className="flex items-center gap-1.5 mt-1">
              <Hotel size={11} className={isToday ? 'text-white/40' : 'text-casa-muted'} />
              <span className={cn('text-[10px]', isToday ? 'text-white/50' : 'text-casa-muted')}>
                {trip.hotel_name}
              </span>
            </div>
          )}
        </div>
      </div>
    </button>
  )
}
