import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Save, Sparkles, Trash2, AlertTriangle,
  CheckCircle, MapPin, ChevronDown, Users, Lock, Clock, Pencil, Check, Repeat,
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

/** Expand an RRULE into occurrence {start,end} pairs, excluding the master (first) occurrence. */
function expandRrule(masterStart: string, masterEnd: string, rrule: string): Array<{ start: string; end: string }> {
  const get = (key: string) => rrule.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? ''
  const freq = get('FREQ')
  const interval = Math.max(1, parseInt(get('INTERVAL') || '1', 10))
  const byDayNames: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 }
  const byDay = get('BYDAY').split(',').filter(Boolean).map(d => byDayNames[d]).filter(d => d !== undefined) as number[]
  const untilRaw = get('UNTIL')
  const countStr = get('COUNT')
  const until = untilRaw
    ? new Date(`${untilRaw.slice(0,4)}-${untilRaw.slice(4,6)}-${untilRaw.slice(6,8)}T23:59:59Z`)
    : null
  const maxCount = countStr ? parseInt(countStr, 10) : 500

  const origin = new Date(masterStart)
  const duration = new Date(masterEnd).getTime() - origin.getTime()
  const results: Array<{ start: string; end: string }> = []

  // Generate all candidate dates, collect all that are > origin (or same date but excluded)
  // Hard cap: never generate more than 500 instances
  const addOcc = (d: Date) => {
    if (results.length >= Math.min(maxCount - 1, 499)) return false
    if (until && d > until) return false
    if (d.toDateString() === origin.toDateString()) return true // skip master
    const s = new Date(d); s.setHours(origin.getHours(), origin.getMinutes(), origin.getSeconds(), 0)
    results.push({ start: s.toISOString(), end: new Date(s.getTime() + duration).toISOString() })
    return true
  }

  if (freq === 'DAILY') {
    const cur = new Date(origin); cur.setDate(cur.getDate() + interval)
    while ((until ? cur <= until : results.length < maxCount - 1) && results.length < 499) {
      if (!addOcc(cur)) break
      cur.setDate(cur.getDate() + interval)
    }
  } else if (freq === 'WEEKLY') {
    const effectiveByDay = byDay.length > 0 ? byDay : [origin.getDay()]
    // Start from the Sunday of the origin week and walk forward week-by-week
    const weekSun = new Date(origin); weekSun.setDate(origin.getDate() - origin.getDay())
    let weekOffset = 0
    const maxWeeks = 260 // 5 years safety
    outer: while (weekOffset < maxWeeks) {
      const ws = new Date(weekSun); ws.setDate(weekSun.getDate() + weekOffset * 7 * interval)
      const sorted = [...effectiveByDay].sort((a, b) => a - b)
      for (const d of sorted) {
        const day = new Date(ws); day.setDate(ws.getDate() + d)
        if (day < origin) continue // before master
        if (until && day > until) break outer
        if (results.length >= Math.min(maxCount - 1, 499)) break outer
        addOcc(day)
      }
      weekOffset++
    }
  } else if (freq === 'MONTHLY') {
    const cur = new Date(origin); cur.setMonth(cur.getMonth() + interval)
    while ((until ? cur <= until : results.length < maxCount - 1) && results.length < 499) {
      if (!addOcc(cur)) break
      cur.setMonth(cur.getMonth() + interval)
    }
  } else if (freq === 'YEARLY') {
    const cur = new Date(origin); cur.setFullYear(cur.getFullYear() + interval)
    while ((until ? cur <= until : results.length < maxCount - 1) && results.length < 499) {
      if (!addOcc(cur)) break
      cur.setFullYear(cur.getFullYear() + interval)
    }
  }

  return results
}

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

  // Is this event a recurring instance (not the master)?
  const isInstance = !!event.recurrence_master_id
  const [masterData, setMasterData] = useState<{ rrule: string | null; enrichment: typeof enr } | null>(null)

  // Fetch master's rrule + enrichment for instances
  useEffect(() => {
    if (!open || !isInstance || !event.recurrence_master_id) { setMasterData(null); return }
    supabase.from('events').select('rrule, event_enrichments(*)').eq('id', event.recurrence_master_id).single()
      .then(({ data }) => {
        if (data) setMasterData({
          rrule: (data as any).rrule ?? null,
          enrichment: Array.isArray((data as any).event_enrichments)
            ? (data as any).event_enrichments[0] ?? null
            : (data as any).event_enrichments ?? null,
        })
      })
  }, [open, event.id, event.recurrence_master_id, isInstance])

  // Recurring edit scope modal
  type RecurScope = 'this' | 'future' | 'all'
  const [showScopeModal, setShowScopeModal] = useState(false)
  const [_pendingSave, setPendingSave] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'saving' | 'slow'>('saving')

  // The enrichment to use: for instances, prefer master enrichment for rrule/category
  const effectiveEnr = isInstance ? (masterData?.enrichment ?? enr) : enr

  // Local state — category can differ from AI-detected one
  const [category, setCategory] = useState(effectiveEnr?.category ?? 'other')
  const [categoryLocked, setCategoryLocked] = useState(false)
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
  const [eventType, setEventType] = useState<'event' | 'reminder'>(event.event_type ?? 'event')

  // All-day toggle
  const [isAllDay, setIsAllDay] = useState(event.all_day ?? false)

  // Recurrence state
  type RFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly'
  const parseRrule = (rrule: string | null): { freq: RFreq; interval: number; byDay: number[]; endType: 'never' | 'date' | 'count'; endDate: string; count: number } => {
    if (!rrule) return { freq: 'none', interval: 1, byDay: [], endType: 'never', endDate: '', count: 1 }
    const get = (key: string) => rrule.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? ''
    const freqMap: Record<string, RFreq> = { DAILY: 'daily', WEEKLY: 'weekly', MONTHLY: 'monthly', YEARLY: 'yearly' }
    const freq = freqMap[get('FREQ')] ?? 'none'
    const interval = parseInt(get('INTERVAL') || '1', 10)
    const byDayMap: Record<string, number> = { SU:0, MO:1, TU:2, WE:3, TH:4, FR:5, SA:6 }
    const byDay = get('BYDAY').split(',').filter(Boolean).map(d => byDayMap[d] ?? -1).filter(d => d >= 0)
    const until = get('UNTIL')
    const countStr = get('COUNT')
    const endType = countStr ? 'count' : until ? 'date' : 'never'
    const endDate = until ? until.slice(0, 8).replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3') : ''
    const count = countStr ? parseInt(countStr, 10) : 1
    return { freq, interval, byDay, endType, endDate, count }
  }
  // For instances, use the master's rrule (loaded async); fall back to event.rrule
  const effectiveRrule = isInstance ? (masterData?.rrule ?? event.rrule ?? null) : (event.rrule ?? null)
  const [recur, setRecur] = useState(() => parseRrule(effectiveRrule))

  const buildRrule = (): string | null => {
    if (recur.freq === 'none') return null
    const dayNames = ['SU','MO','TU','WE','TH','FR','SA']
    let r = `FREQ=${recur.freq.toUpperCase()}`
    if (recur.interval > 1) r += `;INTERVAL=${recur.interval}`
    if (recur.freq === 'weekly' && recur.byDay.length > 0) r += `;BYDAY=${recur.byDay.map(d => dayNames[d]).join(',')}`
    if (recur.endType === 'date' && recur.endDate) r += `;UNTIL=${recur.endDate.replace(/-/g, '')}T000000Z`
    if (recur.endType === 'count' && recur.count > 1) r += `;COUNT=${recur.count}`
    return r
  }

  const switchToReminder = () => {
    setEventType('reminder')
    // Strip time → keep date at local midnight (all-day reminder)
    const datePart = startDT.slice(0, 10)
    if (datePart) {
      setStartDT(`${datePart}T00:00`)
      setEndDT(`${datePart}T00:00`)
    }
  }

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

  // Reset everything when sheet opens or when masterData loads for instances
  useEffect(() => {
    if (!open) return
    const activeEnr = isInstance ? (masterData?.enrichment ?? enr) : enr
    const cat = activeEnr?.category ?? 'other'
    setCategory(cat)
    setCategoryLocked(false)
    setLocation(event.location_name ?? '')
    setAddress(event.address ?? '')
    setDisplayTitle(event.title)
    setExtraContext('')
    setEnrichStatus('idle')
    setShowDeleteConfirm(false)
    setEventType(event.event_type ?? 'event')
    setIsAllDay(event.all_day ?? false)
    const activeRrule = isInstance ? (masterData?.rrule ?? event.rrule ?? null) : (event.rrule ?? null)
    setRecur(parseRrule(activeRrule))
    // Seed memberRoles from current event.members
    const roles: Record<string, 'primary' | 'attendee'> = {}
    for (const m of event.members ?? []) {
      roles[m.family_member.id] = m.role === 'primary' ? 'primary' : 'attendee'
    }
    setMemberRoles(roles)
    setStartDT(toLocalDT(event.start_time))
    setEndDT(toLocalDT(event.end_time))
  }, [open, event.id, masterData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update form when category changes (keep existing values, populate missing)
  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setCategoryLocked(true) // user manually picked — lock it
    const newFields = getFieldsForCategory(cat)
    setForm(prev => buildForm({ ...effectiveEnr, ...objectFromForm(prev, fields), category: cat } as typeof enr, newFields))
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
    // If this is a recurring instance, show scope modal before saving
    if (isInstance && !showScopeModal) {
      setShowScopeModal(true)
      setPendingSave(true)
      return
    }
    await doSave('all')
  }

  const handleScopeChoice = async (scope: RecurScope) => {
    setShowScopeModal(false)
    setPendingSave(false)
    await doSave(scope)
  }

  const doSave = async (scope: RecurScope) => {
    setIsSaving(true)
    setSaveStatus('saving')

    // Supabase free tier cold-starts can take 15-20s — allow 35s before giving up
    const saveTimeout = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('Save timed out. If this is your first action in a while, Supabase may be waking up — please try again in a moment.')), 35000)
    )
    // After 5s still saving, update status message to hint at cold start
    const slowTimer = setTimeout(() => setSaveStatus('slow'), 5000)

    try {
      await Promise.race([doSaveInner(scope), saveTimeout])
    } catch (err) {
      console.error('[EventEditSheet] doSave error:', err)
      alert((err as Error).message ?? 'Save failed. Please try again.')
    } finally {
      clearTimeout(slowTimer)
      setIsSaving(false)
      setSaveStatus('saving')
    }
  }

  const doSaveInner = async (scope: RecurScope) => {
    // 1. Save enrichment fields (category + all form fields)
    const patch = objectFromForm(form, fields) as Record<string, unknown>
    patch.category = category

    // Determine which event ID to apply enrichment to
    const masterIdForEnrichment = isInstance ? (event.recurrence_master_id!) : event.id
    const enrichmentEventId = scope === 'this' ? event.id : masterIdForEnrichment
    // Fire-and-forget enrichment — never block the critical save path on this
    save.mutateAsync({ eventId: enrichmentEventId, fields: patch }).catch(() => {})

    // 2. Always save event-level fields (title, location, address, times) unconditionally
    const parseDateTime = (dtLocal: string, fallbackISO: string): string => {
      if (!dtLocal) return fallbackISO
      const d = new Date(dtLocal)
      return isNaN(d.getTime()) ? fallbackISO : d.toISOString()
    }
    const allDayStart = isAllDay ? `${startDT.slice(0,10)}T00:00:00.000Z` : null
    const allDayEnd = isAllDay ? `${startDT.slice(0,10)}T23:59:59.000Z` : null
    const masterStart = allDayStart ?? parseDateTime(startDT, event.start_time)
    const masterEnd   = allDayEnd   ?? parseDateTime(endDT, event.end_time)
    const rruleStr = buildRrule()

    if (scope === 'this') {
      // Only update this single instance
      const { error } = await supabase.from('events').update({
        title: displayTitle,
        location_name: location.trim() || null,
        address: address.trim() || null,
        start_time: masterStart,
        end_time: masterEnd,
        all_day: isAllDay,
        event_type: eventType,
        is_enriched: true,
        updated_at: new Date().toISOString(),
      }).eq('id', event.id)
      if (error) { alert(`Save failed: ${error.message}`); return }
      // Update this instance's members
      await supabase.from('event_members').delete().eq('event_id', event.id)
      const inserts = Object.entries(memberRoles).map(([id, role]) => ({
        event_id: event.id, family_member_id: id, role, rsvp_status: 'accepted',
      }))
      if (inserts.length > 0) await supabase.from('event_members').insert(inserts)

    } else if (scope === 'future') {
      // Update this + all future instances by deleting future rows and re-inserting from this date
      const masterId = event.recurrence_master_id!
      // Delete this instance + all with same master that start >= this event
      await supabase.from('events').delete()
        .eq('recurrence_master_id', masterId)
        .gte('start_time', event.start_time)
      // Re-insert from this date with updated data using the existing rrule (truncated to this date)
      const { data: masterEvent } = await supabase.from('events').select('*').eq('id', masterId).single()
      if (masterEvent && (masterEvent as any).rrule) {
        const occurrences = expandRrule(masterStart, masterEnd, (masterEvent as any).rrule)
          .filter(occ => occ.start >= event.start_time)
        if (occurrences.length > 0) {
          const { data: newInstances } = await supabase.from('events').insert(
            occurrences.map(occ => ({
              title: displayTitle,
              description: event.description ?? null,
              start_time: occ.start,
              end_time: occ.end,
              all_day: isAllDay,
              event_type: eventType,
              location_name: location.trim() || null,
              address: address.trim() || null,
              lat: event.lat ?? null,
              lng: event.lng ?? null,
              google_calendar_id: event.google_calendar_id ?? null,
              source_member_id: event.source_member_id ?? null,
              status: 'confirmed' as const,
              is_enriched: true,
            }))
          ).select('id')
          if (newInstances?.length) {
            const memberCopies = newInstances.flatMap(ev =>
              Object.entries(memberRoles).map(([memberId, role]) => ({
                event_id: ev.id, family_member_id: memberId, role, rsvp_status: 'accepted',
              }))
            )
            if (memberCopies.length > 0) await supabase.from('event_members').insert(memberCopies)
          }
        }
      }

    } else {
      // 'all' — update master + regenerate all instances
      const masterIdToUpdate = isInstance ? event.recurrence_master_id! : event.id
      const { error: updateError } = await supabase.from('events').update({
        title: displayTitle,
        location_name: location.trim() || null,
        address: address.trim() || null,
        start_time: masterStart,
        end_time: masterEnd,
        all_day: isAllDay,
        event_type: eventType,
        rrule: rruleStr,
        is_enriched: true,
        updated_at: new Date().toISOString(),
      }).eq('id', masterIdToUpdate)

      if (updateError) { alert(`Save failed: ${updateError.message}`); return }

      // Sync master event members
      await supabase.from('event_members').delete().eq('event_id', masterIdToUpdate)
      const inserts = Object.entries(memberRoles).map(([id, role]) => ({
        event_id: masterIdToUpdate, family_member_id: id, role, rsvp_status: 'accepted',
      }))
      if (inserts.length > 0) await supabase.from('event_members').insert(inserts)

      // Delete all instances and re-expand
      await supabase.from('events').delete().eq('recurrence_master_id', masterIdToUpdate)

      if (rruleStr) {
        const occurrences = expandRrule(masterStart, masterEnd, rruleStr)
        if (occurrences.length > 0) {
          const eventCopies = occurrences.map(occ => ({
            title: displayTitle,
            description: event.description ?? null,
            start_time: occ.start,
            end_time: occ.end,
            all_day: isAllDay,
            event_type: eventType,
            location_name: location.trim() || null,
            address: address.trim() || null,
            lat: event.lat ?? null,
            lng: event.lng ?? null,
            google_calendar_id: event.google_calendar_id ?? null,
            source_member_id: event.source_member_id ?? null,
            status: 'confirmed' as const,
            is_enriched: false,
            rrule: null,
            recurrence_master_id: masterIdToUpdate,
          }))
          const { data: newEvents, error: insertErr } = await supabase.from('events').insert(eventCopies).select('id')
          if (!insertErr && newEvents?.length) {
            const memberCopies = newEvents.flatMap(ev =>
              Object.entries(memberRoles).map(([memberId, role]) => ({
                event_id: ev.id, family_member_id: memberId, role, rsvp_status: 'accepted',
              }))
            )
            if (memberCopies.length > 0) await supabase.from('event_members').insert(memberCopies)
          }
        }
      }
    }

    qc.invalidateQueries({ queryKey: ['events'] })
    // Push changes to Google Calendar — awaited so we know if it fails
    try {
      const pushRes = await supabase.functions.invoke('push-to-google', { body: { event_id: event.id } })
      if (pushRes.error) console.warn('[EventEditSheet] push-to-google error:', pushRes.error)
    } catch (pushErr) {
      console.warn('[EventEditSheet] push-to-google failed:', pushErr)
    }
    // Weather is cheap (no LLM) — always fetch for this event
    supabase.functions.invoke('fetch-event-weather', { body: { event_id: event.id } })
      .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
      .catch(() => {})
    // analyze-conflicts + analyze-prep removed from save — they run on the scheduled HomePage cadence (5x/day)

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
            onClick={e => { e.stopPropagation(); onClose(); }}
          />

          <motion.div
            key="edit-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-[70] bg-casa-surface rounded-t-2xl shadow-modal flex flex-col max-h-[90vh] sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl sm:rounded-2xl sm:bottom-8 sm:max-h-[85vh]"
            style={{ maxHeight: '90vh' }}
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 shrink-0 border-b border-casa-border">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-display-sm text-casa-navy leading-tight">Edit Details</h3>
                  {isInstance && (
                    <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-casa-gold/10 text-casa-gold text-[10px] font-semibold uppercase tracking-wide">
                      <Repeat size={9} />
                      Recurring
                    </span>
                  )}
                </div>
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

              {/* ── Event Type Toggle ── */}
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider">
                <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                  Type
                </label>
                <div className="flex gap-2">
                  {(['event', 'reminder'] as const).map(t => (
                    <button
                      key={t}
                      onClick={() => t === 'reminder' ? switchToReminder() : setEventType('event')}
                      className={cn(
                        'flex items-center gap-1.5 px-4 py-2 rounded-button border text-body-sm font-semibold transition-all',
                        eventType === t
                          ? t === 'reminder'
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-casa-navy text-white border-casa-navy'
                          : 'bg-casa-surface border-casa-border text-casa-muted hover:border-casa-navy/40'
                      )}
                    >
                      {t === 'reminder' ? '🔔' : '📅'} {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                {eventType === 'reminder' && (
                  <p className="text-caption text-casa-muted mt-2">
                    Reminders appear as a banner on the day — no time slot or travel needed.
                  </p>
                )}
              </div>

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
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider space-y-4">
                {/* Header + all-day toggle */}
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide">
                    <Clock size={12} />
                    Date &amp; Time
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <span className="text-caption text-casa-muted font-medium">All day</span>
                    <button
                      type="button"
                      onClick={() => setIsAllDay(v => !v)}
                      className={cn(
                        'relative w-9 h-5 rounded-full transition-colors duration-200',
                        isAllDay ? 'bg-casa-gold' : 'bg-casa-border'
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200',
                        isAllDay ? 'translate-x-4' : 'translate-x-0'
                      )} />
                    </button>
                  </label>
                </div>

                {/* Date/time pickers — collapse time when all-day */}
                {isAllDay ? (
                  <div>
                    <p className="text-caption text-casa-muted mb-1">Date</p>
                    <input
                      type="date"
                      value={startDT.slice(0, 10)}
                      onChange={e => { setStartDT(`${e.target.value}T00:00`); setEndDT(`${e.target.value}T23:59`) }}
                      className={inputCls}
                    />
                  </div>
                ) : (
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
                )}

                {/* Recurrence */}
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-caption text-casa-muted font-medium shrink-0">Repeat</label>
                    <div className="relative flex-1">
                      <select
                        value={recur.freq}
                        onChange={e => setRecur(r => ({ ...r, freq: e.target.value as typeof r.freq, byDay: [] }))}
                        className={cn(inputCls, 'pr-8 appearance-none')}
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted pointer-events-none" />
                    </div>
                    {recur.freq !== 'none' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-caption text-casa-muted">every</span>
                        <input
                          type="number"
                          min={1} max={99}
                          value={recur.interval}
                          onChange={e => setRecur(r => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) }))}
                          className={cn(inputCls, 'w-14 text-center')}
                        />
                        <span className="text-caption text-casa-muted">
                          {recur.freq === 'daily' ? 'day(s)' : recur.freq === 'weekly' ? 'wk(s)' : recur.freq === 'monthly' ? 'mo(s)' : 'yr(s)'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Day-of-week selector for weekly */}
                  {recur.freq === 'weekly' && (
                    <div className="flex gap-1.5 flex-wrap">
                      {['S','M','T','W','T','F','S'].map((d, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setRecur(r => ({
                            ...r,
                            byDay: r.byDay.includes(i) ? r.byDay.filter(x => x !== i) : [...r.byDay, i]
                          }))}
                          className={cn(
                            'w-8 h-8 rounded-full text-caption font-bold transition-colors',
                            recur.byDay.includes(i)
                              ? 'bg-casa-gold text-white'
                              : 'bg-casa-bg text-casa-muted border border-casa-border hover:border-casa-gold'
                          )}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* End condition */}
                  {recur.freq !== 'none' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-caption text-casa-muted font-medium shrink-0">Ends</label>
                      <div className="flex gap-2">
                        {(['never','date','count'] as const).map(opt => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => setRecur(r => ({ ...r, endType: opt }))}
                            className={cn(
                              'px-3 py-1 rounded-full text-caption font-medium transition-colors',
                              recur.endType === opt
                                ? 'bg-casa-gold text-white'
                                : 'bg-casa-bg border border-casa-border text-casa-muted hover:border-casa-gold'
                            )}
                          >
                            {opt === 'never' ? 'Never' : opt === 'date' ? 'On date' : 'After'}
                          </button>
                        ))}
                      </div>
                      {recur.endType === 'date' && (
                        <input
                          type="date"
                          value={recur.endDate}
                          onChange={e => setRecur(r => ({ ...r, endDate: e.target.value }))}
                          className={cn(inputCls, 'flex-1 min-w-[130px]')}
                        />
                      )}
                      {recur.endType === 'count' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={2} max={999}
                            value={recur.count}
                            onChange={e => setRecur(r => ({ ...r, count: Math.max(2, parseInt(e.target.value) || 2) }))}
                            className={cn(inputCls, 'w-16 text-center')}
                          />
                          <span className="text-caption text-casa-muted">occurrences</span>
                        </div>
                      )}
                    </div>
                  )}
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
                disabled={isSaving}
                className="flex-1 py-3 rounded-button bg-casa-gold text-white text-body-sm font-semibold hover:brightness-110 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                <Save size={15} />
                {isSaving ? (saveStatus === 'slow' ? 'Waking up…' : 'Saving…') : 'Save'}
              </button>
            </div>
          </motion.div>

          {/* Recurring edit scope modal */}
          <AnimatePresence>
            {showScopeModal && (
              <motion.div
                key="scope-modal"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[80] flex items-center justify-center p-6"
                onClick={() => { setShowScopeModal(false); setPendingSave(false) }}
              >
                <motion.div
                  initial={{ scale: 0.92, opacity: 0, y: 16 }}
                  animate={{ scale: 1, opacity: 1, y: 0 }}
                  exit={{ scale: 0.92, opacity: 0, y: 16 }}
                  transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                  className="bg-casa-surface rounded-2xl shadow-modal w-full max-w-sm p-6"
                  onClick={e => e.stopPropagation()}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Repeat size={16} className="text-casa-gold" />
                    <h4 className="font-display text-display-sm text-casa-navy">Edit recurring event</h4>
                  </div>
                  <p className="text-caption text-casa-muted mb-5">How would you like to apply your changes?</p>
                  <div className="space-y-2">
                    {([
                      { scope: 'this', label: 'This event', desc: 'Only this occurrence will be updated' },
                      { scope: 'future', label: 'This and following events', desc: 'This and all future occurrences' },
                      { scope: 'all', label: 'All events', desc: 'Every occurrence in the series' },
                    ] as { scope: RecurScope; label: string; desc: string }[]).map(({ scope, label, desc }) => (
                      <button
                        key={scope}
                        onClick={() => handleScopeChoice(scope)}
                        className="w-full text-left px-4 py-3 rounded-xl border border-casa-border hover:border-casa-gold hover:bg-casa-gold/5 transition-all group"
                      >
                        <p className="text-body-sm font-semibold text-casa-navy group-hover:text-casa-gold transition-colors">{label}</p>
                        <p className="text-caption text-casa-muted mt-0.5">{desc}</p>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => { setShowScopeModal(false); setPendingSave(false) }}
                    className="mt-4 w-full py-2.5 rounded-button border border-casa-border text-body-sm font-semibold text-casa-muted hover:text-casa-navy transition-colors"
                  >
                    Cancel
                  </button>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </AnimatePresence>
  )
}

const inputCls = 'w-full bg-casa-bg border border-casa-border rounded-card px-4 py-3 text-body-sm text-casa-navy placeholder-casa-muted/50 outline-none focus:border-casa-gold transition-colors'
const textareaCls = 'w-full bg-casa-bg border border-casa-border rounded-card px-4 py-3 text-body-sm text-casa-navy placeholder-casa-muted/50 resize-none outline-none focus:border-casa-gold transition-colors'
