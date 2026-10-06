import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { FamilyMember } from '../types'
import type { WallMember } from '../wall/engine/types'
import PersonPage from '../wall/PersonPage'
import RoutineEditor, { type DayOffRow } from '../wall/RoutineEditor'
import { newRoutine } from '../wall/routines'
import { addDayOff, removeDayOff, removeRoutine, saveRoutine } from '../wall/saveRoutine'
import { usePersonKnown } from '../wall/usePersonKnown'

// A person's page on the phone (canvas 16c: People › Family › Owen), and the routine editor from its Edit.

export interface PhonePersonProps {
  member: WallMember
  members: WallMember[]
  routines: FamilyRoutine[]
  dayOffs: DayOffRow[]
  now: Date
  canEdit: boolean
  onBack: () => void
}

export default function PhonePerson({ member, members, routines, dayOffs, now, canEdit, onBack }: PhonePersonProps) {
  const known = usePersonKnown(member.id, 'phone')
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ routine: FamilyRoutine; isNew: boolean } | null>(null)
  const drivers = members.filter((m) => m.can_drive).map((m) => ({ id: m.id, name: m.name }))
  const page = (
    <PersonPage
      surface="phone"
      name={member.name}
      routines={routines}
      known={known}
      canEdit={canEdit}
      onEdit={(routine) => setEditing({ routine, isNew: false })}
      onAdd={(kind) => setEditing({ routine: newRoutine(kind, member.id, routines), isNew: true })}
    />
  )
  return (
    <section aria-label={`${member.name}’s page`} className="absolute inset-0 z-30 flex flex-col bg-phone-ground font-body text-wall-ink">
      {!editing && (
        <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-wall-paper p-0 text-wall-ink"><ChevronLeft size={20} /></button>
          <span className="flex flex-col">
            <span className="text-phone-label text-wall-ink-2">People › Family</span>
            <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">{member.name}</h1>
          </span>
        </div>
      )}
      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[16px]">
        {editing ? (
          <RoutineEditor
            surface="phone"
            personName={member.name}
            routine={editing.routine}
            isNew={editing.isNew}
            drivers={drivers}
            dayOffs={dayOffs}
            now={now}
            onCancel={() => setEditing(null)}
            onSave={async (routine, offs) => {
              await saveRoutine(queryClient, routine, members as unknown as FamilyMember[])
              for (const day of offs.add) await addDayOff(queryClient, member.id, day)
              for (const id of offs.remove) await removeDayOff(queryClient, id)
              setEditing(null)
            }}
            onRemove={async () => {
              await removeRoutine(queryClient, editing.routine)
              setEditing(null)
            }}
          />
        ) : page}
      </div>
    </section>
  )
}
