import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Save, Sparkles, Trash2, AlertTriangle,
  CheckCircle, MapPin, ChevronDown, Users, Lock, Clock, Pencil, Check,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import type { EventWithDetails } from '../../hooks/useCalendarEvents'
import {
  getFieldsForCategory, FIELD_CONFIG, CATEGORY_LABEL,
  type EnrichmentFieldKey,
} from './categoryFields'
import { useSaveEnrichmentBatch, useEnrichEvent } from '../../hooks/useEnrichEvent'
import { supabase } from '../../lib/supabase'
import { useQueryClient } from '@tanstack/react-query'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'

const ALL_CATEGORIES = Object.keys(CATEGORY_LABEL) as string[]

type EnrichStatus = 'idle' | 'loading' | 'success' | 'error'

interface Props {
  event: EventWithDetails
  open: boolean
  onClose: () => void
}

export default function EventEditSheet({ event, open, onClose }: Props) {
  const enr = event.enrichment
  const save = useSaveEnrichmentBatch()
  const enrich = useEnrichEvent()
  const qc = useQueryClient()
  const { data: allMembers = [] } = useFamilyMembers()

  // Local state — category can differ from AI-detected one
  const [category, setCategory] = useState(enr?.category ?? 'other')
  const [categoryLocked, setCategoryLocked] = useState(false) // true when user manually picks
  const [form, setForm] = useState<Record<string, string>>({})
  const [location, setLocation] = useState('')
  const [address, setAddress] = useState('')
  const [displayTitle, setDisplayTitle] = useState(event.title)
  const [editingTitle, setEditingTitle] = useState(false)
  const [extraContext, setExtraContext] = useState('')
  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus>('idle')
  const [enrichMessage, setEnrichMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  // memberRoles: id → 'primary' | 'attendee' | undefined (undefined = not tagged)
  const [memberRoles, setMemberRoles] = useState<Record<string, 'primary' | 'attendee'>>({})

  // Date/time state — stored as local datetime strings for input[type=datetime-local]
  const toLocalDT = (iso: string) => {
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [startDT, setStartDT] = useState(toLocalDT(event.start_time))
  const [endDT, setEndDT] = useState(toLocalDT(event.end_time))
  const fields = getFieldsForCategory(category)

  function buildForm(enrichment: typeof enr, fieldList: EnrichmentFieldKey[]) {
    const out: Record<string, string> = {}
    for (const field of fieldList) {
      const raw = enrichment?.[field as keyof typeof enrichment]
      out[field] = field === 'what_to_bring' && Array.isArray(raw)
        ? (raw as string[]).join('\n')
        : (raw != null ? String(raw) : '')
    }
    return out
  }

  // Reset everything when sheet opens
  useEffect(() => {
    if (!open) return
    const cat = enr?.category ?? 'other'
    setCategory(cat)
    setCategoryLocked(false)
    setLocation(event.location_name ?? '')
    setAddress(event.address ?? '')
    setDisplayTitle(event.title)
    setExtraContext('')
    setEnrichStatus('idle')
    setShowDeleteConfirm(false)
    // Seed memberRoles from current event.members
    const roles: Record<string, 'primary' | 'attendee'> = {}
    for (const m of event.members ?? []) {
      roles[m.family_member.id] = m.role === 'primary' ? 'primary' : 'attendee'
    }
    setMemberRoles(roles)
    setStartDT(toLocalDT(event.start_time))
    setEndDT(toLocalDT(event.end_time))
  }, [open, event.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update form when category changes (keep existing values, populate missing)
  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setCategoryLocked(true) // user manually picked — lock it
    const newFields = getFieldsForCategory(cat)
    setForm(prev => buildForm({ ...enr, ...objectFromForm(prev, fields), category: cat } as typeof enr, newFields))
  }

  function objectFromForm(f: Record<string, string>, flds: EnrichmentFieldKey[]) {
    const out: Record<string, unknown> = {}
    for (const field of flds) {
      out[field] = field === 'what_to_bring'
        ? (f[field] ?? '').split('\n').map(s => s.trim()).filter(Boolean)
        : (f[field]?.trim() || null)
    }
    return out
  }

  const set = (field: string, value: string) => setForm(f => ({ ...f, [field]: value }))

  const handleReenrich = async () => {
    setEnrichStatus('loading')
    setEnrichMessage('')
    try {
      const result = await enrich.mutateAsync({
        eventId: event.id,
        extraContext: extraContext.trim() || undefined,
        lockedCategory: categoryLocked ? category : undefined,
      })
      const newEnr = result?.enrichment
      if (newEnr) {
        // Only update category from AI if user hasn't manually locked it
        const newCat = categoryLocked ? category : (newEnr.category ?? category)
        setCategory(newCat)
        const newFields = getFieldsForCategory(newCat)
        setForm(buildForm(newEnr, newFields))

        // Auto-fill location fields if AI found them
        if (result.location_name) setLocation(result.location_name)
        if (result.address) setAddress(result.address)
        if (result.title) setDisplayTitle(result.title)

        // Apply AI-parsed time updates (when extra_context contained time info)
        if (result.start_time) setStartDT(toLocalDT(result.start_time as string))
        if (result.end_time)   setEndDT(toLocalDT(result.end_time as string))

        // Sync member roles if AI returned attendees
        if (result.attendees !== undefined || result.primary_attendee !== undefined) {
          const nameToId = Object.fromEntries(allMembers.map(m => [m.name.toLowerCase(), m.id]))
          const newRoles: Record<string, 'primary' | 'attendee'> = {}
          const primaryName = (result.primary_attendee as string | undefined)?.toLowerCase()
          const supportingNames = (result.attendees as string[] | undefined) ?? []
          if (primaryName) {
            const id = nameToId[primaryName]
            if (id) newRoles[id] = 'primary'
          }
          for (const name of supportingNames) {
            const id = nameToId[name.toLowerCase()]
            if (id && !newRoles[id]) newRoles[id] = 'attendee'
          }
          if (Object.keys(newRoles).length > 0) setMemberRoles(newRoles)
        }

        // Count filled fields (include location if newly filled)
        const filled = newFields.filter(f => {
          const v = newEnr[f as keyof typeof newEnr]
          return v != null && v !== '' && !(Array.isArray(v) && v.length === 0)
        }).length + (result.location_name ? 1 : 0) + (result.address ? 1 : 0)
          + (result.start_time ? 1 : 0) + (result.end_time ? 1 : 0)

        const attendeeNames = Array.isArray(result.attendees) ? (result.attendees as string[]).join(', ') : ''
        const attendeePart = attendeeNames ? ` · Attendees: ${attendeeNames}` : ''
        const timePart = result.start_time ? ' · Time updated' : ''
        setEnrichMessage(`AI filled in ${filled} field${filled !== 1 ? 's' : ''} · Category: ${CATEGORY_LABEL[newCat] ?? newCat}${attendeePart}${timePart}`)
        setEnrichStatus('success')
      } else {
        setEnrichMessage('AI ran but returned no data.')
        setEnrichStatus('error')
      }
    } catch (err) {
      setEnrichMessage((err as Error).message ?? 'Enrichment failed')
      setEnrichStatus('error')
    }
  }

  const handleSave = async () => {
    // 1. Save enrichment fields (category + all form fields)
    const patch = objectFromForm(form, fields) as Record<string, unknown>
    patch.category = category
    await save.mutateAsync({ eventId: event.id, fields: patch })

    // 2. Always save event-level fields (title, location, address, times) unconditionally
    await supabase.from('events').update({
      title: displayTitle,
      location_name: location.trim() || null,
      address: address.trim() || null,
      start_time: new Date(startDT).toISOString(),
      end_time: new Date(endDT).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', event.id)

    // 3. Always sync event_members — delete all, re-insert current roles
    await supabase.from('event_members').delete().eq('event_id', event.id)
    const inserts = Object.entries(memberRoles).map(([id, role]) => ({
      event_id: event.id, family_member_id: id, role, rsvp_status: 'accepted',
    }))
    if (inserts.length > 0) await supabase.from('event_members').insert(inserts)

    qc.invalidateQueries({ queryKey: ['events'] })

    // 4. Push enrichment back to Google Calendar (fire-and-forget — don't block save)
    supabase.functions.invoke('push-to-google', { body: { event_id: event.id } })
      .catch(() => { /* silent — Google push is best-effort */ })

    // 5. Re-analyze conflicts in case times/attendees changed
    supabase.functions.invoke('analyze-conflicts', {}).catch(() => {})
    // 6. Re-analyze prep items
    supabase.functions.invoke('analyze-prep', {}).catch(() => {})

    onClose()
  }

  const handleDelete = async () => {
    setDeleting(true)
    // Remove from Google Calendar first (before DB row is gone)
    if (event.google_event_id) {
      await supabase.functions.invoke('delete-google-event', { body: { event_id: event.id } })
        .catch(() => { /* best-effort */ })
    }
    await supabase.from('events').delete().eq('id', event.id)
    qc.invalidateQueries({ queryKey: ['events'] })
    onClose()
    setDeleting(false)
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="edit-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={onClose}
          />

          <motion.div
            key="edit-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-casa-surface rounded-t-2xl shadow-modal flex flex-col sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl sm:rounded-2xl sm:bottom-8"
            style={{ maxHeight: '90vh' }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-casa-border">
              <div>
                <h3 className="font-display text-display-sm text-casa-navy leading-tight">Edit Details</h3>
                {editingTitle ? (
                  <div className="flex items-center gap-1 mt-0.5">
                    <input
                      autoFocus
                      value={displayTitle}
                      onChange={e => setDisplayTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingTitle(false) }}
                      className="text-caption text-casa-navy bg-transparent border-b border-casa-navy/40 focus:outline-none focus:border-casa-navy w-[240px]"
                    />
                    <button onClick={() => setEditingTitle(false)} className="text-casa-navy/50 hover:text-casa-navy transition-colors">
                      <Check size={13} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 mt-0.5 group/title">
                    <p className="text-caption text-casa-muted truncate max-w-[260px]">{displayTitle}</p>
                    <button
                      onClick={() => setEditingTitle(true)}
                      className="opacity-0 group-hover/title:opacity-100 transition-opacity text-casa-muted hover:text-casa-navy"
                    >
                      <Pencil size={11} />
                    </button>
                  </div>
                )}
              </div>
              <button onClick={onClose} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-casa-bg text-casa-muted transition-colors shrink-0">
                <X size={18} />
              </button>
            </div>

            {/* Form */}
            <div className="flex-1 overflow-y-auto">

              {/* ── AI Re-enrich (always first) ── */}
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider bg-casa-bg/40">
                <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                  AI Re-enrich
                </label>
                <textarea
                  rows={2}
                  value={extraContext}
                  onChange={e => setExtraContext(e.target.value)}
                  placeholder='Optional context — e.g. "EDS is the AC company, appointment at 3209 Washington Rd WPB"'
                  className={cn(textareaCls, 'mb-3')}
                />
                <button
                  onClick={handleReenrich}
                  disabled={enrichStatus === 'loading'}
                  className={cn(
                    'w-full flex items-center justify-center gap-2 py-2.5 rounded-button border border-casa-gold text-casa-gold text-body-sm font-semibold hover:bg-casa-gold hover:text-white disabled:opacity-50 transition-all',
                    enrichStatus === 'loading' && 'ai-thinking',
                  )}
                >
                  {enrichStatus === 'loading'
                    ? <Sparkles size={14} className="animate-pulse" />
                    : <Sparkles size={14} />}
                  {enrichStatus === 'loading' ? 'AI is thinking…' : 'Re-enrich with AI'}
                </button>

                {/* Status banner */}
                <AnimatePresence>
                  {enrichStatus !== 'idle' && enrichStatus !== 'loading' && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        'mt-3 flex items-start gap-2 px-3 py-2.5 rounded-card border text-body-sm',
                        enrichStatus === 'success'
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-red-50 border-red-200 text-red-700',
                      )}
                    >
                      {enrichStatus === 'success'
                        ? <CheckCircle size={15} className="shrink-0 mt-0.5" />
                        : <AlertTriangle size={15} className="shrink-0 mt-0.5" />}
                      <span>{enrichMessage}</span>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* ── Family members ── */}
              {allMembers.length > 0 && (
                <div className="px-6 pt-5 pb-4 border-b border-casa-divider">
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">
                    <Users size={12} />
                    Who's Attending
                  </label>
                  <p className="text-caption text-casa-muted mb-3">
                    Tap once = Supporting · Tap again = Primary ★ · Tap again = Remove
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {allMembers.map(member => {
                      const role = memberRoles[member.id]
                      const isPrimary = role === 'primary'
                      const isSupporting = role === 'attendee'
                      const isTagged = isPrimary || isSupporting

                      return (
                        <button
                          key={member.id}
                          onClick={() => setMemberRoles(prev => {
                            const next = { ...prev }
                            if (!prev[member.id]) {
                              // Not tagged → supporting
                              next[member.id] = 'attendee'
                            } else if (prev[member.id] === 'attendee') {
                              // Supporting → primary (demote any existing primary first)
                              Object.keys(next).forEach(id => { if (next[id] === 'primary') next[id] = 'attendee' })
                              next[member.id] = 'primary'
                            } else {
                              // Primary → remove
                              delete next[member.id]
                            }
                            return next
                          })}
                          className={cn(
                            'flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-body-sm font-medium transition-all',
                            isPrimary && 'text-white border-transparent shadow-md ring-2 ring-offset-1',
                            isSupporting && 'text-white border-transparent shadow-sm opacity-75',
                            !isTagged && 'bg-casa-bg border-casa-border text-casa-muted hover:border-casa-navy hover:text-casa-navy',
                          )}
                          style={{
                            ...(isTagged ? { backgroundColor: member.color_hex, borderColor: member.color_hex } : {}),
                            ...(isPrimary ? { ringColor: member.color_hex } : {}),
                          }}
                        >
                          {isPrimary && <span className="text-[10px] leading-none">★</span>}
                          {isSupporting && <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />}
                          {!isTagged && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: member.color_hex }} />}
                          {member.name}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Date & Time ── */}
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider">
                <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-3">
                  <Clock size={12} />
                  Date & Time
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-caption text-casa-muted mb-1">Start</p>
                    <input
                      type="datetime-local"
                      value={startDT}
                      onChange={e => setStartDT(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <p className="text-caption text-casa-muted mb-1">End</p>
                    <input
                      type="datetime-local"
                      value={endDT}
                      onChange={e => setEndDT(e.target.value)}
                      className={inputCls}
                    />
                  </div>
                </div>
              </div>

              {/* ── Category picker ── */}
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide">
                    Event Category
                  </label>
                  {categoryLocked && (
                    <span className="flex items-center gap-1 text-caption text-casa-gold font-semibold">
                      <Lock size={11} /> Locked
                    </span>
                  )}
                </div>
                <div className="relative">
                  <select
                    value={category}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className={cn(
                      "w-full appearance-none bg-casa-bg border rounded-card px-4 py-3 pr-10 text-body-sm text-casa-navy outline-none transition-colors",
                      categoryLocked ? "border-casa-gold focus:border-casa-gold" : "border-casa-border focus:border-casa-gold"
                    )}
                  >
                    {ALL_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>
                    ))}
                  </select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted pointer-events-none" />
                </div>
                <p className="text-caption text-casa-muted mt-1.5">
                  {categoryLocked
                    ? 'Category locked — AI will not change it. Tap again to pick a different one.'
                    : 'Changing the category updates which fields are shown below.'}
                </p>
              </div>

              {/* ── Location ── */}
              <div className="px-6 pt-5 pb-5 border-b border-casa-divider space-y-4">
                <div>
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                    <MapPin size={12} />
                    Location Name
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    placeholder="e.g. EDS Air Conditioning, Lincoln Park"
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                    <MapPin size={12} />
                    Address
                  </label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="e.g. 3209 Washington Rd., West Palm Beach, FL"
                    className={inputCls}
                  />
                </div>
              </div>

              {/* ── Category-specific enrichment fields ── */}
              <div className="px-6 py-5 space-y-5">
                {fields.map((field) => {
                  const config = FIELD_CONFIG[field]
                  return (
                    <div key={field}>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                        {config.label}
                      </label>
                      {config.multiline ? (
                        <textarea
                          rows={field === 'what_to_bring' ? 5 : 3}
                          value={form[field] ?? ''}
                          onChange={e => set(field, e.target.value)}
                          placeholder={config.placeholder}
                          className={textareaCls}
                        />
                      ) : (
                        <input
                          type={config.type ?? 'text'}
                          value={form[field] ?? ''}
                          onChange={e => set(field, e.target.value)}
                          placeholder={config.placeholder}
                          className={inputCls}
                        />
                      )}
                    </div>
                  )
                })}

                {/* ── Delete ── */}
                <div className="pt-2 border-t border-casa-divider">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-button border border-red-200 text-red-500 text-body-sm font-semibold hover:bg-red-50 transition-colors"
                    >
                      <Trash2 size={14} />
                      Delete Event
                    </button>
                  ) : (
                    <div className="bg-red-50 border border-red-200 rounded-card p-4 space-y-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-body-sm text-red-700 font-semibold">Delete "{event.title}"?</p>
                      </div>
                      <p className="text-caption text-red-600">Removes from Casa Tabor only — won't affect Google Calendar.</p>
                      <div className="flex gap-2">
                        <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-2 rounded-button border border-red-200 text-body-sm font-semibold text-red-500 hover:bg-white transition-colors">
                          Cancel
                        </button>
                        <button onClick={handleDelete} disabled={deleting} className="flex-1 py-2 rounded-button bg-red-500 text-white text-body-sm font-semibold hover:bg-red-600 disabled:opacity-50 transition-colors">
                          {deleting ? 'Deleting…' : 'Yes, Delete'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-casa-border flex gap-3 shrink-0">
              <button onClick={onClose} className="flex-1 py-3 rounded-button border border-casa-border text-body-sm font-semibold text-casa-navy hover:bg-casa-bg transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={save.isPending}
                className="flex-1 py-3 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Save size={15} />
                {save.isPending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}

const inputCls = 'w-full bg-casa-bg border border-casa-border rounded-card px-4 py-3 text-body-sm text-casa-navy placeholder-casa-muted/50 outline-none focus:border-casa-gold transition-colors'
const textareaCls = 'w-full bg-casa-bg border border-casa-border rounded-card px-4 py-3 text-body-sm text-casa-navy placeholder-casa-muted/50 resize-none outline-none focus:border-casa-gold transition-colors'
