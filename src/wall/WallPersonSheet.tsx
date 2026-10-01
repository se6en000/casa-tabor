import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { FamilyMember } from '../types'
import type { WallMember } from './engine/types'
import { pigmentStyleFor } from './lanes'
import PersonPage from './PersonPage'
import RoutineEditor, { type DayOffRow } from './RoutineEditor'
import { newRoutine, type RoutineKind } from './routines'
import { addDayOff, removeDayOff, removeRoutine, saveRoutine } from './saveRoutine'
import { OUTLINE } from './surface'
import { usePersonKnown } from './usePersonKnown'

// A person's page on the wall (canvas 16e): tap a name at the start of a lane and it slides in beside the day.
// Walk away and it closes: 2 minutes on the page, 5 while editing (unsaved changes are dropped).

const PAGE_IDLE_MS = 2 * 60_000
const EDIT_IDLE_MS = 5 * 60_000

export interface WallPersonSheetProps {
  member: WallMember
  members: WallMember[]
  pigmentIndex: number
  routines: FamilyRoutine[]
  dayOffs: DayOffRow[]
  now: Date
  onClose: () => void
}

export default function WallPersonSheet({ member, members, pigmentIndex, routines, dayOffs, now, onClose }: WallPersonSheetProps) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{ routine: FamilyRoutine; isNew: boolean } | null>(null)
  const known = usePersonKnown(member.id, 'wall')
  const lastTouch = useRef(0)
  useEffect(() => {
    lastTouch.current = Date.now()
    const timer = window.setInterval(() => {
      if (Date.now() - lastTouch.current > (editing ? EDIT_IDLE_MS : PAGE_IDLE_MS)) onClose()
    }, 10_000)
    return () => window.clearInterval(timer)
  }, [editing, onClose])
  const drivers = members.filter((m) => m.can_drive).map((m) => ({ id: m.id, name: m.name }))
  const asFamily = members as unknown as FamilyMember[]

  return (
    <div
      className="absolute inset-0 z-30 flex justify-end bg-wall-ink/20"
      onPointerDownCapture={() => { lastTouch.current = Date.now() }}
      onClick={(e) => { e.stopPropagation(); if (!editing) onClose() }}
    >
      <section
        aria-label={`${member.name}’s page`}
        // Not positioned, so the wall keyboard spans the whole stage, not just this panel.
        className={`flex h-[1080px] ${editing ? 'w-[760px]' : 'w-[640px]'} flex-col gap-[20px] overflow-y-auto overscroll-contain rounded-l-[28px] bg-wall-on-pigment px-[44px] pb-[480px] pt-[40px] font-body text-wall-ink`}
        onClick={(e) => e.stopPropagation()}
      >
        {editing ? (
          <RoutineEditor
            surface="wall"
            personName={member.name}
            routine={editing.routine}
            isNew={editing.isNew}
            drivers={drivers}
            dayOffs={dayOffs}
            now={now}
            onCancel={() => setEditing(null)}
            onSave={async (routine, offs) => {
              await saveRoutine(queryClient, routine, asFamily)
              for (const day of offs.add) await addDayOff(queryClient, member.id, day)
              for (const id of offs.remove) await removeDayOff(queryClient, id)
              setEditing(null)
            }}
            onRemove={async () => {
              await removeRoutine(queryClient, editing.routine)
              setEditing(null)
            }}
          />
        ) : (
          <>
            <div className="flex items-center gap-[16px]">
              <span aria-hidden="true" className={`flex h-[64px] w-[64px] shrink-0 items-center justify-center rounded-full font-display text-wall-date font-bold text-wall-on-pigment ${pigmentStyleFor(pigmentIndex).solid}`}>{member.name.charAt(0)}</span>
              <span className="flex-1 font-display text-wall-move font-bold">{member.name}</span>
              <button type="button" onClick={onClose} className={`flex h-[52px] items-center rounded-full px-[22px] text-wall-detail font-semibold ${OUTLINE}`}>Close</button>
            </div>
            <PersonPage
              surface="wall"
              name={member.name}
              routines={routines}
              known={known}
              onEdit={(routine) => setEditing({ routine, isNew: false })}
              onAdd={(kind: RoutineKind) => setEditing({ routine: newRoutine(kind, member.id, routines), isNew: true })}
            />
          </>
        )}
      </section>
    </div>
  )
}
