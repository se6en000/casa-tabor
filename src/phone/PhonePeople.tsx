import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, MessageSquare, Navigation, Phone, Search } from 'lucide-react'
import type { FamilyRoutine } from '../lib/familyRoutines'
import type { SavedContact, SavedPlace } from '../types'
import type { WallMember } from '../wall/engine/types'
import { pigmentIndexes } from '../wall/score'
import { pigmentStyleFor } from '../wall/lanes'
import { routineHeadline } from '../wall/routines'
import type { DayOffRow } from '../wall/RoutineEditor'
import { contactCards } from './contacts'
import PhonePerson from './PhonePerson'

/** The family on People (canvas 16c): each person's page holds their routines and what Casa knows. */
export interface PhoneFamily {
  members: WallMember[]
  routines: FamilyRoutine[]
  dayOffs: Array<DayOffRow & { memberId: string }>
  now: Date
  canEdit: boolean
}

// People on the phone: the family first (each opens their page), then find someone to call, text or drive to.
export default function PhonePeople({ contacts, places, onClose, family }: { contacts: SavedContact[]; places: SavedPlace[]; onClose: () => void; family?: PhoneFamily }) {
  const [query, setQuery] = useState('')
  const [personId, setPersonId] = useState<string | null>(null)
  const cards = useMemo(() => contactCards(contacts, places, query), [contacts, places, query])
  // The people on the wall's lanes, and anyone with a routine (not the pets or the family's email box).
  const people = useMemo(() => {
    if (!family) return []
    const q = query.trim().toLowerCase()
    return family.members
      .filter((m) => m.show_on_home_sidebar !== false || family.routines.some((r) => r.memberId === m.id))
      .filter((m) => !q || m.name.toLowerCase().includes(q))
  }, [family, query])
  const pigments = useMemo(() => pigmentIndexes(family?.members ?? []), [family])
  const person = family && personId ? family.members.find((m) => m.id === personId) ?? null : null
  const action = 'flex h-[44px] flex-1 items-center justify-center gap-[6px] rounded-full border border-solid border-wall-ink-2 text-phone-detail font-semibold text-wall-ink no-underline'
  return (
    <section aria-label="People" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 flex-col gap-[12px] border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <div className="flex items-center gap-[12px]">
          <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-wall-paper p-0 text-wall-ink"><ChevronLeft size={20} /></button>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">People</h1>
        </div>
        <label className="flex h-[48px] items-center gap-[10px] rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px]">
          <Search size={18} className="shrink-0 text-wall-ink-2" aria-hidden="true" />
          <input type="search" aria-label="Find a person" placeholder="A name, “coach”, a place…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-phone-body text-wall-ink outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))]">
        {people.length > 0 && (
          <div aria-label="Family" role="group" className="flex flex-col pb-[8px]">
            <div className="pt-[14px] text-phone-label font-bold tracking-[0.2em] text-wall-ink-2">FAMILY</div>
            {people.map((m) => {
              const mine = family!.routines.filter((r) => r.memberId === m.id)
              return (
                <button key={m.id} type="button" onClick={() => setPersonId(m.id)} className="flex min-h-[56px] items-center gap-[12px] border-0 border-b border-solid border-wall-stone bg-transparent py-[8px] text-left text-wall-ink">
                  <span aria-hidden="true" className={`flex h-[40px] w-[40px] shrink-0 items-center justify-center rounded-full font-display text-phone-heading font-bold text-wall-on-pigment ${pigmentStyleFor(pigments.get(m.id) ?? 0).solid}`}>{m.name.charAt(0)}</span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="font-display text-phone-heading font-bold">{m.name}</span>
                    {mine.length > 0 && <span className="truncate text-phone-detail text-wall-ink-2">{mine.map(routineHeadline).join(' · ')}</span>}
                  </span>
                  <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
                </button>
              )
            })}
            <div className="pt-[18px] text-phone-label font-bold tracking-[0.2em] text-wall-ink-2">EVERYONE ELSE</div>
          </div>
        )}
        {cards.length === 0 && people.length === 0 && <div className="py-[16px] font-display text-phone-heading italic text-wall-ink-2">Nobody by that name yet.</div>}
        {cards.map((c) => (
          <div key={c.id} className="flex flex-col gap-[8px] border-0 border-b border-solid border-wall-stone py-[12px]">
            <div>
              <div className="font-display text-phone-heading font-bold">{c.name}</div>
              {(c.detail || c.placeName) && <div className="text-phone-detail text-wall-ink-2">{[c.detail, c.placeName].filter(Boolean).join(' · ')}</div>}
              {c.address && <div className="text-phone-detail text-wall-ink-2">{c.address}</div>}
            </div>
            {(c.tel || c.address) && (
              <div className="flex gap-[8px]">
                {c.tel && <a href={`tel:${c.tel}`} className={action}><Phone size={16} aria-hidden="true" /> Call</a>}
                {c.tel && <a href={`sms:${c.tel}`} className={action}><MessageSquare size={16} aria-hidden="true" /> Text</a>}
                {c.address && (
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" className={`${action} border-0 bg-wall-ink text-wall-on-pigment`}>
                    <Navigation size={16} aria-hidden="true" /> Directions
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      {person && family && (
        <PhonePerson
          member={person}
          members={family.members}
          routines={family.routines.filter((r) => r.memberId === person.id)}
          dayOffs={family.dayOffs.filter((d) => d.memberId === person.id)}
          now={family.now}
          canEdit={family.canEdit}
          onBack={() => setPersonId(null)}
        />
      )}
    </section>
  )
}
