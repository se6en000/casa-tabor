import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Save, Sparkles, Trash2,
  MapPin, ChevronDown, Users, Lock, Clock, Repeat, Mic, MicOff,
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
import { useSavedPlaces } from '../../hooks/useSavedPlaces'
import BounceScroll from '../shared/BounceScroll'
import {
  Alert,
  Button,
  Chip,
  DateTimeDial,
  DisclosureSection,
  FormSummaryCard,
  IconButton,
  Input,
  Modal,
  SegmentedControl,
  Select,
  Switch,
  Textarea,
} from '../ui'
import { formatAllDayRangeLabel, normalizeAllDayEventRange } from '../../utils/allDayEventRange'

const ALL_CATEGORIES = Object.keys(CATEGORY_LABEL) as string[]

type EnrichStatus = 'idle' | 'loading' | 'success' | 'error'

/** Expand an RRULE into occurrence {start,end} pairs, excluding the master (first) occurrence. */
function expandRrule(masterStart: string, masterEnd: string, rrule: string): Array<{ start: string; end: string }> {  const get = (key: string) => rrule.match(new RegExp(`${key}=([^;]+)`))?.[1] ?? ''
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

/** Format a Date as Google Calendar UNTIL value: YYYYMMDDTHHMMSSZ */
function toGoogleUntil(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`
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

  // Lock body scroll while edit sheet is open
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [open])

  // Is this event a recurring instance (not the master)?
  const isInstance = !!event.recurrence_master_id
  const [masterData, setMasterData] = useState<{ rrule: string | null; enrichment: typeof enr } | null>(null)

  // Fetch master's rrule + enrichment for instances
  useEffect(() => {
    if (!open || !isInstance || !event.recurrence_master_id) { setMasterData(null); return }
    supabase.from('events').select(`
      rrule,
      event_enrichments (
        id,
        event_id,
        category,
        confidence,
        what_to_bring,
        outfit_suggestion,
        parking_notes,
        contact_name,
        contact_phone,
        cost_estimate,
        dietary_notes,
        meal_impact,
        prep_notes,
        departure_time,
        drive_time_mins,
        route_summary,
        weather_at_event,
        weather_summary,
        enriched_by,
        enriched_at,
        created_at,
        updated_at
      )
    `).eq('id', event.recurrence_master_id).single()
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
  const [showLocationSuggest, setShowLocationSuggest] = useState(false)
  const locationRef = useRef<HTMLDivElement>(null)
  const { data: savedPlaces = [] } = useSavedPlaces()
  const [displayTitle, setDisplayTitle] = useState(event.title)
  const titleRef = useRef<HTMLInputElement>(null)
  const [extraContext, setExtraContext] = useState('')
  const [enrichStatus, setEnrichStatus] = useState<EnrichStatus>('idle')
  const [enrichMessage, setEnrichMessage] = useState('')
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [eventType, setEventType] = useState<'event' | 'reminder'>(event.event_type ?? 'event')

  const clearLocation = () => {
    setLocation('')
    setAddress('')
    setShowLocationSuggest(false)
    markDirty()
  }

  // Mic state for AI context textarea
  const [micActive, setMicActive] = useState(false)
  const micPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const STT_BRIDGE = 'http://localhost:8766'

  const startMic = useCallback(async () => {
    try {
      await fetch(`${STT_BRIDGE}/start`, { method: 'POST' })
      setMicActive(true)
      micPollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`${STT_BRIDGE}/status`)
          const data = await res.json()
          if (data.interim_transcript) setExtraContext(data.interim_transcript)
          if (data.transcript && !data.recording) {
            setExtraContext(data.transcript)
            stopMic()
          }
        } catch { /* bridge unreachable */ }
      }, 300)
    } catch { setMicActive(false) }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stopMic = useCallback(() => {
    fetch(`${STT_BRIDGE}/stop`, { method: 'POST' }).catch(() => {})
    if (micPollRef.current) { clearInterval(micPollRef.current); micPollRef.current = null }
    setMicActive(false)
  }, [])

  // Clean up mic on unmount
  useEffect(() => () => { if (micPollRef.current) clearInterval(micPollRef.current) }, [])

  // Autosave state
  const [_autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'scheduled' | 'saving' | 'saved'>('idle')
  const isDirtyRef = useRef(false)
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  // Date/time state uses local datetime strings shared by the touch dial.
  const toLocalDT = (iso: string, allDay = false) => {
    if (allDay) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
      if (m) return `${m[1]}-${m[2]}-${m[3]}T00:00`
    }
    const d = new Date(iso)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  }
  const [startDT, setStartDT] = useState(toLocalDT(event.start_time, event.all_day))
  const [endDT, setEndDT] = useState(toLocalDT(event.end_time, event.all_day))
  const fields = getFieldsForCategory(category)
  const scheduleSummary = (() => {
    const start = new Date(startDT)
    const end = new Date(endDT)
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 'Choose a date and time'
    if (isAllDay) return formatAllDayRangeLabel(startDT, endDT)
    const day = new Intl.DateTimeFormat('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).format(start)
    const time = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })
    return `${day} · ${time.format(start)}–${time.format(end)}`
  })()

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
    isDirtyRef.current = false
    setAutoSaveStatus('idle')
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    const activeEnr = isInstance ? (masterData?.enrichment ?? enr) : enr
    const cat = activeEnr?.category ?? 'other'
    setCategory(cat)
    setCategoryLocked(Boolean(activeEnr?.category_locked))
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
    setStartDT(toLocalDT(event.start_time, event.all_day))
    setEndDT(toLocalDT(event.end_time, event.all_day))
    // Pre-populate form fields from existing enrichment so editing doesn't wipe them
    if (activeEnr) {
      setForm(buildForm(activeEnr, getFieldsForCategory(cat)))
    } else {
      setForm({})
    }
  }, [open, event.id, masterData]) // eslint-disable-line react-hooks/exhaustive-deps

  // Update form when category changes (keep existing values, populate missing)
  const handleCategoryChange = (cat: string) => {
    setCategory(cat)
    setCategoryLocked(true) // user manually picked — lock it
    const newFields = getFieldsForCategory(cat)
    setForm(prev => buildForm({ ...effectiveEnr, ...objectFromForm(prev, fields), category: cat } as typeof enr, newFields))
    markDirty()
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

  const set = (field: string, value: string) => { setForm(f => ({ ...f, [field]: value })); markDirty() }

  // Autosave: schedule a debounced save 1.5s after last change (non-recurring only)
  const markDirty = () => {
    isDirtyRef.current = true
    if (isInstance) return  // recurring: use manual Save for scope control
    setAutoSaveStatus('scheduled')
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current)
    autoSaveTimerRef.current = setTimeout(() => runAutoSave(), 1500)
  }

  const runAutoSave = async () => {
    isDirtyRef.current = false
    if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
    setAutoSaveStatus('saving')
    setIsSaving(true)
    setSaveStatus('saving')
    const slowTimer = setTimeout(() => setSaveStatus('slow'), 5000)
    try {
      await doSaveInner('all', true)
      setAutoSaveStatus('saved')
      setTimeout(() => setAutoSaveStatus('idle'), 2000)
    } catch (err) {
      console.error('[autosave] failed:', err)
      setAutoSaveStatus('idle')
    } finally {
      clearTimeout(slowTimer)
      setIsSaving(false)
      setSaveStatus('saving')
    }
  }

  const handleClose = () => {
    if (isSaving) { onClose(); return }
    if (isDirtyRef.current && !isInstance) {
      if (autoSaveTimerRef.current) { clearTimeout(autoSaveTimerRef.current); autoSaveTimerRef.current = null }
      runAutoSave().finally(() => onClose())
    } else {
      onClose()
    }
  }

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

  const pendingTitleRef = useRef<string | null>(null)

  const handleSave = async () => {
    // Flush DOM value — fixes iOS/Safari composition lag where the last
    // typed character hasn't committed to React state before Save is tapped
    const finalTitle = titleRef.current?.value ?? displayTitle
    if (finalTitle !== displayTitle) setDisplayTitle(finalTitle)
    pendingTitleRef.current = finalTitle
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

  const doSaveInner = async (scope: RecurScope, autoSave = false) => {
    // Use pendingTitleRef when available (set in handleSave to flush DOM composition state)
    const titleToSave = pendingTitleRef.current ?? displayTitle
    pendingTitleRef.current = null

    // 1. Save enrichment fields (category + all form fields)
    const patch = objectFromForm(form, fields) as Record<string, unknown>
    patch.category = category
    patch.category_locked = categoryLocked

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
    const allDayRange = isAllDay ? normalizeAllDayEventRange(startDT, endDT) : null
    const allDayStart = allDayRange?.start ?? null
    const allDayEnd = allDayRange?.end ?? null
    const masterStart = allDayStart ?? parseDateTime(startDT, event.start_time)
    const masterEnd   = allDayEnd   ?? parseDateTime(endDT, event.end_time)
    const rruleStr = buildRrule()
    const normalizedLocation = location.trim() || null
    const normalizedAddress = address.trim() || null
    const locationChanged =
      normalizedLocation !== (event.location_name?.trim() || null) ||
      normalizedAddress !== (event.address?.trim() || null)
    const latForSave = locationChanged ? null : (event.lat ?? null)
    const lngForSave = locationChanged ? null : (event.lng ?? null)

    // Track new master ID created during 'future' split (used for Google sync below)
    let newFutureMasterId: string | null = null

    if (scope === 'this') {
      // Only update this single instance
      const { error } = await supabase.from('events').update({
        title: titleToSave,
        location_name: normalizedLocation,
        address: normalizedAddress,
        lat: latForSave,
        lng: lngForSave,
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
      // Split the series: original master gets truncated, a NEW master takes over from split point
      const masterId = event.recurrence_master_id!

      // Load master first (need its rrule, source_member_id, etc.)
      const { data: masterEvent } = await supabase.from('events').select('*').eq('id', masterId).single()
      if (!masterEvent) { alert('Could not load master event'); return }

      // Step 1: Truncate original master's rrule — add UNTIL 1 second before the split
      const originalRrule = (masterEvent as any).rrule as string | null
      if (originalRrule) {
        const splitMs = new Date(event.start_time).getTime() - 1000
        const untilStr = toGoogleUntil(new Date(splitMs))
        const truncatedRrule = originalRrule
          .replace(/;?UNTIL=[^;]+/g, '')
          .replace(/;?COUNT=[^;]+/g, '')
          + `;UNTIL=${untilStr}`
        await supabase.from('events').update({
          rrule: truncatedRrule,
          updated_at: new Date().toISOString(),
        }).eq('id', masterId)
      }

      // Step 2: Create a NEW master for the future branch
      const { data: newMaster, error: newMasterErr } = await supabase.from('events').insert({
        title: titleToSave,
        description: (masterEvent as any).description ?? null,
        location_name: normalizedLocation,
        address: normalizedAddress,
        lat: latForSave,
        lng: lngForSave,
        start_time: masterStart,
        end_time: masterEnd,
        all_day: isAllDay,
        event_type: eventType,
        rrule: rruleStr,
        google_calendar_id: (masterEvent as any).google_calendar_id ?? null,
        source_member_id: (masterEvent as any).source_member_id ?? event.source_member_id ?? null,
        status: 'confirmed' as const,
        is_enriched: true,
        updated_at: new Date().toISOString(),
      }).select('id').single()

      if (newMasterErr || !newMaster) { alert(`Save failed: ${newMasterErr?.message}`); return }
      newFutureMasterId = newMaster.id

      // Members for new master
      const masterInserts = Object.entries(memberRoles).map(([id, role]) => ({
        event_id: newMaster.id, family_member_id: id, role, rsvp_status: 'accepted',
      }))
      if (masterInserts.length > 0) await supabase.from('event_members').insert(masterInserts)

      // Step 3: Delete instances from split point forward (under the original master)
      await supabase.from('events').delete()
        .eq('recurrence_master_id', masterId)
        .gte('start_time', event.start_time)

      // Step 4: Re-expand instances from split point, pointing to the NEW master
      if (rruleStr) {
        const occurrences = expandRrule(masterStart, masterEnd, rruleStr)
          .filter(occ => occ.start >= event.start_time)
        if (occurrences.length > 0) {
          const { data: newInstances } = await supabase.from('events').insert(
            occurrences.map(occ => ({
              title: titleToSave,
              description: (masterEvent as any).description ?? null,
              start_time: occ.start,
              end_time: occ.end,
              all_day: isAllDay,
              event_type: eventType,
              location_name: normalizedLocation,
              address: normalizedAddress,
              lat: latForSave,
              lng: lngForSave,
              google_calendar_id: (masterEvent as any).google_calendar_id ?? null,
              source_member_id: (masterEvent as any).source_member_id ?? event.source_member_id ?? null,
              status: 'confirmed' as const,
              is_enriched: true, // instances inherit from master — skip per-instance AI enrichment
              rrule: null,
              recurrence_master_id: newMaster.id,
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
        title: titleToSave,
        location_name: normalizedLocation,
        address: normalizedAddress,
        lat: latForSave,
        lng: lngForSave,
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
            title: titleToSave,
            description: event.description ?? null,
            start_time: occ.start,
            end_time: occ.end,
            all_day: isAllDay,
            event_type: eventType,
            location_name: normalizedLocation,
            address: normalizedAddress,
            lat: latForSave,
            lng: lngForSave,
            google_calendar_id: event.google_calendar_id ?? null,
            source_member_id: event.source_member_id ?? null,
            status: 'confirmed' as const,
            is_enriched: true, // instances inherit from master — skip per-instance AI enrichment
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

    // Google Calendar sync — strategy depends on scope
    if (scope === 'this') {
      // Single instance: use sync-event-to-google for create/push + retry queue fallback
      try {
        const syncRes = await supabase.functions.invoke('sync-event-to-google', { body: { event_id: event.id } })
        if (syncRes.error) {
          console.warn('[EventEditSheet] sync-event-to-google error:', syncRes.error)
        } else if (syncRes.data?.sync_status === 'failed') {
          console.warn('[EventEditSheet] sync-event-to-google failed:', syncRes.data)
        }
      } catch (pushErr) {
        console.warn('[EventEditSheet] sync-event-to-google invocation failed:', pushErr)
      }
      // Weather fetch for this single instance
      supabase.functions.invoke('fetch-event-weather', { body: { event_id: event.id } })
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch(() => {})

    } else if (scope === 'all') {
      // All instances: push master event (with full RRULE) to Google
      const masterIdToSync = isInstance ? event.recurrence_master_id! : event.id
      supabase.functions.invoke('update-recurring-google', { body: { master_event_id: masterIdToSync } })
        .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
        .catch(e => console.warn('[EventEditSheet] update-recurring-google failed:', e))

    } else if (scope === 'future') {
      // Future split: truncate original series in Google + create new series for future branch
      if (event.recurrence_master_id) {
        // Update original master in Google (now has UNTIL in rrule)
        supabase.functions.invoke('update-recurring-google', { body: { master_event_id: event.recurrence_master_id } })
          .catch(e => console.warn('[EventEditSheet] update-recurring-google (original) failed:', e))
      }
      if (newFutureMasterId) {
        // Create new Google recurring event for the future branch
        supabase.functions.invoke('update-recurring-google', { body: { master_event_id: newFutureMasterId } })
          .then(() => qc.invalidateQueries({ queryKey: ['events'] }))
          .catch(e => console.warn('[EventEditSheet] update-recurring-google (future) failed:', e))
      }
    }
    // analyze-conflicts + analyze-prep removed from save — they run on the scheduled HomePage cadence (5x/day)

    if (!autoSave) onClose()
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
            className="fixed inset-0 z-scrim bg-black/50"
            onClick={e => { e.stopPropagation(); onClose(); }}
            onTouchStart={e => e.stopPropagation()}
            onTouchMove={e => e.stopPropagation()}
            onTouchEnd={e => e.stopPropagation()}
            onPointerDown={e => e.stopPropagation()}
          />

          <motion.div
            key="edit-sheet"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 260 }}
            className="fixed bottom-0 left-0 right-0 z-modal bg-casa-surface rounded-t-modal shadow-modal flex flex-col h-[90vh] overflow-hidden sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-2xl sm:rounded-modal sm:bottom-8 sm:h-[85vh]"
            onClick={e => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-casa-border" />
            </div>

            {/* Header */}
            <div className="px-6 py-4 shrink-0 border-b border-casa-border">
              {/* Title row: label + save/close */}
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-display-sm text-casa-navy leading-tight">Edit Details</h3>
                  {isInstance && (
                    <Chip tone="accent" size="sm" icon={<Repeat size={12} />}>
                      Recurring
                    </Chip>
                  )}
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button
                    onClick={handleSave}
                    loading={isSaving}
                    size="sm"
                    leadingIcon={<Save size={14} />}
                  >
                    {saveStatus === 'slow' && isSaving ? 'Waking…' : 'Save'}
                  </Button>
                  <IconButton icon={<X size={18} />} aria-label="Close event editor" onClick={handleClose} size="sm" />
                </div>
              </div>
              {/* Full-width touch-friendly title input */}
              <Input
                ref={titleRef}
                value={displayTitle}
                onChange={e => { setDisplayTitle(e.target.value); markDirty() }}
                className="font-display text-heading"
                placeholder="Event title…"
                style={{ touchAction: 'manipulation' }}
              />
              <p className="mt-2 truncate text-body-sm text-casa-muted">
                {scheduleSummary}{location ? ` · ${location}` : ''}
              </p>
            </div>

            {/* Form */}
            <BounceScroll className="flex-1 min-h-0">

              {/* ── Event Type Toggle + Delete ── */}
              <div className="px-6 pt-5 pb-4 border-b border-casa-divider">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-caption font-semibold text-casa-muted uppercase tracking-wide">
                    Type
                  </label>
                  {/* Inline delete */}
                  <Button variant="ghost" size="sm" onClick={() => setShowDeleteConfirm(true)} leadingIcon={<Trash2 size={14} />} className="text-casa-error">
                    Delete
                  </Button>
                </div>
                <SegmentedControl
                  aria-label="Event type"
                  value={eventType}
                  onChange={(next) => {
                    if (next === 'reminder') switchToReminder()
                    else setEventType('event')
                    markDirty()
                  }}
                  options={[
                    { value: 'event', label: 'Event' },
                    { value: 'reminder', label: 'Reminder' },
                  ]}
                />
                {eventType === 'reminder' && (
                  <p className="text-caption text-casa-muted mt-2">
                    Reminders appear as a banner on the day — no time slot or travel needed.
                  </p>
                )}
              </div>

              <DisclosureSection
                title="AI tools"
                summary={extraContext ? 'Context ready to apply' : 'Optional re-enrichment context'}
                icon={<Sparkles size={18} />}
                className="bg-casa-bg/40"
              >
                {/* Textarea + mic + enrich button inline */}
                <div className="flex items-start gap-2">
                  <Textarea
                    rows={2}
                    value={extraContext}
                    onChange={e => setExtraContext(e.target.value)}
                    placeholder='Optional context — e.g. "EDS is the AC company, appointment at 3209 Washington Rd WPB"'
                    className="flex-1"
                  />
                  <div className="flex flex-col gap-1.5 shrink-0">
                    {/* Mic button */}
                    <IconButton
                      icon={micActive ? <MicOff size={16} /> : <Mic size={16} />}
                      aria-label={micActive ? 'Stop listening' : 'Speak context'}
                      type="button"
                      onClick={micActive ? stopMic : startMic}
                      title={micActive ? 'Stop listening' : 'Speak context'}
                      variant={micActive ? 'danger' : 'secondary'}
                      size="sm"
                      className={cn(micActive && 'animate-pulse')}
                    />
                    {/* Enrich button */}
                    <IconButton
                      icon={<Sparkles size={16} className={enrichStatus === 'loading' ? 'animate-pulse' : ''} />}
                      aria-label="Re-enrich with AI"
                      onClick={handleReenrich}
                      disabled={enrichStatus === 'loading'}
                      title="Re-enrich with AI"
                      variant="secondary"
                      size="sm"
                      className={cn(enrichStatus === 'loading' && 'ai-thinking')}
                    />
                  </div>
                </div>

                {/* Status banner */}
                <AnimatePresence>
                  {enrichStatus !== 'idle' && enrichStatus !== 'loading' && (
                    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-3">
                      <Alert tone={enrichStatus === 'success' ? 'success' : 'danger'} title={enrichStatus === 'success' ? 'Enrichment complete' : 'Enrichment failed'}>
                        {enrichMessage}
                      </Alert>
                    </motion.div>
                  )}
                </AnimatePresence>
              </DisclosureSection>

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
                        <Chip
                          key={member.id}
                          onClick={() => { setMemberRoles(prev => {
                            const next = { ...prev }
                            if (!prev[member.id]) {
                              next[member.id] = 'attendee'
                            } else if (prev[member.id] === 'attendee') {
                              Object.keys(next).forEach(id => { if (next[id] === 'primary') next[id] = 'attendee' })
                              next[member.id] = 'primary'
                            } else {
                              delete next[member.id]
                            }
                            return next
                          }); markDirty() }}
                          selected={isPrimary}
                          tone={isTagged ? 'accent' : 'neutral'}
                          className={cn(isTagged && 'border-transparent text-white', isSupporting && 'opacity-75')}
                          style={{
                            ...(isTagged ? { backgroundColor: member.color_hex, borderColor: member.color_hex } : {}),
                            ...(isPrimary ? { ringColor: member.color_hex } : {}),
                          }}
                        >
                          {isPrimary && <span className="text-caption leading-none">★</span>}
                          {isSupporting && <span className="w-2 h-2 rounded-full bg-white/60 shrink-0" />}
                          {!isTagged && <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: member.color_hex }} />}
                          {member.name}
                        </Chip>
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
                  <Switch
                    label="All day"
                    checked={isAllDay}
                    onCheckedChange={(checked) => { setIsAllDay(checked); markDirty() }}
                  />
                </div>

                {/* Date/time dials — collapse time when all-day */}
                {isAllDay ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <p className="text-caption text-casa-muted mb-1">Start date</p>
                      <Input
                        type="date"
                        value={startDT.slice(0, 10)}
                        onChange={e => {
                          const next = e.target.value
                          setStartDT(`${next}T00:00`)
                          if (endDT.slice(0, 10) < next) setEndDT(`${next}T23:59`)
                          markDirty()
                        }}
                      />
                    </div>
                    <div>
                      <p className="text-caption text-casa-muted mb-1">End date</p>
                      <Input
                        type="date"
                        value={endDT.slice(0, 10)}
                        onChange={e => {
                          const next = e.target.value
                          setEndDT(`${next}T23:59`)
                          if (next < startDT.slice(0, 10)) setStartDT(`${next}T00:00`)
                          markDirty()
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <DateTimeDial
                    startValue={startDT}
                    endValue={endDT}
                    onStartChange={setStartDT}
                    onEndChange={setEndDT}
                    onInteraction={markDirty}
                  />
                )}

                {/* Recurrence */}
                <DisclosureSection
                  title="Repeat"
                  summary={recur.freq === 'none' ? 'Does not repeat' : `Repeats ${recur.freq}`}
                  icon={<Repeat size={18} />}
                  defaultOpen={recur.freq !== 'none'}
                  className="-mx-6 -mb-4 border-b-0"
                >
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-caption text-casa-muted font-medium shrink-0">Repeat</label>
                    <div className="relative flex-1">
                      <Select
                        value={recur.freq}
                        onChange={e => { setRecur(r => ({ ...r, freq: e.target.value as typeof r.freq, byDay: [] })); markDirty() }}
                        className="pr-8 appearance-none"
                      >
                        <option value="none">Does not repeat</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="yearly">Yearly</option>
                      </Select>
                      <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted pointer-events-none" />
                    </div>
                    {recur.freq !== 'none' && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-caption text-casa-muted">every</span>
                        <Input
                          type="number"
                          min={1} max={99}
                          value={recur.interval}
                          onChange={e => { setRecur(r => ({ ...r, interval: Math.max(1, parseInt(e.target.value) || 1) })); markDirty() }}
                          className="w-20 text-center"
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
                        <Chip
                          key={i}
                          type="button"
                          selected={recur.byDay.includes(i)}
                          onClick={() => { setRecur(r => ({
                            ...r,
                            byDay: r.byDay.includes(i) ? r.byDay.filter(x => x !== i) : [...r.byDay, i]
                          })); markDirty() }}
                        >
                          {d}
                        </Chip>
                      ))}
                    </div>
                  )}

                  {/* End condition */}
                  {recur.freq !== 'none' && (
                    <div className="flex items-center gap-3 flex-wrap">
                      <label className="text-caption text-casa-muted font-medium shrink-0">Ends</label>
                      <div className="flex gap-2">
                        {(['never','date','count'] as const).map(opt => (
                          <Chip
                            key={opt}
                            type="button"
                            selected={recur.endType === opt}
                            onClick={() => { setRecur(r => ({ ...r, endType: opt })); markDirty() }}
                          >
                            {opt === 'never' ? 'Never' : opt === 'date' ? 'On date' : 'After'}
                          </Chip>
                        ))}
                      </div>
                      {recur.endType === 'date' && (
                        <Input
                          type="date"
                          value={recur.endDate}
                          onChange={e => { setRecur(r => ({ ...r, endDate: e.target.value })); markDirty() }}
                          className="flex-1"
                        />
                      )}
                      {recur.endType === 'count' && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="number"
                            min={2} max={999}
                            value={recur.count}
                            onChange={e => { setRecur(r => ({ ...r, count: Math.max(2, parseInt(e.target.value) || 2) })); markDirty() }}
                            className="w-24 text-center"
                          />
                          <span className="text-caption text-casa-muted">occurrences</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                </DisclosureSection>
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
                  <Select
                    value={category}
                    onChange={e => handleCategoryChange(e.target.value)}
                    className={cn('appearance-none pr-10', categoryLocked && 'border-casa-gold')}
                  >
                    {ALL_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{CATEGORY_LABEL[cat]}</option>
                    ))}
                  </Select>
                  <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted pointer-events-none" />
                </div>
                <p className="text-caption text-casa-muted mt-1.5">
                  {categoryLocked
                    ? 'Category locked — AI will not change it. Tap again to pick a different one.'
                    : 'Changing the category updates which fields are shown below.'}
                </p>
              </div>

              {/* ── Location ── */}
              <DisclosureSection
                title="Location"
                summary={location || address || 'No location'}
                icon={<MapPin size={18} />}
                defaultOpen={!location && !address}
              >
                {(location || address) && (
                  <FormSummaryCard
                    icon={<MapPin size={18} />}
                    title={location || 'Location'}
                    detail={address || 'No address'}
                    action={
                      <IconButton
                        icon={<X size={18} />}
                        aria-label="Clear location"
                        title="Clear location"
                        variant="ghost"
                        onClick={clearLocation}
                      />
                    }
                    className="mb-4"
                  />
                )}
                <div className="space-y-4">
                <div ref={locationRef} className="relative">
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                    <MapPin size={12} />
                    Location Name
                  </label>
                  <Input
                    type="text"
                    value={location}
                    onChange={e => { setLocation(e.target.value); setShowLocationSuggest(true); markDirty() }}
                    onFocus={() => setShowLocationSuggest(true)}
                    onBlur={() => setTimeout(() => setShowLocationSuggest(false), 150)}
                    placeholder="e.g. EDS Air Conditioning, Lincoln Park"
                  />
                  {showLocationSuggest && location.length > 0 && (() => {
                    const needle = location.toLowerCase()
                    const matches = savedPlaces.filter(p =>
                      [p.name, ...p.aliases, p.address ?? '', p.city ?? ''].some(s => s.toLowerCase().includes(needle))
                    ).slice(0, 5)
                    if (matches.length === 0) return null
                    return (
                      <ul className="absolute z-popover top-full left-0 right-0 mt-1 bg-casa-surface border border-casa-border rounded-card shadow-modal overflow-hidden">
                        {matches.map(p => {
                          const fullAddr = [p.address, p.city, p.state, p.zip].filter(Boolean).join(', ')
                          return (
                            <li key={p.id}>
                              <Button
                                type="button"
                                onMouseDown={() => {
                                  setLocation(p.name)
                                  if (fullAddr) setAddress(fullAddr)
                                  setShowLocationSuggest(false)
                                  markDirty()
                                }}
                                variant="ghost"
                                fullWidth
                                className="justify-start text-left"
                              >
                                <MapPin size={12} className="text-casa-gold shrink-0" />
                                <span>
                                  <span className="text-body font-semibold text-casa-navy">{p.name}</span>
                                  {fullAddr && <span className="text-caption text-casa-muted ml-1.5">{fullAddr}</span>}
                                </span>
                              </Button>
                            </li>
                          )
                        })}
                      </ul>
                    )
                  })()}
                  </div>
                <div>
                  <label className="flex items-center gap-1.5 text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                    <MapPin size={12} />
                    Address
                  </label>
                  <Input
                    type="text"
                    value={address}
                    onChange={e => { setAddress(e.target.value); markDirty() }}
                    placeholder="e.g. 3209 Washington Rd., West Palm Beach, FL"
                  />
                </div>
                </div>
              </DisclosureSection>

              {/* ── Category-specific enrichment fields ── */}
              <DisclosureSection
                title="Additional details"
                summary={`${CATEGORY_LABEL[category] ?? category} · ${fields.filter(field => form[field]?.trim()).length} completed`}
                defaultOpen={false}
              >
                <div className="space-y-5">
                {fields.map((field) => {
                  const config = FIELD_CONFIG[field]
                  return (
                    <div key={field}>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">
                        {config.label}
                      </label>
                      {config.multiline ? (
                        <Textarea
                          rows={field === 'what_to_bring' ? 5 : 3}
                          value={form[field] ?? ''}
                          onChange={e => set(field, e.target.value)}
                          placeholder={config.placeholder}
                        />
                      ) : (
                        <Input
                          type={config.type ?? 'text'}
                          value={form[field] ?? ''}
                          onChange={e => set(field, e.target.value)}
                          placeholder={config.placeholder}
                        />
                      )}
                    </div>
                  )
                })}

                </div>
              </DisclosureSection>
            </BounceScroll>

            {/* Footer removed — Save and Close are in the top bar */}
          </motion.div>

          <Modal
            open={showScopeModal}
            onClose={() => { setShowScopeModal(false); setPendingSave(false) }}
            title="Edit recurring event"
            size="md"
          >
            <p className="text-body-sm text-casa-muted mb-4">How would you like to apply your changes?</p>
            <div className="space-y-2">
              {([
                { scope: 'this', label: 'This event', desc: 'Only this occurrence will be updated' },
                { scope: 'future', label: 'This and following events', desc: 'This and all future occurrences' },
                { scope: 'all', label: 'All events', desc: 'Every occurrence in the series' },
              ] as { scope: RecurScope; label: string; desc: string }[]).map(({ scope, label, desc }) => (
                <Button key={scope} variant="secondary" fullWidth className="h-auto justify-start py-3 text-left" onClick={() => handleScopeChoice(scope)}>
                  <span>
                    <span className="block text-body-sm font-semibold">{label}</span>
                    <span className="mt-0.5 block text-caption text-casa-muted">{desc}</span>
                  </span>
                </Button>
              ))}
            </div>
            <Button variant="ghost" fullWidth className="mt-4" onClick={() => { setShowScopeModal(false); setPendingSave(false) }}>
              Cancel
            </Button>
          </Modal>
          <Modal
            open={showDeleteConfirm}
            onClose={() => setShowDeleteConfirm(false)}
            title="Delete this event?"
            size="sm"
          >
            <p className="text-body-sm text-casa-muted">This removes the event from Casa and its connected Google Calendar.</p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setShowDeleteConfirm(false)}>Cancel</Button>
              <Button variant="danger" loading={deleting} onClick={() => void handleDelete()}>Delete event</Button>
            </div>
          </Modal>
        </>
      )}
    </AnimatePresence>
  )
}
