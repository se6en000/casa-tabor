import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { saveDraft } from '../wall/saveDraft'
import { createEventByTouch } from '../wall/createEvent'
import { useFamilyDay } from '../wall/useFamilyDay'
import { toggleChecklistItem } from '../wall/useWallChecklist'
import PhoneView from './PhoneView'
import { useSavedContacts } from '../hooks/useSavedContacts'
import { useSavedPlaces } from '../hooks/useSavedPlaces'

/** The phone with live data: the same family day as the Wall, seen by whoever unlocked this phone. */
export default function PhoneFrame() {
  const { profile } = useProfileSession()
  const { now, members, week, allEvents, tripActions, checklist, queryClient } = useFamilyDay()
  const { data: contacts = [] } = useSavedContacts()
  const { data: places = [] } = useSavedPlaces()
  return (
    <PhoneView
      now={now}
      viewerId={profile?.memberId ?? ''}
      members={members}
      week={week}
      events={allEvents}
      checklist={checklist}
      tripActions={tripActions}
      onToggleItem={(item) => void toggleChecklistItem(queryClient, item.id, !item.checked)}
      saveEvent={(event, draft) => saveDraft({ event, draft, members, queryClient })}
      deleteEvent={(event) => deleteCalendarEvent(supabase, queryClient, event.id, event as unknown as EventWithDetails)}
      createEvent={(args) => createEventByTouch(queryClient, args, 'phone')}
      contacts={contacts}
      places={places}
    />
  )
}
