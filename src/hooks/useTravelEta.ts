import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface TravelEtaResult {
  found: boolean
  error?: string
  origin?: string
  destination?: string
  departure_time?: string
  arrival_time?: string
  leave_by?: string
  drive_time_mins?: number
  base_drive_time_mins?: number | null
  traffic_delay_mins?: number
  distance_miles?: number
  buffer_mins?: number
  route_summary?: string
}

export function useTravelEta({
  destination,
  eventStartIso,
  enabled = true,
  bufferMins = 10,
  refetchIntervalMs = false,
}: {
  destination: string | null
  eventStartIso?: string | null
  enabled?: boolean
  bufferMins?: number
  refetchIntervalMs?: number | false
}) {
  const trimmedDestination = destination?.trim() ?? ''
  return useQuery({
    queryKey: ['travel-eta', trimmedDestination, eventStartIso ?? null, bufferMins],
    enabled: enabled && trimmedDestination.length > 0,
    staleTime: 5 * 60_000,
    refetchInterval: refetchIntervalMs,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('route-eta', {
        body: {
          destination: trimmedDestination,
          arrival_time: eventStartIso ?? null,
          buffer_mins: bufferMins,
        },
      })
      if (error) throw error
      return (data ?? { found: false, error: 'No travel ETA response' }) as TravelEtaResult
    },
  })
}
