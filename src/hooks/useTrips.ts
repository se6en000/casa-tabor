import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface WeatherDay {
  date: string
  high: number
  low: number
  condition: string
  icon: string
}

export interface PackingItem {
  item: string
  reason: string
}

export interface TripLeg {
  id: string
  leg_type: 'flight_outbound' | 'flight_return' | 'flight_leg' | 'hotel' | 'car_rental'
  title: string
  start_time: string
  end_time: string
  location_name: string | null
  flight_number: string | null
  confirmation_number: string | null
  all_day: boolean
  google_event_id: string | null
}

export interface Trip {
  id: string
  event_id: string | null
  family_member_id: string | null
  traveler_name: string
  trip_title: string | null
  destination_city: string | null
  destination_state: string | null
  destination_country: string | null
  // Legacy columns (still populated for backward compat during transition)
  outbound_flight_number: string | null
  outbound_airline: string | null
  outbound_origin_airport: string | null
  outbound_dest_airport: string | null
  outbound_departs_at: string | null
  outbound_arrives_at: string | null
  outbound_seat: string | null
  outbound_terminal: string | null
  outbound_confirmation: string | null
  layover_airport: string | null
  layover_flight_number: string | null
  layover_airline: string | null
  layover_departs_at: string | null
  layover_arrives_at: string | null
  hotel_name: string | null
  hotel_address: string | null
  hotel_checkin_date: string | null
  hotel_checkout_date: string | null
  hotel_checkin_time: string | null
  hotel_checkout_time: string | null
  hotel_confirmation: string | null
  hotel_phone: string | null
  return_flight_number: string | null
  return_airline: string | null
  return_origin_airport: string | null
  return_dest_airport: string | null
  return_departs_at: string | null
  return_arrives_at: string | null
  return_seat: string | null
  return_terminal: string | null
  return_confirmation: string | null
  leave_home_by: string | null
  leave_hotel_by: string | null
  drive_to_airport_min: number | null
  drive_from_airport_min: number | null
  destination_weather: WeatherDay[]
  packing_suggestions: PackingItem[]
  ai_notes: string | null
  home_coverage_notes: string | null
  source_email_body: string | null
  source_email_subject: string | null
  source_type: 'gmail' | 'pdf' | null
  trip_start_date: string | null
  trip_end_date: string | null
  status: string
  created_at: string
  // Leg events (new leg-based model)
  legs?: TripLeg[]
}

export function useUpcomingTrips() {
  return useQuery({
    queryKey: ['trips', 'upcoming'],
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10)
      const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
      const { data, error } = await supabase
        .from('trips')
        .select('*, legs:events!trip_id(*)')
        .gte('trip_end_date', today)
        .lte('trip_start_date', in14)
        .order('trip_start_date')
      if (error) throw error

      // Dedup: keep the most-recently-created row per (family_member + start_date + flight)
      const seen = new Map<string, Trip>()
      for (const trip of (data ?? []) as Trip[]) {
        const outboundFlight = trip.legs?.find(l => l.leg_type === 'flight_outbound')
        const key = [
          trip.family_member_id ?? '',
          trip.trip_start_date ?? '',
          outboundFlight?.flight_number ?? trip.outbound_flight_number ?? trip.trip_title ?? '',
        ].join('|')
        const existing = seen.get(key)
        if (!existing || trip.created_at > existing.created_at) {
          seen.set(key, trip)
        }
      }
      return Array.from(seen.values()).sort((a, b) =>
        (a.trip_start_date ?? '').localeCompare(b.trip_start_date ?? '')
      )
    },
    staleTime: 1000 * 60 * 5,
  })
}

export function useTrip(id: string) {
  return useQuery({
    queryKey: ['trips', id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('*, legs:events!trip_id(*)')
        .eq('id', id)
        .single()
      if (error) throw error
      return data as Trip
    },
    enabled: !!id,
  })
}
