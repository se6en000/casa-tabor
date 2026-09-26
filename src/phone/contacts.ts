import type { SavedContact, SavedPlace } from '../types'

// The phone's People (Jake, 2026-09-26: "find a person and get their address and drive
// there or call"): saved contacts as cards with what Call, Text and Directions need.

export interface ContactCard {
  id: string
  name: string
  /** "Liv's softball coach" */
  detail: string | null
  phone: string | null
  /** For tel:/sms: links: digits with a country code ("+15615550101"), or null. */
  tel: string | null
  email: string | null
  /** Where to drive: their own address, or their saved place's. */
  address: string | null
  placeName: string | null
}

type ContactInput = Pick<SavedContact, 'id' | 'name' | 'aliases' | 'relationship' | 'phone' | 'email' | 'address' | 'primary_place_id' | 'confirmed' | 'occurrence_count' | 'dismissed_at'>
type PlaceInput = Pick<SavedPlace, 'id' | 'name' | 'address' | 'city' | 'state' | 'zip'>

function dialable(phone: string | null): string | null {
  const digits = (phone ?? '').replace(/[^\d+]/g, '')
  if (!digits) return null
  if (digits.startsWith('+')) return digits
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return digits
}

function placeAddress(place: PlaceInput | undefined): string | null {
  if (!place) return null
  const cityLine = [place.city, [place.state, place.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ')
  return [place.address, cityLine].filter(Boolean).join(', ') || null
}

export function contactCards(contacts: ContactInput[], places: PlaceInput[], query: string): ContactCard[] {
  const placeById = new Map(places.map((p) => [p.id, p]))
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return contacts
    .filter((c) => !c.dismissed_at)
    .map((c) => {
      const place = c.primary_place_id ? placeById.get(c.primary_place_id) : undefined
      const card: ContactCard = {
        id: c.id,
        name: c.name,
        detail: c.relationship,
        phone: c.phone,
        tel: dialable(c.phone),
        email: c.email,
        address: c.address?.trim() || placeAddress(place),
        placeName: place?.name ?? null,
      }
      const haystack = [c.name, ...(c.aliases ?? []), c.relationship ?? '', place?.name ?? '', c.address ?? ''].join(' ').toLowerCase()
      return { card, c, hit: words.every((w) => haystack.includes(w)) }
    })
    .filter((x) => x.hit)
    .sort((a, b) => Number(b.c.confirmed) - Number(a.c.confirmed) || (b.c.occurrence_count ?? 0) - (a.c.occurrence_count ?? 0) || a.c.name.localeCompare(b.c.name))
    .map((x) => x.card)
}
