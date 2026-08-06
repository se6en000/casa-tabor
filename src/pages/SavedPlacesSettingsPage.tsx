import { useState, useCallback } from 'react'
import {
  Plus, Trash2, Save, X, MapPin, Phone, Mail,
  Search, BookmarkCheck, Home, Utensils, School, Dumbbell,
  Briefcase, HeartPulse, Star, Edit2, Users, User, Copy, Check,
  Plane, ShoppingBag, Wrench, MessageCircle, MapPinned, Link2,
  UserCheck,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { ContactPlaceRelationship, FamilyContactRelationship, SavedContact, SavedPlace, SavedPlaceCategory } from '../types'
import { savedPlaceAddress } from '../hooks/useSavedPlaces'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { Button, Checkbox, Combobox, IconButton, SegmentedControl } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'

// ── Types ─────────────────────────────────────────────────────────────────────

type SavedPlaceInput = Omit<SavedPlace, 'id' | 'lat' | 'lng' | 'google_place_id' | 'last_seen_at' | 'created_at' | 'updated_at'>
type SavedContactInput = Omit<SavedContact, 'id' | 'primary_place' | 'last_seen_at' | 'created_at' | 'updated_at'>

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORIES: { value: SavedPlaceCategory; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'friends_house', label: "Friend's House",  icon: Home },
  { value: 'restaurant',    label: 'Restaurant',      icon: Utensils },
  { value: 'school',        label: 'School',          icon: School },
  { value: 'sports',        label: 'Sports / Venue',  icon: Dumbbell },
  { value: 'work',          label: 'Work',            icon: Briefcase },
  { value: 'medical',       label: 'Medical',         icon: HeartPulse },
  { value: 'travel',        label: 'Travel',          icon: Plane },
  { value: 'errand',        label: 'Errand',          icon: ShoppingBag },
  { value: 'home_service',  label: 'Home Service',    icon: Wrench },
  { value: 'social',        label: 'Social / Venue',  icon: MessageCircle },
  { value: 'other',         label: 'Other',           icon: Star },
]

function categoryMeta(cat: SavedPlaceCategory) {
  return CATEGORIES.find(c => c.value === cat) ?? CATEGORIES[CATEGORIES.length - 1]
}

// ── Place blank form ──────────────────────────────────────────────────────────

function blankPlace(): Partial<SavedPlace> & { _aliasText: string } {
  return { name: '', aliases: [], _aliasText: '', address: '', city: '', state: '', zip: '', phone: '', notes: '', category: 'other' }
}

// ── Place form ────────────────────────────────────────────────────────────────

interface PlaceFormProps {
  initial?: (Partial<SavedPlace> & { _aliasText?: string }) | null
  onSave: (place: SavedPlaceInput) => void
  onCancel: () => void
  saving?: boolean
}

function PlaceForm({ initial, onSave, onCancel, saving }: PlaceFormProps) {
  const [form, setForm] = useState<Partial<SavedPlace> & { _aliasText: string }>({
    ...blankPlace(), ...initial, _aliasText: initial?.aliases?.join(', ') ?? '',
  })
  function set(key: string, value: unknown) { setForm(f => ({ ...f, [key]: value })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const aliases = form._aliasText.split(',').map(s => s.trim()).filter(Boolean)
    onSave({ name: form.name ?? '', aliases, address: form.address || null, city: form.city || null, state: form.state || null, zip: form.zip || null, phone: form.phone || null, notes: form.notes || null, category: form.category ?? 'other', confirmed: true, source: 'manual', occurrence_count: form.occurrence_count ?? 1 })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Name *</label>
        <input required value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder="e.g. Springmeyer's House"
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">
          Aliases / Nicknames <span className="font-normal ml-1">(comma-separated — the AI will match these)</span>
        </label>
        <input value={form._aliasText} onChange={e => set('_aliasText', e.target.value)} placeholder='"the Springmeyers", "Springmeyer house"'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Category</label>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const Icon = cat.icon
            const selected = form.category === cat.value
            return (
              <Button key={cat.value} type="button" onClick={() => set('category', cat.value)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors',
                  selected ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                <Icon size={12} />{cat.label}
              </Button>
            )
          })}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <label className="block text-caption font-semibold text-casa-muted mb-1">Street Address</label>
          <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="123 Main St"
            className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
        </div>
        <div>
          <label className="block text-caption font-semibold text-casa-muted mb-1">City</label>
          <input value={form.city ?? ''} onChange={e => set('city', e.target.value)} placeholder="West Palm Beach"
            className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-caption font-semibold text-casa-muted mb-1">State</label>
            <input value={form.state ?? ''} onChange={e => set('state', e.target.value)} placeholder="FL" maxLength={2}
              className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold uppercase" />
          </div>
          <div>
            <label className="block text-caption font-semibold text-casa-muted mb-1">ZIP</label>
            <input value={form.zip ?? ''} onChange={e => set('zip', e.target.value)} placeholder="33401"
              className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
          </div>
        </div>
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Phone</label>
        <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="(561) 555-1234"
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Notes <span className="font-normal ml-1">(context the AI can use)</span></label>
        <textarea rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder='"Jake and Ayla are best friends. Dogs in yard."'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold resize-none" />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-casa-border text-body text-casa-muted hover:bg-casa-divider transition-colors">Cancel</Button>
        <Button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors disabled:opacity-50">
          <Save size={14} />{saving ? 'Saving…' : 'Save Place'}
        </Button>
      </div>
    </form>
  )
}

