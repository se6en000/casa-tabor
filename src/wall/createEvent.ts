import type { QueryClient } from '@tanstack/react-query'
import { getAssistantDeviceId } from '../lib/assistantTelemetry'
import { invalidateAllCalendarQueries } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { readActionResult, responseBody } from './assistantActions'

/**
 * Adding by touch, from the wall's + or the phone's: the same create call voice uses
 * (people, place, drive time and Google sync all happen there). The time was chosen on
 * purpose, so a clash doesn't block it. `surface` labels where it came from in the traces.
 */
export async function createEventByTouch(queryClient: QueryClient, args: Record<string, unknown>, surface: 'wall' | 'phone'): Promise<void> {
  const actionId = crypto.randomUUID()
  const requestArgs = { ...args, allow_calendar_conflicts: true }
  const { data, error } = await supabase.functions.invoke('execute-ai-action', {
    body: {
      tool: 'create_event',
      args: requestArgs,
      action_id: actionId,
      correlation_id: `${surface}-add:${actionId}`,
      lane: 'touch',
      device_id: getAssistantDeviceId(),
      client_trace_source: `${surface}-add-sheet`,
      confirmed_by_user: true,
    },
  })
  const result = readActionResult(await responseBody(data, error), requestArgs)
  if (result.kind !== 'done') throw new Error(result.kind === 'error' ? result.message : 'That clashes with something already on the calendar.')
  invalidateAllCalendarQueries(queryClient, result.eventId ?? '')
}
