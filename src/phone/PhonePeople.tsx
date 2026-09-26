import { useMemo, useState } from 'react'
import { ChevronLeft, MessageSquare, Navigation, Phone, Search } from 'lucide-react'
import type { SavedContact, SavedPlace } from '../types'
import { contactCards } from './contacts'

// People on the phone: find someone, then call, text or drive there.
export default function PhonePeople({ contacts, places, onClose }: { contacts: SavedContact[]; places: SavedPlace[]; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const cards = useMemo(() => contactCards(contacts, places, query), [contacts, places, query])
  const action = 'flex h-[44px] flex-1 items-center justify-center gap-[6px] rounded-full border border-solid border-wall-ink-2 text-phone-detail font-semibold text-wall-ink no-underline'
  return (
    <section aria-label="People" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 flex-col gap-[12px] border-0 border-b border-solid border-wall-stone bg-phone-ground px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <div className="flex items-center gap-[12px]">
          <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><ChevronLeft size={20} /></button>
          <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">People</h1>
        </div>
        <label className="flex h-[48px] items-center gap-[10px] rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px]">
          <Search size={18} className="shrink-0 text-wall-ink-2" aria-hidden="true" />
          <input type="search" aria-label="Find a person" placeholder="A name, “coach”, a place…" value={query} onChange={(e) => setQuery(e.target.value)} className="min-w-0 flex-1 border-0 bg-transparent text-phone-body text-wall-ink outline-none" />
        </label>
      </div>
      <div className="flex-1 overflow-y-auto overscroll-contain px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))]">
        {cards.length === 0 && <div className="py-[16px] font-display text-phone-heading italic text-wall-ink-2">Nobody by that name yet.</div>}
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
    </section>
  )
}