// ── Place row ─────────────────────────────────────────────────────────────────

function PlaceRow({ place, onEdit, onDelete }: { place: SavedPlace; onEdit: () => void; onDelete: () => void }) {
  const meta = categoryMeta(place.category)
  const Icon = meta.icon
  const fullAddress = [place.address, place.city, place.state, place.zip].filter(Boolean).join(', ')
  const [copied, setCopied] = useState(false)
  const handleCopyAddress = useCallback(async () => {
    if (!fullAddress) return
    try { await navigator.clipboard.writeText(fullAddress); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }, [fullAddress])
  return (
    <div className="flex items-start gap-3 bg-casa-surface border border-casa-border rounded-card p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="w-9 h-9 rounded-full bg-casa-gold/10 flex items-center justify-center text-casa-gold shrink-0 mt-0.5">
        <Icon size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display text-heading text-casa-navy leading-none">{place.name}</p>
          <span className="text-caption font-semibold text-casa-muted bg-casa-divider px-2 py-0.5 rounded-full">{meta.label}</span>
        </div>
        {place.aliases.length > 0 && <p className="text-caption text-casa-gold mt-0.5 truncate">Also known as: {place.aliases.join(', ')}</p>}
        {fullAddress && (
          <Button
            variant="subtle"
            size="sm"
            align="start"
            onClick={handleCopyAddress}
            leadingIcon={<MapPin size={14} aria-hidden="true" />}
            trailingIcon={copied ? <Check size={14} className="text-casa-success" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            className="mt-1 max-w-full px-3"
            contentClassName="min-w-0"
            aria-label={copied ? `Address copied for ${place.name}` : `Copy address for ${place.name}`}
          >
            <span className="truncate">{fullAddress}</span>
            <span className="sr-only" aria-live="polite">{copied ? 'Address copied' : ''}</span>
          </Button>
        )}
        {place.phone && <p className="flex items-center gap-1 text-caption text-casa-muted mt-0.5"><Phone size={11} />{place.phone}</p>}
        {place.notes && <p className="text-caption text-casa-muted mt-1 italic line-clamp-2">{place.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <IconButton onClick={onEdit} variant="ghost" size="sm" icon={<Edit2 size={16} />} aria-label="Edit place" title="Edit place" />
        <IconButton onClick={onDelete} variant="danger" size="sm" icon={<Trash2 size={16} />} aria-label="Delete place" title="Delete place" />
      </div>
    </div>
  )
}

// ── Contact blank form ────────────────────────────────────────────────────────

function blankContact(): Partial<SavedContact> & { _aliasText: string } {
  return {
    name: '',
    aliases: [],
    _aliasText: '',
    relationship: '',
    phone: '',
    email: '',
    address: '',
    notes: '',
    primary_place_id: null,
    primary_place_source: null,
  }
}

// ── Contact form ──────────────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: (Partial<SavedContact> & { _aliasText?: string }) | null
  places: SavedPlace[]
  onSave: (c: SavedContactInput) => void
  onCancel: () => void
  saving?: boolean
}

function ContactForm({ initial, places, onSave, onCancel, saving }: ContactFormProps) {
  const [form, setForm] = useState<Partial<SavedContact> & { _aliasText: string }>({
    ...blankContact(), ...initial, _aliasText: initial?.aliases?.join(', ') ?? '',
  })
  const placeOptions = [
    { value: '', label: 'No linked place' },
    ...places.map(place => ({
      value: place.id,
      label: [place.name, savedPlaceAddress(place)].filter(Boolean).join(' — '),
    })),
  ]
  function set(key: string, value: unknown) { setForm(f => ({ ...f, [key]: value })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const aliases = form._aliasText.split(',').map(s => s.trim()).filter(Boolean)
    onSave({
      name: form.name ?? '',
      aliases,
      relationship: form.relationship || null,
      phone: form.phone || null,
      email: form.email || null,
      address: null,
      notes: form.notes || null,
      primary_place_id: form.primary_place_id || null,
      primary_place_source: form.primary_place_id ? 'manual' : null,
      confirmed: true,
      source: 'manual',
      occurrence_count: form.occurrence_count ?? 1,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Name *</label>
        <input required value={form.name ?? ''} onChange={e => set('name', e.target.value)} placeholder='e.g. The Springmeyers'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">
          Aliases / Nicknames <span className="font-normal ml-1">(comma-separated — the AI will match these)</span>
        </label>
        <input value={form._aliasText} onChange={e => set('_aliasText', e.target.value)} placeholder='"Springmeyers", "Jake&apos;s friend Ayla"'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Relationship</label>
        <input value={form.relationship ?? ''} onChange={e => set('relationship', e.target.value)} placeholder='e.g. Family friend, Doctor, Coach'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-caption font-semibold text-casa-muted mb-1">Phone</label>
          <input type="tel" value={form.phone ?? ''} onChange={e => set('phone', e.target.value)} placeholder="(561) 555-1234"
            className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
        </div>
        <div>
          <label className="block text-caption font-semibold text-casa-muted mb-1">Email</label>
          <input type="email" value={form.email ?? ''} onChange={e => set('email', e.target.value)} placeholder="jane@example.com"
            className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
        </div>
      </div>
      <div>
        <Combobox
          label="Primary place"
          value={form.primary_place_id ?? ''}
          onChange={value => set('primary_place_id', value || null)}
          options={placeOptions}
          placeholder="Search saved places"
        />
        <p className="mt-1 text-caption text-casa-muted">Where this person or provider is usually reached. Their address stays connected to the place.</p>
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Notes <span className="font-normal ml-1">(context the AI can use)</span></label>
        <textarea rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder='"Kids are Ayla (8) and Ben (5). Birthday in March."'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold resize-none" />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <Button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-casa-border text-body text-casa-muted hover:bg-casa-divider transition-colors">Cancel</Button>
        <Button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors disabled:opacity-50">
          <Save size={14} />{saving ? 'Saving…' : 'Save Contact'}
        </Button>
      </div>
    </form>
  )
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({ contact, onEdit, onDelete }: { contact: SavedContact; onEdit: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const primaryPlaceAddress = contact.primary_place ? savedPlaceAddress(contact.primary_place) : ''
  const destination = contact.primary_place
    ? [contact.primary_place.name, primaryPlaceAddress].filter(Boolean).join(' — ')
    : contact.address
  const handleCopyAddress = useCallback(async () => {
    if (!destination) return
    try { await navigator.clipboard.writeText(destination); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }, [destination])
  return (
    <div className="flex items-start gap-3 bg-casa-surface border border-casa-border rounded-card p-4 shadow-card hover:shadow-card-hover transition-shadow">
      <div className="w-9 h-9 rounded-full bg-casa-navy/10 flex items-center justify-center text-casa-navy shrink-0 mt-0.5">
        <User size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display text-heading text-casa-navy leading-none">{contact.name}</p>
          {contact.relationship && <span className="text-caption font-semibold text-casa-muted bg-casa-divider px-2 py-0.5 rounded-full">{contact.relationship}</span>}
        </div>
        {contact.aliases.length > 0 && <p className="text-caption text-casa-gold mt-0.5 truncate">Also known as: {contact.aliases.join(', ')}</p>}
        {contact.phone && <p className="flex items-center gap-1 text-caption text-casa-muted mt-1"><Phone size={11} />{contact.phone}</p>}
        {contact.email && <p className="flex items-center gap-1 text-caption text-casa-muted mt-0.5"><Mail size={11} />{contact.email}</p>}
        {destination && (
          <Button
            variant="subtle"
            size="sm"
            align="start"
            onClick={handleCopyAddress}
            leadingIcon={<MapPinned size={14} aria-hidden="true" />}
            trailingIcon={copied ? <Check size={14} className="text-casa-success" aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
            className="mt-0.5 max-w-full px-3"
            contentClassName="min-w-0"
            aria-label={copied ? `Address copied for ${contact.name}` : `Copy address for ${contact.name}`}
          >
            <span className="truncate">{contact.primary_place ? `Usually at ${destination}` : destination}</span>
            <span className="sr-only" aria-live="polite">{copied ? 'Address copied' : ''}</span>
          </Button>
        )}
        {contact.notes && <p className="text-caption text-casa-muted mt-1 italic line-clamp-2">{contact.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <IconButton onClick={onEdit} variant="ghost" size="sm" icon={<Edit2 size={16} />} aria-label="Edit contact" title="Edit contact" />
        <IconButton onClick={onDelete} variant="danger" size="sm" icon={<Trash2 size={16} />} aria-label="Delete contact" title="Delete contact" />
      </div>
    </div>
  )
}

// ── Suggested (derived, unconfirmed) row ─────────────────────────────────────

function SuggestedRow({ label, sublabel, occurrenceCount, onReview, onConfirm, onDismiss, confirming }: {
  label: string
  sublabel: string
  occurrenceCount: number
  onReview: () => void
  onConfirm: () => void
  onDismiss: () => void
  confirming?: boolean
}) {
  return (
    <div className="flex items-start gap-3 bg-casa-gold/5 border border-dashed border-casa-gold/40 rounded-card p-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-display text-heading text-casa-navy leading-none">{label}</p>
          <span className="text-caption font-semibold text-casa-gold bg-casa-gold/10 px-2 py-0.5 rounded-full">
            Seen {occurrenceCount}×
          </span>
        </div>
        {sublabel && <p className="text-caption text-casa-muted mt-1">{sublabel}</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
        <Button variant="secondary" size="sm" onClick={onReview} leadingIcon={<Edit2 size={15} />}>
          Review
        </Button>
        <Button size="sm" onClick={onConfirm} loading={confirming} leadingIcon={<Check size={15} />}>
          Confirm
        </Button>
        <IconButton onClick={onDismiss} variant="ghost" size="sm" icon={<X size={16} />} aria-label="Dismiss suggestion" title="Dismiss" />
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'places' | 'people' | 'connections' | 'family'
type PlaceMode = { type: 'list' } | { type: 'add' } | { type: 'edit'; place: SavedPlace }
type ContactMode = { type: 'list' } | { type: 'add' } | { type: 'edit'; contact: SavedContact }

export default function SavedPlacesSettingsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('places')
  const [placeMode, setPlaceMode] = useState<PlaceMode>({ type: 'list' })
  const [contactMode, setContactMode] = useState<ContactMode>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<SavedPlaceCategory | 'all'>('all')
  const [connectionMode, setConnectionMode] = useState<'list' | 'add'>('list')
  const [connectionContactId, setConnectionContactId] = useState('')
  const [connectionPlaceId, setConnectionPlaceId] = useState('')
  const [connectionLabel, setConnectionLabel] = useState('provider_location')
  const [connectionDefault, setConnectionDefault] = useState(true)
  const [familyLinkMode, setFamilyLinkMode] = useState<'list' | 'add'>('list')
  const [familyLinkMemberId, setFamilyLinkMemberId] = useState('')
  const [familyLinkContactId, setFamilyLinkContactId] = useState('')
  const [familyLinkLabel, setFamilyLinkLabel] = useState('')
  const [familyLinkReviewId, setFamilyLinkReviewId] = useState<string | null>(null)

  // ── Places queries ───────────────────────────────────────────────────────────
  const { data: places = [], isLoading: placesLoading } = useQuery<SavedPlace[]>({
    queryKey: ['saved_places'],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_places').select('*').order('name')
      if (error) throw error
      return data as SavedPlace[]
    },
  })

  const savePlaceMutation = useMutation({
    mutationFn: async (payload: { id?: string; data: SavedPlaceInput }) => {
      if (payload.id) {
        const { error } = await supabase.from('saved_places').update({ ...payload.data, updated_at: new Date().toISOString() }).eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('saved_places').insert({ ...payload.data, aliases: payload.data.aliases ?? [] })
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved_places'] }); setPlaceMode({ type: 'list' }) },
  })

  const deletePlaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_places').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_places'] }),
  })

  const confirmPlaceMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_places').update({ confirmed: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_places'] }),
  })

  // ── Contacts queries ─────────────────────────────────────────────────────────
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<SavedContact[]>({
    queryKey: ['saved_contacts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('saved_contacts')
        .select('*, primary_place:saved_places!saved_contacts_primary_place_id_fkey(id, name, address, city, state, zip, category)')
        .order('name')
      if (error) throw error
      return data as SavedContact[]
    },
  })

  const saveContactMutation = useMutation({
    mutationFn: async (payload: { id?: string; data: SavedContactInput }) => {
      let contactId = payload.id
      if (payload.id) {
        const { error } = await supabase.from('saved_contacts').update({ ...payload.data, updated_at: new Date().toISOString() }).eq('id', payload.id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('saved_contacts')
          .insert({ ...payload.data, aliases: payload.data.aliases ?? [] })
          .select('id')
          .single()
        if (error) throw error
        contactId = data.id
      }
      if (contactId && payload.data.primary_place_id) {
        const { error } = await supabase.rpc('set_contact_place_relationship', {
          p_contact_id: contactId,
          p_place_id: payload.data.primary_place_id,
          p_relationship: 'provider_location',
          p_is_default: true,
          p_source: 'manual',
          p_confirmed: true,
          p_confidence: 1,
          p_evidence_count: 0,
          p_evidence_notes: 'Selected as the primary place in Household Directory.',
        })
        if (error) throw error
      } else if (contactId) {
        const { error } = await supabase.rpc('clear_default_contact_place', {
          p_contact_id: contactId,
        })
        if (error) throw error
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved_contacts'] }); setContactMode({ type: 'list' }) },
  })

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_contacts').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_contacts'] }),
  })

  const confirmContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('saved_contacts').update({ confirmed: true }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved_contacts'] }),
  })

  const { data: connections = [], isLoading: connectionsLoading } = useQuery<ContactPlaceRelationship[]>({
    queryKey: ['contact_place_relationships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contact_place_relationships')
        .select('*, contact:saved_contacts(id, name, phone, relationship), place:saved_places(id, name, address, city, state, zip, category)')
        .eq('confirmed', true)
        .order('is_default', { ascending: false })
        .order('created_at')
      if (error) throw error
      return data as ContactPlaceRelationship[]
    },
  })

  const saveConnectionMutation = useMutation({
    mutationFn: async () => {
      if (!connectionContactId || !connectionPlaceId || !connectionLabel.trim()) {
        throw new Error('Choose a person, place, and connection type.')
      }
      const { error } = await supabase.rpc('set_contact_place_relationship', {
        p_contact_id: connectionContactId,
        p_place_id: connectionPlaceId,
        p_relationship: connectionLabel.trim(),
        p_is_default: connectionDefault,
        p_source: 'manual',
        p_confirmed: true,
        p_confidence: 1,
        p_evidence_count: 0,
        p_evidence_notes: 'Created in Household Directory.',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact_place_relationships'] })
      qc.invalidateQueries({ queryKey: ['saved_contacts'] })
      setConnectionMode('list')
      setConnectionContactId('')
      setConnectionPlaceId('')
      setConnectionLabel('provider_location')
      setConnectionDefault(true)
    },
  })

  const deleteConnectionMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_contact_place_relationship', { p_relationship_id: id })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contact_place_relationships'] })
      qc.invalidateQueries({ queryKey: ['saved_contacts'] })
    },
  })

  // ── Family links queries ─────────────────────────────────────────────────────
  const { data: familyMembers = [] } = useFamilyMembers()

  const { data: familyLinks = [], isLoading: familyLinksLoading } = useQuery<FamilyContactRelationship[]>({
    queryKey: ['family_contact_relationships'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_contact_relationships')
        .select('*, family_member:family_members(id, name), contact:saved_contacts(id, name, phone, relationship)')
        .eq('confirmed', true)
        .order('created_at')
      if (error) throw error
      return data as FamilyContactRelationship[]
    },
  })

  const { data: suggestedFamilyLinksRaw = [] } = useQuery<FamilyContactRelationship[]>({
    queryKey: ['family_contact_relationships', 'suggested'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('family_contact_relationships')
        .select('*, family_member:family_members(id, name), contact:saved_contacts(id, name, phone, relationship)')
        .eq('confirmed', false)
        .order('evidence_count', { ascending: false })
      if (error) throw error
      return data as FamilyContactRelationship[]
    },
  })

  const saveFamilyLinkMutation = useMutation({
    mutationFn: async () => {
      if (!familyLinkMemberId || !familyLinkContactId || !familyLinkLabel.trim()) {
        throw new Error('Choose a family member, a person, and a relationship.')
      }
      if (familyLinkReviewId) {
        // Confirming a suggestion: update the existing derived row in place
        // instead of inserting a new one, so it moves out of "suggested".
        const { error } = await supabase
          .from('family_contact_relationships')
          .update({
            family_member_id: familyLinkMemberId,
            contact_id: familyLinkContactId,
            relationship: familyLinkLabel.trim(),
            source: 'manual',
            confirmed: true,
          })
          .eq('id', familyLinkReviewId)
        if (error) throw error
        return
      }
      const { error } = await supabase.rpc('set_family_contact_relationship', {
        p_family_member_id: familyLinkMemberId,
        p_contact_id: familyLinkContactId,
        p_relationship: familyLinkLabel.trim(),
        p_source: 'manual',
        p_confirmed: true,
        p_confidence: 1,
        p_evidence_count: 0,
        p_evidence_notes: 'Created in Household Directory.',
      })
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['family_contact_relationships'] })
      setFamilyLinkMode('list')
      setFamilyLinkMemberId('')
      setFamilyLinkContactId('')
      setFamilyLinkLabel('')
      setFamilyLinkReviewId(null)
    },
  })

  const deleteFamilyLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('delete_family_contact_relationship', { p_relationship_id: id })
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family_contact_relationships'] }),
  })

  const confirmFamilyLinkMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_contact_relationships').update({ confirmed: true, source: 'manual' }).eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family_contact_relationships'] }),
  })

  // ── Filtered lists ───────────────────────────────────────────────────────────
  const filteredPlaces = places.filter(p => {
    if (!p.confirmed) return false
    const matchesCat = filterCat === 'all' || p.category === filterCat
    const needle = search.toLowerCase()
    const matchesSearch = !needle || [p.name, ...p.aliases, p.address ?? '', p.city ?? '', p.notes ?? ''].some(s => s.toLowerCase().includes(needle))
    return matchesCat && matchesSearch
  })
  const suggestedPlaces = places.filter(p => !p.confirmed).sort((a, b) => b.occurrence_count - a.occurrence_count)

  const filteredContacts = contacts.filter(c => {
    if (!c.confirmed) return false
    const needle = search.toLowerCase()
    return !needle || [c.name, ...c.aliases, c.relationship ?? '', c.address ?? '', c.notes ?? ''].some(s => s.toLowerCase().includes(needle))
  })
  const suggestedContacts = contacts.filter(c => !c.confirmed).sort((a, b) => b.occurrence_count - a.occurrence_count)

  const filteredConnections = connections.filter(connection => {
    const needle = search.toLowerCase()
    return !needle || [
      connection.contact?.name ?? '',
      connection.place?.name ?? '',
      connection.relationship,
      connection.place ? savedPlaceAddress(connection.place) : '',
    ].some(value => value.toLowerCase().includes(needle))
  })

  const suggestedFamilyLinks = suggestedFamilyLinksRaw.slice().sort((a, b) => b.evidence_count - a.evidence_count)

  const filteredFamilyLinks = familyLinks.filter(link => {
    const needle = search.toLowerCase()
    return !needle || [
      link.family_member?.name ?? '',
      link.contact?.name ?? '',
      link.relationship,
    ].some(value => value.toLowerCase().includes(needle))
  })

  const isAdding = tab === 'places'
    ? placeMode.type !== 'list'
    : tab === 'people'
      ? contactMode.type !== 'list'
      : tab === 'connections'
        ? connectionMode !== 'list'
        : familyLinkMode !== 'list'

  return (
    <>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <SettingsPageHeader title="Household Directory" description="Places are destinations. People are contacts or providers who can be connected to a place." />
          {!isAdding && (
            <Button
              onClick={() => {
                if (tab === 'places') setPlaceMode({ type: 'add' })
                else if (tab === 'people') setContactMode({ type: 'add' })
                else if (tab === 'connections') setConnectionMode('add')
                else setFamilyLinkMode('add')
              }}
              leadingIcon={<Plus size={16} />}
            >
              {tab === 'places' ? 'Add Place' : tab === 'people' ? 'Add Person' : tab === 'connections' ? 'Add Connection' : 'Add Family Link'}
            </Button>
          )}
        </div>

        {/* Tabs */}
        <SegmentedControl
          value={tab}
          onChange={value => { setTab(value); setSearch('') }}
          aria-label="Household Directory view"
          fullWidth
          className="mb-6"
          options={[
            { value: 'places', label: `Places (${places.filter(p => p.confirmed).length})`, icon: <BookmarkCheck size={15} /> },
            { value: 'people', label: `People (${contacts.filter(c => c.confirmed).length})`, icon: <Users size={15} /> },
            { value: 'connections', label: `Connections (${connections.length})`, icon: <Link2 size={15} /> },
            { value: 'family', label: `Family Links (${familyLinks.length})`, icon: <UserCheck size={15} /> },
          ]}
        />

        {/* ── PLACES TAB ── */}
        {tab === 'places' && (
          <>
            {(placeMode.type === 'add' || placeMode.type === 'edit') && (
              <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-heading text-casa-navy">
                    {placeMode.type === 'add' ? 'Add New Place' : `Edit — ${(placeMode as { type: 'edit'; place: SavedPlace }).place.name}`}
                  </h2>
                  <IconButton onClick={() => setPlaceMode({ type: 'list' })} variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close place editor" />
                </div>
                <PlaceForm
                  initial={placeMode.type === 'edit' ? placeMode.place : null}
                  saving={savePlaceMutation.isPending}
                  onCancel={() => setPlaceMode({ type: 'list' })}
                  onSave={data => savePlaceMutation.mutate({ id: placeMode.type === 'edit' ? placeMode.place.id : undefined, data })}
                />
              </div>
            )}

            {placeMode.type === 'list' && (
              <>
                {suggestedPlaces.length > 0 && (
                  <div className="mb-6">
                    <p className="text-caption font-semibold text-casa-muted mb-2">
                      Suggested from event history — review details before making a place part of your directory
                    </p>
                    <div className="space-y-2">
                      {suggestedPlaces.map(place => (
                        <SuggestedRow key={place.id}
                          label={place.name}
                          sublabel={savedPlaceAddress(place)}
                          occurrenceCount={place.occurrence_count}
                          confirming={confirmPlaceMutation.isPending}
                          onReview={() => setPlaceMode({ type: 'edit', place })}
                          onConfirm={() => confirmPlaceMutation.mutate(place.id)}
                          onDismiss={() => deletePlaceMutation.mutate(place.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, alias, address…"
                      className="w-full border border-casa-border rounded-lg pl-8 pr-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <Button onClick={() => setFilterCat('all')}
                    className={cn('px-3 py-1 rounded-full text-caption font-semibold border transition-colors',
                      filterCat === 'all' ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                    All ({places.filter(p => p.confirmed).length})
                  </Button>
                  {CATEGORIES.map(cat => {
                    const count = places.filter(p => p.confirmed && p.category === cat.value).length
                    if (count === 0) return null
                    const Icon = cat.icon
                    return (
                      <Button key={cat.value} onClick={() => setFilterCat(cat.value)}
                        className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold border transition-colors',
                          filterCat === cat.value ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                        <Icon size={11} />{cat.label} ({count})
                      </Button>
                    )
                  })}
                </div>
                {placesLoading && <p className="text-body text-casa-muted text-center py-12">Loading…</p>}
                {!placesLoading && filteredPlaces.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-16 text-casa-muted">
                    <BookmarkCheck size={36} className="opacity-30" />
                    <p className="text-body font-semibold">{search || filterCat !== 'all' ? 'No matching places' : 'No saved places yet'}</p>
                    <p className="text-caption text-center max-w-xs">Add your family's favorite spots and the AI will look them up automatically.</p>
                    {!search && filterCat === 'all' && (
                      <Button onClick={() => setPlaceMode({ type: 'add' })}
                        className="flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors">
                        <Plus size={14} />Add your first place
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {filteredPlaces.map(place => (
                    <PlaceRow key={place.id} place={place}
                      onEdit={() => setPlaceMode({ type: 'edit', place })}
                      onDelete={() => { if (confirm(`Delete "${place.name}"?`)) deletePlaceMutation.mutate(place.id) }} />
                  ))}
                </div>
              </>
            )}
          </>
        )}

        {/* ── PEOPLE TAB ── */}
        {tab === 'people' && (
          <>
            {(contactMode.type === 'add' || contactMode.type === 'edit') && (
              <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-heading text-casa-navy">
                    {contactMode.type === 'add' ? 'Add New Person' : `Edit — ${(contactMode as { type: 'edit'; contact: SavedContact }).contact.name}`}
                  </h2>
                  <IconButton onClick={() => setContactMode({ type: 'list' })} variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close contact editor" />
                </div>
                <ContactForm
                  initial={contactMode.type === 'edit' ? contactMode.contact : null}
                  places={places}
                  saving={saveContactMutation.isPending}
                  onCancel={() => setContactMode({ type: 'list' })}
                  onSave={data => saveContactMutation.mutate({ id: contactMode.type === 'edit' ? contactMode.contact.id : undefined, data })}
                />
              </div>
            )}
          </>
        )}

        {tab === 'connections' && (
              <>
                {connectionMode === 'add' && (
                  <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-display text-heading text-casa-navy">Connect a person to a place</h2>
                        <p className="text-caption text-casa-muted mt-1">The place owns the address. Alexa follows this connection instead of copying an address onto the person.</p>
                      </div>
                      <IconButton onClick={() => setConnectionMode('list')} variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close connection editor" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Combobox
                        label="Person or provider"
                        value={connectionContactId}
                        onChange={setConnectionContactId}
                        options={contacts.filter(contact => contact.confirmed).map(contact => ({ value: contact.id, label: contact.name }))}
                        placeholder="Choose a person"
                      />
                      <Combobox
                        label="Place"
                        value={connectionPlaceId}
                        onChange={setConnectionPlaceId}
                        options={places.filter(place => place.confirmed).map(place => ({ value: place.id, label: [place.name, savedPlaceAddress(place)].filter(Boolean).join(' — ') }))}
                        placeholder="Choose a place"
                      />
                      <div>
                        <label className="block text-caption font-semibold text-casa-muted mb-1">Connection type</label>
                        <input
                          value={connectionLabel}
                          onChange={event => setConnectionLabel(event.target.value)}
                          placeholder="provider_location, works_at, lives_at…"
                          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold"
                        />
                      </div>
                      <Checkbox
                        label="Use as the default place"
                        description="Alexa uses this location when no office or venue is specified."
                        checked={connectionDefault}
                        onChange={event => setConnectionDefault(event.target.checked)}
                      />
                    </div>
                    {saveConnectionMutation.error && (
                      <p role="alert" className="text-caption text-casa-error mt-3">{saveConnectionMutation.error.message}</p>
                    )}
                    <div className="flex justify-end gap-2 mt-5">
                      <Button variant="secondary" onClick={() => setConnectionMode('list')}>Cancel</Button>
                      <Button
                        onClick={() => saveConnectionMutation.mutate()}
                        loading={saveConnectionMutation.isPending}
                        disabled={!connectionContactId || !connectionPlaceId || !connectionLabel.trim()}
                        leadingIcon={<Save size={15} />}
                      >
                        Save Connection
                      </Button>
                    </div>
                  </div>
                )}

                {connectionMode === 'list' && (
                  <>
                    <div className="relative mb-5">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
                      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search people, places, or connection type…"
                        className="w-full border border-casa-border rounded-lg pl-8 pr-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
                    </div>
                    {connectionsLoading && <p className="text-body text-casa-muted text-center py-12">Loading…</p>}
                    {!connectionsLoading && filteredConnections.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-16 text-casa-muted">
                        <Link2 size={36} className="opacity-30" />
                        <p className="text-body font-semibold">{search ? 'No matching connections' : 'No saved connections yet'}</p>
                        <p className="text-caption text-center max-w-sm">Connect people and providers to canonical places so addresses stay consistent everywhere.</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {filteredConnections.map(connection => (
                        <div key={connection.id} className="flex items-center gap-3 bg-casa-surface border border-casa-border rounded-card p-4 shadow-card">
                          <div className="w-9 h-9 rounded-full bg-casa-gold/10 flex items-center justify-center text-casa-gold shrink-0">
                            <Link2 size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-heading text-casa-navy">
                              {connection.contact?.name} <span className="text-casa-muted">→</span> {connection.place?.name}
                            </p>
                            <p className="text-caption text-casa-muted">
                              {connection.relationship.replaceAll('_', ' ')}
                              {connection.is_default ? ' · Default' : ''}
                              {connection.place ? ` · ${savedPlaceAddress(connection.place)}` : ''}
                            </p>
                          </div>
                          <IconButton
                            onClick={() => { if (confirm('Delete this connection?')) deleteConnectionMutation.mutate(connection.id) }}
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={16} />}
                            aria-label="Delete connection"
                            title="Delete connection"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

        {/* ── FAMILY LINKS TAB ── */}
        {tab === 'family' && (
              <>
                {familyLinkMode === 'add' && (
                  <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card mb-6">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="font-display text-heading text-casa-navy">Link a family member to a person</h2>
                        <p className="text-caption text-casa-muted mt-1">Tells Alexa exactly who a provider belongs to — e.g. "Dr George" is Liv's dermatologist, not Emme's.</p>
                      </div>
                      <IconButton onClick={() => { setFamilyLinkMode('list'); setFamilyLinkReviewId(null) }} variant="ghost" size="sm" icon={<X size={16} />} aria-label="Close family link editor" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Combobox
                        label="Family member"
                        value={familyLinkMemberId}
                        onChange={setFamilyLinkMemberId}
                        options={familyMembers.map(member => ({ value: member.id, label: member.name }))}
                        placeholder="Choose a family member"
                      />
                      <Combobox
                        label="Person or provider"
                        value={familyLinkContactId}
                        onChange={setFamilyLinkContactId}
                        options={[
                          ...contacts.filter(contact => contact.confirmed),
                          ...contacts.filter(contact => !contact.confirmed && contact.id === familyLinkContactId),
                        ].map(contact => ({ value: contact.id, label: contact.name }))}
                        placeholder="Choose a person"
                      />
                      <div className="sm:col-span-2">
                        <label className="block text-caption font-semibold text-casa-muted mb-1">Relationship</label>
                        <input
                          value={familyLinkLabel}
                          onChange={event => setFamilyLinkLabel(event.target.value)}
                          placeholder="dermatologist, coach, orthodontist…"
                          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold"
                        />
                      </div>
                    </div>
                    {saveFamilyLinkMutation.error && (
                      <p role="alert" className="text-caption text-casa-error mt-3">{saveFamilyLinkMutation.error.message}</p>
                    )}
                    <div className="flex justify-end gap-2 mt-5">
                      <Button variant="secondary" onClick={() => { setFamilyLinkMode('list'); setFamilyLinkReviewId(null) }}>Cancel</Button>
                      <Button
                        onClick={() => saveFamilyLinkMutation.mutate()}
                        loading={saveFamilyLinkMutation.isPending}
                        disabled={!familyLinkMemberId || !familyLinkContactId || !familyLinkLabel.trim()}
                        leadingIcon={<Save size={15} />}
                      >
                        {familyLinkReviewId ? 'Confirm Family Link' : 'Save Family Link'}
                      </Button>
                    </div>
                  </div>
                )}

                {familyLinkMode === 'list' && (
                  <>
                    {suggestedFamilyLinks.length > 0 && (
                      <div className="mb-6">
                        <p className="text-caption font-semibold text-casa-muted mb-2">
                          Suggested from event history — review who they belong to before confirming
                        </p>
                        <div className="space-y-2">
                          {suggestedFamilyLinks.map(link => (
                            <SuggestedRow key={link.id}
                              label={`${link.family_member?.name ?? 'Someone'} → ${link.contact?.name ?? 'Unknown'}`}
                              sublabel={link.relationship.replaceAll('_', ' ')}
                              occurrenceCount={link.evidence_count}
                              confirming={confirmFamilyLinkMutation.isPending}
                              onReview={() => {
                                setFamilyLinkReviewId(link.id)
                                setFamilyLinkMemberId(link.family_member_id)
                                setFamilyLinkContactId(link.contact_id)
                                setFamilyLinkLabel(link.relationship)
                                setFamilyLinkMode('add')
                              }}
                              onConfirm={() => confirmFamilyLinkMutation.mutate(link.id)}
                              onDismiss={() => deleteFamilyLinkMutation.mutate(link.id)}
                            />
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="relative mb-5">
                      <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
                      <input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search family members, people, or relationship…"
                        className="w-full border border-casa-border rounded-lg pl-8 pr-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
                    </div>
                    {familyLinksLoading && <p className="text-body text-casa-muted text-center py-12">Loading…</p>}
                    {!familyLinksLoading && filteredFamilyLinks.length === 0 && (
                      <div className="flex flex-col items-center gap-3 py-16 text-casa-muted">
                        <UserCheck size={36} className="opacity-30" />
                        <p className="text-body font-semibold">{search ? 'No matching family links' : 'No family links yet'}</p>
                        <p className="text-caption text-center max-w-sm">Link a family member to a person or provider so Alexa knows whose doctor, coach, or therapist they are.</p>
                      </div>
                    )}
                    <div className="space-y-3">
                      {filteredFamilyLinks.map(link => (
                        <div key={link.id} className="flex items-center gap-3 bg-casa-surface border border-casa-border rounded-card p-4 shadow-card">
                          <div className="w-9 h-9 rounded-full bg-casa-gold/10 flex items-center justify-center text-casa-gold shrink-0">
                            <UserCheck size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-display text-heading text-casa-navy">
                              {link.family_member?.name} <span className="text-casa-muted">→</span> {link.contact?.name}
                            </p>
                            <p className="text-caption text-casa-muted">
                              {link.relationship.replaceAll('_', ' ')}
                            </p>
                          </div>
                          <IconButton
                            onClick={() => { if (confirm('Delete this family link?')) deleteFamilyLinkMutation.mutate(link.id) }}
                            variant="danger"
                            size="sm"
                            icon={<Trash2 size={16} />}
                            aria-label="Delete family link"
                            title="Delete family link"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

        {tab === 'people' && (
          <>
            {contactMode.type === 'list' && (
              <>
                {suggestedContacts.length > 0 && (
                  <div className="mb-6">
                    <p className="text-caption font-semibold text-casa-muted mb-2">
                      Suggested from event history — link a person to where they are usually reached, then confirm
                    </p>
                    <div className="space-y-2">
                      {suggestedContacts.map(contact => (
                        <SuggestedRow key={contact.id}
                          label={contact.name}
                          sublabel={[
                            contact.relationship,
                            contact.primary_place ? `Usually at ${contact.primary_place.name}` : null,
                            contact.phone,
                          ].filter(Boolean).join(' · ')}
                          occurrenceCount={contact.occurrence_count}
                          confirming={confirmContactMutation.isPending}
                          onReview={() => setContactMode({ type: 'edit', contact })}
                          onConfirm={() => confirmContactMutation.mutate(contact.id)}
                          onDismiss={() => deleteContactMutation.mutate(contact.id)}
                        />
                      ))}
                    </div>
                  </div>
                )}
                <div className="relative mb-5">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, alias, relationship…"
                    className="w-full border border-casa-border rounded-lg pl-8 pr-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
                </div>
                {contactsLoading && <p className="text-body text-casa-muted text-center py-12">Loading…</p>}
                {!contactsLoading && filteredContacts.length === 0 && (
                  <div className="flex flex-col items-center gap-3 py-16 text-casa-muted">
                    <Users size={36} className="opacity-30" />
                    <p className="text-body font-semibold">{search ? 'No matching people' : 'No saved contacts yet'}</p>
                    <p className="text-caption text-center max-w-xs">Add friends, family, doctors, coaches — the AI will recognize them by name or nickname.</p>
                    {!search && (
                      <Button onClick={() => setContactMode({ type: 'add' })}
                        className="flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors">
                        <Plus size={14} />Add your first person
                      </Button>
                    )}
                  </div>
                )}
                <div className="space-y-3">
                  {filteredContacts.map(contact => (
                    <ContactRow key={contact.id} contact={contact}
                      onEdit={() => setContactMode({ type: 'edit', contact })}
                      onDelete={() => { if (confirm(`Delete "${contact.name}"?`)) deleteContactMutation.mutate(contact.id) }} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
    </>
  )
}
