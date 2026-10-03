import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

export type DriveLookup = (place: string, arrival: string) => Promise<number | null>

/** Drive minutes from home (the `route-eta` lookup the edit sheet uses). */
export async function routeEta(place: string, arrival: string): Promise<number | null> {
  const { data } = await supabase.functions.invoke('route-eta', { body: { destination: place, arrival_time: arrival, buffer_mins: 5 } })
  const eta = data as { found?: boolean; drive_time_mins?: number } | null
  return eta?.found && typeof eta.drive_time_mins === 'number' ? eta.drive_time_mins : null
}

/**
 * The drive to the new place an assistant action names (an add's, or a change's), for the
 * card's leave-by; looked up once per place and time. Null until known, or with no new place.
 */
export function useDriveMinutes(
  action: { tool: string; args: Record<string, unknown> } | null,
  events: Array<{ id: string; start_time: string }>,
  lookup: DriveLookup = routeEta,
): number | null {
  // The address when Casa found one (a name alone can be looked up as the wrong place).
  const said = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
  const place = action && (action.tool === 'create_event' || action.tool === 'update_event') ? said(action.args.address) || said(action.args.location) || null : null
  const arrival = typeof action?.args.start === 'string' ? action.args.start : events.find((e) => e.id === action?.args.id)?.start_time ?? null
  const [known, setKnown] = useState<Record<string, number | null>>({})
  const key = place && arrival ? `${place}|${arrival}` : null
  useEffect(() => {
    if (!key || key in known || !place || !arrival) return
    let live = true
    void lookup(place, arrival).catch(() => null).then((minutes) => {
      if (live) setKnown((k) => ({ ...k, [key]: minutes }))
    })
    return () => { live = false }
  }, [key]) // eslint-disable-line react-hooks/exhaustive-deps
  return key ? known[key] ?? null : null
}
