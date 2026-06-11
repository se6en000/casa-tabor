import { useState, useCallback } from 'react'
import {
  Plus, Trash2, Save, X, MapPin, Phone, Mail,
  Search, BookmarkCheck, Home, Utensils, School, Dumbbell,
  Briefcase, HeartPulse, Star, Edit2, Users, User, Copy, Check,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { SavedPlace, SavedPlaceCategory } from '../types'

// ── Types ─────────────────────────────────────────────────────────────────────

interface SavedContact {
  id: string
  name: string
  aliases: string[]
  relationship: string | null
  phone: string | null
  email: string | null
  address: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

// ── Category metadata ─────────────────────────────────────────────────────────

const CATEGORIES: { value: SavedPlaceCategory; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { value: 'friends_house', label: "Friend's House",  icon: Home },
  { value: 'restaurant',    label: 'Restaurant',      icon: Utensils },
  { value: 'school',        label: 'School',          icon: School },
  { value: 'sports',        label: 'Sports / Venue',  icon: Dumbbell },
  { value: 'work',          label: 'Work',            icon: Briefcase },
  { value: 'medical',       label: 'Medical',         icon: HeartPulse },
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
  onSave: (place: Omit<SavedPlace, 'id' | 'lat' | 'lng' | 'google_place_id' | 'created_at' | 'updated_at'>) => void
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
    onSave({ name: form.name ?? '', aliases, address: form.address || null, city: form.city || null, state: form.state || null, zip: form.zip || null, phone: form.phone || null, notes: form.notes || null, category: form.category ?? 'other' })
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
              <button key={cat.value} type="button" onClick={() => set('category', cat.value)}
                className={cn('flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold border transition-colors',
                  selected ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                <Icon size={12} />{cat.label}
              </button>
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
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-casa-border text-body text-casa-muted hover:bg-casa-divider transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors disabled:opacity-50">
          <Save size={14} />{saving ? 'Saving…' : 'Save Place'}
        </button>
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
          <button onClick={handleCopyAddress} className="flex items-center gap-1 text-caption text-casa-muted mt-1 hover:text-casa-navy transition-colors group text-left" title="Tap to copy address">
            <MapPin size={11} className="shrink-0" />
            <span className="group-hover:underline">{fullAddress}</span>
            {copied ? <Check size={11} className="text-emerald-500 shrink-0" /> : <Copy size={11} className="opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />}
          </button>
        )}
        {place.phone && <p className="flex items-center gap-1 text-caption text-casa-muted mt-0.5"><Phone size={11} />{place.phone}</p>}
        {place.notes && <p className="text-caption text-casa-muted mt-1 italic line-clamp-2">{place.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-3 rounded hover:bg-casa-divider transition-colors text-casa-muted hover:text-casa-navy" title="Edit"><Edit2 size={16} /></button>
        <button onClick={onDelete} className="p-3 rounded hover:bg-red-50 transition-colors text-casa-muted hover:text-red-600" title="Delete"><Trash2 size={16} /></button>
      </div>
    </div>
  )
}

// ── Contact blank form ────────────────────────────────────────────────────────

function blankContact(): Partial<SavedContact> & { _aliasText: string } {
  return { name: '', aliases: [], _aliasText: '', relationship: '', phone: '', email: '', address: '', notes: '' }
}

// ── Contact form ──────────────────────────────────────────────────────────────

interface ContactFormProps {
  initial?: (Partial<SavedContact> & { _aliasText?: string }) | null
  onSave: (c: Omit<SavedContact, 'id' | 'created_at' | 'updated_at'>) => void
  onCancel: () => void
  saving?: boolean
}

function ContactForm({ initial, onSave, onCancel, saving }: ContactFormProps) {
  const [form, setForm] = useState<Partial<SavedContact> & { _aliasText: string }>({
    ...blankContact(), ...initial, _aliasText: initial?.aliases?.join(', ') ?? '',
  })
  function set(key: string, value: unknown) { setForm(f => ({ ...f, [key]: value })) }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const aliases = form._aliasText.split(',').map(s => s.trim()).filter(Boolean)
    onSave({ name: form.name ?? '', aliases, relationship: form.relationship || null, phone: form.phone || null, email: form.email || null, address: form.address || null, notes: form.notes || null })
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
        <label className="block text-caption font-semibold text-casa-muted mb-1">Address</label>
        <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} placeholder="123 Oak St, Jupiter FL 33477"
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
      </div>
      <div>
        <label className="block text-caption font-semibold text-casa-muted mb-1">Notes <span className="font-normal ml-1">(context the AI can use)</span></label>
        <textarea rows={2} value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} placeholder='"Kids are Ayla (8) and Ben (5). Birthday in March."'
          className="w-full border border-casa-border rounded-lg px-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold resize-none" />
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg border border-casa-border text-body text-casa-muted hover:bg-casa-divider transition-colors">Cancel</button>
        <button type="submit" disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors disabled:opacity-50">
          <Save size={14} />{saving ? 'Saving…' : 'Save Contact'}
        </button>
      </div>
    </form>
  )
}

// ── Contact row ───────────────────────────────────────────────────────────────

function ContactRow({ contact, onEdit, onDelete }: { contact: SavedContact; onEdit: () => void; onDelete: () => void }) {
  const [copied, setCopied] = useState(false)
  const handleCopyAddress = useCallback(async () => {
    if (!contact.address) return
    try { await navigator.clipboard.writeText(contact.address); setCopied(true); setTimeout(() => setCopied(false), 2000) } catch { /* ignore */ }
  }, [contact.address])
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
        {contact.address && (
          <button onClick={handleCopyAddress} className="flex items-center gap-1 text-caption text-casa-muted mt-0.5 hover:text-casa-navy transition-colors group text-left" title="Tap to copy address">
            <MapPin size={11} className="shrink-0" />
            <span className="group-hover:underline">{contact.address}</span>
            {copied ? <Check size={11} className="text-emerald-500 shrink-0" /> : <Copy size={11} className="opacity-0 group-hover:opacity-50 shrink-0 transition-opacity" />}
          </button>
        )}
        {contact.notes && <p className="text-caption text-casa-muted mt-1 italic line-clamp-2">{contact.notes}</p>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button onClick={onEdit} className="p-3 rounded hover:bg-casa-divider transition-colors text-casa-muted hover:text-casa-navy" title="Edit"><Edit2 size={16} /></button>
        <button onClick={onDelete} className="p-3 rounded hover:bg-red-50 transition-colors text-casa-muted hover:text-red-600" title="Delete"><Trash2 size={16} /></button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = 'places' | 'people'
type PlaceMode = { type: 'list' } | { type: 'add' } | { type: 'edit'; place: SavedPlace }
type ContactMode = { type: 'list' } | { type: 'add' } | { type: 'edit'; contact: SavedContact }

export default function SavedPlacesSettingsPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('places')
  const [placeMode, setPlaceMode] = useState<PlaceMode>({ type: 'list' })
  const [contactMode, setContactMode] = useState<ContactMode>({ type: 'list' })
  const [search, setSearch] = useState('')
  const [filterCat, setFilterCat] = useState<SavedPlaceCategory | 'all'>('all')

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
    mutationFn: async (payload: { id?: string; data: Omit<SavedPlace, 'id' | 'lat' | 'lng' | 'google_place_id' | 'created_at' | 'updated_at'> }) => {
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

  // ── Contacts queries ─────────────────────────────────────────────────────────
  const { data: contacts = [], isLoading: contactsLoading } = useQuery<SavedContact[]>({
    queryKey: ['saved_contacts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('saved_contacts').select('*').order('name')
      if (error) throw error
      return data as SavedContact[]
    },
  })

  const saveContactMutation = useMutation({
    mutationFn: async (payload: { id?: string; data: Omit<SavedContact, 'id' | 'created_at' | 'updated_at'> }) => {
      if (payload.id) {
        const { error } = await supabase.from('saved_contacts').update({ ...payload.data, updated_at: new Date().toISOString() }).eq('id', payload.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('saved_contacts').insert({ ...payload.data, aliases: payload.data.aliases ?? [] })
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

  // ── Filtered lists ───────────────────────────────────────────────────────────
  const filteredPlaces = places.filter(p => {
    const matchesCat = filterCat === 'all' || p.category === filterCat
    const needle = search.toLowerCase()
    const matchesSearch = !needle || [p.name, ...p.aliases, p.address ?? '', p.city ?? '', p.notes ?? ''].some(s => s.toLowerCase().includes(needle))
    return matchesCat && matchesSearch
  })

  const filteredContacts = contacts.filter(c => {
    const needle = search.toLowerCase()
    return !needle || [c.name, ...c.aliases, c.relationship ?? '', c.address ?? '', c.notes ?? ''].some(s => s.toLowerCase().includes(needle))
  })

  const isAdding = tab === 'places' ? placeMode.type !== 'list' : contactMode.type !== 'list'

  return (
    <>
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-display-md text-casa-navy">Saved Places & Contacts</h1>
            <p className="text-caption text-casa-muted mt-0.5">
              The AI uses this to resolve nicknames and look up addresses when you mention a place or person.
            </p>
          </div>
          {!isAdding && (
            <button
              onClick={() => tab === 'places' ? setPlaceMode({ type: 'add' }) : setContactMode({ type: 'add' })}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors shrink-0"
            >
              <Plus size={15} />
              {tab === 'places' ? 'Add Place' : 'Add Person'}
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-casa-divider p-1 rounded-xl mb-6">
          <button onClick={() => { setTab('places'); setSearch('') }}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-body font-semibold transition-colors',
              tab === 'places' ? 'bg-casa-surface text-casa-navy shadow-card' : 'text-casa-muted hover:text-casa-navy')}>
            <BookmarkCheck size={15} />Places ({places.length})
          </button>
          <button onClick={() => { setTab('people'); setSearch('') }}
            className={cn('flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-body font-semibold transition-colors',
              tab === 'people' ? 'bg-casa-surface text-casa-navy shadow-card' : 'text-casa-muted hover:text-casa-navy')}>
            <Users size={15} />People ({contacts.length})
          </button>
        </div>

        {/* ── PLACES TAB ── */}
        {tab === 'places' && (
          <>
            {(placeMode.type === 'add' || placeMode.type === 'edit') && (
              <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-display text-heading text-casa-navy">
                    {placeMode.type === 'add' ? 'Add New Place' : `Edit — ${(placeMode as { type: 'edit'; place: SavedPlace }).place.name}`}
                  </h2>
                  <button onClick={() => setPlaceMode({ type: 'list' })} className="p-1 rounded hover:bg-casa-divider text-casa-muted transition-colors"><X size={16} /></button>
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
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-casa-muted" />
                    <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name, alias, address…"
                      className="w-full border border-casa-border rounded-lg pl-8 pr-3 py-2 text-body text-casa-navy bg-casa-bg focus:outline-none focus:ring-2 focus:ring-casa-gold" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button onClick={() => setFilterCat('all')}
                    className={cn('px-3 py-1 rounded-full text-caption font-semibold border transition-colors',
                      filterCat === 'all' ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                    All ({places.length})
                  </button>
                  {CATEGORIES.map(cat => {
                    const count = places.filter(p => p.category === cat.value).length
                    if (count === 0) return null
                    const Icon = cat.icon
                    return (
                      <button key={cat.value} onClick={() => setFilterCat(cat.value)}
                        className={cn('flex items-center gap-1.5 px-3 py-1 rounded-full text-caption font-semibold border transition-colors',
                          filterCat === cat.value ? 'bg-casa-gold text-white border-casa-gold' : 'bg-casa-bg text-casa-muted border-casa-border hover:border-casa-gold')}>
                        <Icon size={11} />{cat.label} ({count})
                      </button>
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
                      <button onClick={() => setPlaceMode({ type: 'add' })}
                        className="flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors">
                        <Plus size={14} />Add your first place
                      </button>
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
                  <button onClick={() => setContactMode({ type: 'list' })} className="p-1 rounded hover:bg-casa-divider text-casa-muted transition-colors"><X size={16} /></button>
                </div>
                <ContactForm
                  initial={contactMode.type === 'edit' ? contactMode.contact : null}
                  saving={saveContactMutation.isPending}
                  onCancel={() => setContactMode({ type: 'list' })}
                  onSave={data => saveContactMutation.mutate({ id: contactMode.type === 'edit' ? contactMode.contact.id : undefined, data })}
                />
              </div>
            )}

            {contactMode.type === 'list' && (
              <>
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
                      <button onClick={() => setContactMode({ type: 'add' })}
                        className="flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-casa-gold text-white text-body font-semibold hover:bg-casa-gold/90 transition-colors">
                        <Plus size={14} />Add your first person
                      </button>
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
