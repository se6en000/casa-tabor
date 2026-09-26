import { useProfileSession } from '../contexts/useProfileSession'
import { useFamilyDay } from '../wall/useFamilyDay'
import { toggleChecklistItem } from '../wall/useWallChecklist'
import PhoneView from './PhoneView'

/** The phone with live data: the same family day as the Wall, seen by whoever unlocked this phone. */
export default function PhoneFrame() {
  const { profile } = useProfileSession()
  const { now, members, week, allEvents, tripActions, checklist, queryClient } = useFamilyDay()
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
    />
  )
}
