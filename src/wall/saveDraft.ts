import type { QueryClient } from '@tanstack/react-query'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { clearReminderDueDate, reconcileTransportationLegTimes, toggleEventAttendee, updateEventSchedule, updateEventTitle, updateEventVenue } from '../lib/eventMutations'
import { syncTransportationAttendees } from '../lib/eventTransportation'
import { saveEventTransportationOverride } from '../lib/eventPlanOverrides'
import { supabase } from '../lib/supabase'
import { savePlanFor, withDriver, type EditDraft, type EditableEvent } from './editing'
import type { WallMember } from './engine/types'

/**
 * Saves an edit draft through the app's existing mutations, one step at a time, each
 * from the event as the previous step left it. Shared by the wall's event sheet and
 * the phone, so an edit saves the same way from either.
 */
export async function saveDraft({ event, draft, members, queryClient }: { event: EditableEvent; draft: EditDraft; members: WallMember[]; queryClient: QueryClient }): Promise<void> {
  const full = event as unknown as EventWithDetails
  let current = full
  for (const step of savePlanFor(event, draft)) {
    if (step.kind === 'title') await updateEventTitle(supabase, queryClient, event.id, step.title)
    if (step.kind === 'people') {
      // One member at a time, each from the event as the previous step left it.
      for (const id of [...step.add, ...step.remove]) {
        const adding = step.add.includes(id)
        await toggleEventAttendee(supabase, queryClient, current, id, adding, members as never)
        const person = members.find((m) => m.id === id)
        const hasRow = current.members.some((m) => (m.family_member?.id ?? m.id) === id)
        const nextMembers = adding
          ? hasRow
            ? current.members.map((m) => ((m.family_member?.id ?? m.id) === id ? { ...m, role: 'attendee' } : m)) // a driver row becomes "going"
            : [...current.members, { id: crypto.randomUUID(), role: 'attendee', family_member: person as never }]
          : current.members.filter((m) => (m.family_member?.id ?? m.id) !== id)
        const plan = current.plan_override?.transportation_plan
        current = {
          ...current,
          members: nextMembers,
          plan_override: plan && current.plan_override
            ? { ...current.plan_override, transportation_plan: syncTransportationAttendees(plan, nextMembers.map((m) => m.family_member?.name ?? '').filter(Boolean)) }
            : current.plan_override,
        }
      }
    }
    if (step.kind === 'driver') {
      const name = members.find((m) => m.id === step.driverId)?.name ?? ''
      const plan = withDriver(current as never, current.plan_override?.transportation_plan, step.driverId, name)
      await saveEventTransportationOverride({ supabase, queryClient, event: current, transportationPlan: plan, waits: current.plan_override?.waits, modeOverride: current.plan_override?.mode_override })
      current = { ...current, plan_override: { ...(current.plan_override ?? ({} as never)), transportation_plan: plan } }
    }
    if (step.kind === 'clearDueDate') await clearReminderDueDate(supabase, queryClient, event.id)
    if (step.kind === 'schedule') {
      await updateEventSchedule(supabase, queryClient, current, step.start, step.end, step.allDay)
      const plan = current.plan_override?.transportation_plan
      current = {
        ...current,
        start_time: step.start.toISOString(),
        end_time: step.end.toISOString(),
        all_day: step.allDay,
        plan_override: plan && current.plan_override && !step.allDay
          ? { ...current.plan_override, transportation_plan: reconcileTransportationLegTimes(plan, step.start, step.end) }
          : current.plan_override,
      }
    }
    if (step.kind === 'venue') await updateEventVenue(supabase, queryClient, current, step.venue, { familyMembers: members as never })
  }
}
