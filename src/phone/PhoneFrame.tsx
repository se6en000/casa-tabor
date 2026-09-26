import { useProfileSession } from '../contexts/useProfileSession'
import type { EventWithDetails } from '../hooks/useCalendarEvents'
import { deleteCalendarEvent } from '../lib/eventMutations'
import { supabase } from '../lib/supabase'
import { saveDraft } from '../wall/saveDraft'
import { createEventByTouch } from '../wall/createEvent'
import { useFamilyDay } from '../wall/useFamilyDay'
import { toggleChecklistItem } from '../wall/useWallChecklist'
import PhoneView from './PhoneView'
import PhoneAssistant from './PhoneAssistant'
import type { FamilyMember } from '../types'
import { useSavedContacts } from '../hooks/useSavedContacts'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import { scanDocumentFiles } from '../utils/documentScanner'

/** The phone with live data: the same family day as the Wall, seen by whoever unlocked this phone. */
export default function PhoneFrame() {
  const { profile } = useProfileSession()
  const { now, members, week, allEvents, tripActions, checklist, queryClient, keep, setKeptFrom } = useFamilyDay({ kind: 'member', memberId: profile?.memberId ?? '' })
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
      scan={(files) => scanDocumentFiles(files, members.map((m) => ({ id: m.id, name: m.name, full_name: m.full_name ?? null })))}
      assistant={({ onClose, onOpenEvent }) => <PhoneAssistant events={allEvents as unknown as EventWithDetails[]} family={members as unknown as FamilyMember[]} onClose={onClose} onOpenEvent={onOpenEvent} />}
      keepFrom={keep}
      setKeptFrom={setKeptFrom}
      contacts={contacts}
      places={places}
    />
  )
}
