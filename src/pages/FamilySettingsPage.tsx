import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, GripVertical, Crown, ShieldCheck } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type {
  FamilyMember,
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'
import { Button, DisclosureSection, Field, Input, Modal, SegmentedControl, SkeletonRow, Switch } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import {
  FALLBACK_PROFILE_COLOR,
  getDisplayMemberColor,
  getMemberColorName,
  PROFILE_COLOR_OPTIONS,
} from '../design-system/memberColors'
import {
  deserializeRoutineFromAvailabilityRules,
  serializeRoutineToAvailabilityRules,
  syncMemberRoutineExceptions,
  type FamilyRoutine,
  type DayScheduleOverride,
  createSchoolRoutine,
  createCampRoutine,
} from '../lib/familyRoutines'
import SmartPlaceInput from '../components/calendar/SmartPlaceInput'

const COLOR_OPTIONS = PROFILE_COLOR_OPTIONS

const ROLE_OPTIONS = [
  { value: 'parent', label: 'Parent' },
  { value: 'child', label: 'Child' },
  { value: 'caregiver', label: 'Care Giver' },
] as const

const AVAILABILITY_MODE_OPTIONS: Array<{ value: 'strict' | 'flexible' | 'open'; label: string; helper: string }> = [
  { value: 'strict', label: 'Strict', helper: 'Unavailable during blocked hours' },
  { value: 'flexible', label: 'Flexible', helper: 'Prefer avoiding blocked hours, still considered available' },
  { value: 'open', label: 'Open', helper: 'Ignores blocked hours' },
]

const WEEKDAY_ROWS = [
  { day: 1, label: 'Mon' },
  { day: 2, label: 'Tue' },
  { day: 3, label: 'Wed' },
  { day: 4, label: 'Thu' },
  { day: 5, label: 'Fri' },
  { day: 6, label: 'Sat' },
  { day: 0, label: 'Sun' },
] as const

type EditableMember = Partial<FamilyMember> & { _tempId?: string; _isNew?: boolean }

function emptyMember(): EditableMember {
  return {
    _tempId: Math.random().toString(36).slice(2),
    _isNew: true,
    name: '',
    full_name: '',
    role: 'child',
    color_hex: COLOR_OPTIONS[Math.floor(Math.random() * COLOR_OPTIONS.length)].hex,
    color_name: '',
    phone: '',
    email: '',
    can_drive: false,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: false,
    sort_order: 999,
  }
}

function toDayOffWindow(dateValue: string): { start_at: string; end_at: string } {
  const start = new Date(`${dateValue}T00:00:00`)
  const end = new Date(`${dateValue}T23:59:59`)
  return { start_at: start.toISOString(), end_at: end.toISOString() }
}

function formatExceptionWindow(exception: MemberAvailabilityException): string {
  const start = new Date(exception.start_at)
  const end = new Date(exception.end_at)
  const dateLabel = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  const startTime = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const endTime = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return `${dateLabel} · ${startTime}–${endTime}`
}

export const DEFAULT_CASA_TABOR_MEMBERS: FamilyMember[] = [
  {
    id: 'member-jake',
    name: 'Jake',
    full_name: 'Jacob Tabor',
    role: 'parent',
    color_hex: PROFILE_COLOR_OPTIONS[0].hex,
    color_name: 'Navy',
    phone: '+1 (561) 555-0101',
    email: 'jake@casatabor.com',
    google_calendar_id: null,
    can_drive: true,
    availability_mode: 'flexible',
    show_on_home_sidebar: true,
    is_admin: true,
    avatar_url: null,
    sort_order: 0,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-kelly',
    name: 'Kelly',
    full_name: 'Kelly Tabor',
    role: 'parent',
    color_hex: PROFILE_COLOR_OPTIONS[2].hex,
    color_name: 'Forest',
    phone: '+1 (561) 555-0102',
    email: 'kelly@casatabor.com',
    google_calendar_id: null,
    can_drive: true,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: true,
    avatar_url: null,
    sort_order: 1,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-olivia',
    name: 'Olivia',
    full_name: 'Olivia Tabor',
    role: 'child',
    color_hex: PROFILE_COLOR_OPTIONS[3].hex,
    color_name: 'Purple',
    phone: null,
    email: null,
    google_calendar_id: null,
    can_drive: false,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: false,
    avatar_url: null,
    sort_order: 2,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-owen',
    name: 'Owen',
    full_name: 'Owen Tabor',
    role: 'child',
    color_hex: PROFILE_COLOR_OPTIONS[4].hex,
    color_name: 'Blue',
    phone: null,
    email: null,
    google_calendar_id: null,
    can_drive: false,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: false,
    avatar_url: null,
    sort_order: 3,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-emme',
    name: 'Emme',
    full_name: 'Emme Tabor',
    role: 'child',
    color_hex: PROFILE_COLOR_OPTIONS[1].hex,
    color_name: 'Gold',
    phone: null,
    email: null,
    google_calendar_id: null,
    can_drive: false,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: false,
    avatar_url: null,
    sort_order: 4,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'member-giselle',
    name: 'Giselle',
    full_name: 'Giselle (Nanny / Driver)',
    role: 'caregiver',
    color_hex: PROFILE_COLOR_OPTIONS[8].hex,
    color_name: 'Slate',
    phone: '+1 (561) 555-0109',
    email: 'giselle@casatabor.com',
    google_calendar_id: null,
    can_drive: true,
    availability_mode: 'strict',
    show_on_home_sidebar: true,
    is_admin: false,
    avatar_url: null,
    sort_order: 5,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

export default function FamilySettingsPage() {
  const qc = useQueryClient()
  const { data: members = DEFAULT_CASA_TABOR_MEMBERS, isLoading } = useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase.from('family_members').select('*').order('sort_order')
        if (error || !data || data.length === 0) return DEFAULT_CASA_TABOR_MEMBERS
        return data
      } catch {
        return DEFAULT_CASA_TABOR_MEMBERS
      }
    },
    initialData: DEFAULT_CASA_TABOR_MEMBERS,
    staleTime: 5 * 60_000,
  })
  const { data: availabilityRules = [] } = useQuery<MemberAvailabilityRule[]>({
    queryKey: ['member-availability-rules'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('member_availability_rules')
          .select('*')
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    },
    initialData: [],
    staleTime: 5 * 60_000,
  })
  const { data: availabilityExceptions = [] } = useQuery<MemberAvailabilityException[]>({
    queryKey: ['member-availability-exceptions'],
    queryFn: async () => {
      try {
        const { data, error } = await supabase
          .from('member_availability_exceptions')
          .select('*')
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    },
    initialData: [],
    staleTime: 5 * 60_000,
  })

  const [edits, setEdits] = useState<Record<string, EditableMember>>({})
  const [newMembers, setNewMembers] = useState<EditableMember[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dayOffDraftByMember, setDayOffDraftByMember] = useState<Record<string, string>>({})
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historySetupMode, setHistorySetupMode] = useState<'unlock' | 'bootstrap'>('unlock')
  const [adminPin, setAdminPin] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(() => {
    try { return sessionStorage.getItem('casa_tabor_history_admin_session') } catch { return null }
  })
  const [memberPinDrafts, setMemberPinDrafts] = useState<Record<string, string>>({})
  const [historySavingMemberId, setHistorySavingMemberId] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [routineDrafts, setRoutineDrafts] = useState<Record<string, FamilyRoutine>>({})
  const hydratedRef = useRef(false)
  const formatRoleLabel = (role?: string | null) => {
    if (!role) return 'Child'
    if (role === 'caregiver') return 'Care Giver'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  function getEffectiveRoutineForMember(memberId: string, memberName?: string | null): FamilyRoutine {
    if (routineDrafts[memberId]) return routineDrafts[memberId]
    const memberRules = rulesForMember(memberId)
    const fromRules = deserializeRoutineFromAvailabilityRules(memberId, memberRules)
    if (fromRules) return fromRules

    try {
      const cached = localStorage.getItem(`casa_tabor_member_routine_${memberId}`)
      if (cached) {
        const parsed = JSON.parse(cached)
        if (parsed && typeof parsed === 'object' && parsed.title) return parsed
      }
    } catch {}

    return createSchoolRoutine(memberId, memberName || undefined)
  }

  function patchRoutine(memberId: string, changes: Partial<FamilyRoutine>) {
    const mem = members.find((x) => x.id === memberId)
    const current = getEffectiveRoutineForMember(memberId, mem?.name)
    const updated: FamilyRoutine = { ...current, ...changes }
    setRoutineDrafts((prev) => ({
      ...prev,
      [memberId]: updated,
    }))
    try {
      localStorage.setItem(`casa_tabor_member_routine_${memberId}`, JSON.stringify(updated))
    } catch {}
  }

  useEffect(() => {
    const pendingRoutineEntries = Object.entries(routineDrafts)
    if (pendingRoutineEntries.length === 0) return
    setSaved(false)
    const timer = setTimeout(async () => {
      for (const [memberId, r] of pendingRoutineEntries) {
        await saveRoutineForMember(memberId, r)
      }
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }, 600)
    return () => clearTimeout(timer)
  }, [routineDrafts])

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_members').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family-members'] }),
  })

  function getMember(m: FamilyMember): EditableMember {
    return { ...m, ...edits[m.id] }
  }

  function patch(id: string, changes: Partial<EditableMember>) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], ...changes } }))
  }

  function patchNew(tempId: string, changes: Partial<EditableMember>) {
    setNewMembers(prev => prev.map(m => m._tempId === tempId ? { ...m, ...changes } : m))
  }

  function rulesForMember(memberId: string): MemberAvailabilityRule[] {
    return availabilityRules
      .filter((rule) => rule.member_id === memberId)
      .sort((a, b) => (a.day_of_week - b.day_of_week) || a.start_local.localeCompare(b.start_local))
  }

  function exceptionsForMember(memberId: string): MemberAvailabilityException[] {
    return availabilityExceptions
      .filter((exception) => exception.member_id === memberId)
      .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime())
  }

  async function invokeHistory(body: Record<string, unknown>, sessionToken?: string) {
    const { data, error } = await supabase.functions.invoke('assistant-history', {
      body,
      headers: sessionToken ? { 'x-casa-history-session': sessionToken } : undefined,
    })
    if (error) throw error
    if (data?.error) throw new Error(String(data.error))
    return data as Record<string, unknown>
  }

  async function unlockAdmin() {
    setHistoryError(null)
    const data = await invokeHistory({ action: 'unlock_admin', pin: adminPin })
    const token = typeof data.history_session_token === 'string' ? data.history_session_token : ''
    if (!token) throw new Error('Household admin access could not be unlocked.')
    sessionStorage.setItem('casa_tabor_history_admin_session', token)
    setAdminSessionToken(token)
    setAdminPin('')
    setHistoryModalOpen(false)
  }

  async function bootstrapAdmin() {
    setHistoryError(null)
    await invokeHistory({ action: 'setup_admin', bootstrap_token: bootstrapToken, pin: adminPin })
    await unlockAdmin()
    setBootstrapToken('')
  }

  async function saveMemberPin(memberId: string) {
    const pin = memberPinDrafts[memberId] ?? ''
    if (!adminSessionToken) {
      setHistoryModalOpen(true)
      return
    }
    setHistorySavingMemberId(memberId)
    setHistoryError(null)
    try {
      await invokeHistory({ action: 'set_member_pin', member_id: memberId, pin }, adminSessionToken)
      setMemberPinDrafts((current) => ({ ...current, [memberId]: '' }))
    } catch (error) {
      setHistoryError(error instanceof Error ? error.message : 'The member PIN could not be saved.')
    } finally {
      setHistorySavingMemberId(null)
    }
  }

  async function upsertWorkRule(memberId: string, dayOfWeek: number, enabled: boolean, startLocal: string, endLocal: string) {
    const existing = rulesForMember(memberId).find((rule) => rule.day_of_week === dayOfWeek && rule.availability_type === 'unavailable')
    if (!enabled) {
      if (!existing) return
      const { error } = await supabase
        .from('member_availability_rules')
        .delete()
        .eq('id', existing.id)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
      return
    }

    if (existing) {
      const { error } = await supabase
        .from('member_availability_rules')
        .update({
          start_local: startLocal,
          end_local: endLocal,
          reason: 'Blocked hours',
          timezone: 'America/New_York',
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
      if (error) throw error
      await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
      return
    }

    const { error } = await supabase
      .from('member_availability_rules')
      .insert({
        member_id: memberId,
        day_of_week: dayOfWeek,
        start_local: startLocal,
        end_local: endLocal,
        availability_type: 'unavailable',
        reason: 'Blocked hours',
        timezone: 'America/New_York',
      })
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function applyWeekdayWorkTemplate(memberId: string) {
    const existing = rulesForMember(memberId)
      .filter((rule) => rule.availability_type === 'unavailable')
      .map((rule) => rule.id)
    if (existing.length > 0) {
      const { error } = await supabase
        .from('member_availability_rules')
        .delete()
        .in('id', existing)
      if (error) throw error
    }

    const templateRows = [1, 2, 3, 4, 5].map((day) => ({
      member_id: memberId,
      day_of_week: day,
      start_local: '07:30',
      end_local: '18:30',
      availability_type: 'unavailable' as const,
      reason: 'Blocked hours',
      timezone: 'America/New_York',
    }))
    const { error } = await supabase
      .from('member_availability_rules')
      .insert(templateRows)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function clearAllWorkRules(memberId: string) {
    const memberRules = rulesForMember(memberId)
    if (memberRules.length === 0) return
    const { error } = await supabase
      .from('member_availability_rules')
      .delete()
      .eq('member_id', memberId)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function addDayOffException(memberId: string, dateValue: string) {
    if (!dateValue) return
    const window = toDayOffWindow(dateValue)
    const { error } = await supabase
      .from('member_availability_exceptions')
      .insert({
        member_id: memberId,
        start_at: window.start_at,
        end_at: window.end_at,
        override_type: 'day_off',
        note: 'Day off',
      })
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
    setDayOffDraftByMember((prev) => ({ ...prev, [memberId]: '' }))
  }

  async function removeAvailabilityException(exceptionId: string) {
    const { error } = await supabase
      .from('member_availability_exceptions')
      .delete()
      .eq('id', exceptionId)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
  }

  async function saveRoutineForMember(memberId: string, routine: FamilyRoutine) {
    try {
      localStorage.setItem(`casa_tabor_member_routine_${memberId}`, JSON.stringify(routine))
    } catch {}

    const serialized = routine.enabled && routine.daysOfWeek.length > 0
      ? serializeRoutineToAvailabilityRules(routine)
      : []

    try {
      const memberRules = rulesForMember(memberId)
      const existingRoutineRuleIds = memberRules
        .filter((r) => {
          try {
            const parsed = JSON.parse(r.reason || '')
            return parsed.type === 'school_routine'
          } catch {
            return false
          }
        })
        .map((r) => r.id)

      if (existingRoutineRuleIds.length > 0) {
        await supabase
          .from('member_availability_rules')
          .delete()
          .in('id', existingRoutineRuleIds)
      }

      if (serialized.length > 0) {
        await supabase
          .from('member_availability_rules')
          .insert(serialized)

        void syncMemberRoutineExceptions(supabase, memberId, routine, members)
      }
    } catch (err) {
      console.warn('Could not sync routine to remote Supabase:', err)
    }

    qc.setQueryData<MemberAvailabilityRule[]>(['member-availability-rules'], (old = []) => {
      const filtered = old.filter((r) => {
        if (r.member_id !== memberId) return true
        try {
          const parsed = JSON.parse(r.reason || '')
          return parsed.type !== 'school_routine'
        } catch {
          return true
        }
      })
      const newRulesWithIds: MemberAvailabilityRule[] = serialized.map((s, i) => ({
        ...s,
        id: `local-rule-${memberId}-${s.day_of_week}-${i}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }))
      return [...filtered, ...newRulesWithIds]
    })
  }

  async function applySchoolTemplate(memberId: string) {
    const mem = members.find(x => x.id === memberId)
    const defaultRoutine = createSchoolRoutine(memberId, mem?.name)
    defaultRoutine.enabled = true
    patchRoutine(memberId, defaultRoutine)
    await saveRoutineForMember(memberId, defaultRoutine)
  }

  async function applyCampTemplate(memberId: string) {
    const defaultCamp = createCampRoutine(memberId)
    defaultCamp.enabled = true
    patchRoutine(memberId, defaultCamp)
    await saveRoutineForMember(memberId, defaultCamp)
  }

  async function handleSave() {
    if (saving) return
    setSaveError(null)
    setSaving(true)
    try {
      // Update existing members that have edits
      const updates = Object.entries(edits).map(([id, changes]) => {
        const base = members.find(m => m.id === id)!
        const selectedColor = getDisplayMemberColor(changes.color_hex ?? base.color_hex)
        return supabase.from('family_members').update({
          ...changes,
          color_hex: selectedColor,
          color_name: getMemberColorName(selectedColor),
          can_drive: changes.can_drive ?? base.can_drive,
          availability_mode: changes.availability_mode ?? base.availability_mode,
          show_on_home_sidebar: changes.show_on_home_sidebar ?? base.show_on_home_sidebar,
          updated_at: new Date().toISOString(),
        }).eq('id', id)
      })

      // Insert only complete new members; keep incomplete drafts in-place.
      const insertableNewMembers = newMembers.filter(m => m.name?.trim())
      const draftNewMembers = newMembers.filter(m => !m.name?.trim())
      const inserts = insertableNewMembers
        .map((m, i) => {
          const selectedColor = getDisplayMemberColor(m.color_hex)
          return supabase.from('family_members').insert({
            name: m.name!.trim(),
            full_name: m.full_name?.trim() || null,
            role: m.role ?? 'child',
            color_hex: selectedColor,
            color_name: getMemberColorName(selectedColor),
            phone: m.phone?.trim() || null,
            email: m.email?.trim() || null,
            can_drive: m.can_drive ?? (m.role === 'parent' || m.role === 'caregiver'),
            availability_mode: m.availability_mode ?? (m.role === 'parent' ? 'flexible' : m.role === 'caregiver' ? 'strict' : 'strict'),
            show_on_home_sidebar: m.show_on_home_sidebar ?? true,
            is_admin: m.is_admin ?? false,
            sort_order: members.length + i,
          })
        })

      await Promise.all([...updates, ...inserts])
      setEdits({})
      setNewMembers(draftNewMembers)
      qc.invalidateQueries({ queryKey: ['family-members'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }
    const hasPendingChanges = Object.keys(edits).length > 0 || newMembers.length > 0
    if (!hasPendingChanges) return
    setSaved(false)
    const t = setTimeout(() => {
      handleSave()
    }, 700)
    return () => clearTimeout(t)
  }, [edits, newMembers])

  const hasChanges = Object.keys(edits).length > 0 || newMembers.length > 0

  if (isLoading && members.length === 0) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

  const allRows: EditableMember[] = [
    ...members.map(m => getMember(m)),
    ...newMembers,
  ]

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <SettingsPageHeader title="Family" description="Manage members, colors, roles, driving, and blocked-hour availability." />
        </div>
        <div className="text-right">
          {saveError ? (
            <p className="text-caption text-casa-error">Save failed: {saveError}</p>
          ) : saving ? (
            <p className="text-caption text-casa-muted">Saving…</p>
          ) : saved ? (
            <p className="text-caption text-emerald-700">✓ Saved</p>
          ) : hasChanges ? (
            <p className="text-caption text-casa-muted">Saving shortly…</p>
          ) : null}
        </div>
      </div>

      <div className="space-y-3">
        {allRows.map((m) => {
          const id = m.id ?? m._tempId!
          const isNew = !!m._isNew
          const isExpanded = expandedId === id
          const colorHex = getDisplayMemberColor(m.color_hex ?? FALLBACK_PROFILE_COLOR)

          return (
            <div key={id} className="bg-casa-surface rounded-card border border-casa-border shadow-card overflow-hidden">
              {/* Row header — tap to expand */}
              <Button
                variant="subtle"
                fullWidth
                align="start"
                contentClassName="gap-3"
                className={cn(
                  'rounded-none border-0 p-4 shadow-none',
                  isExpanded ? 'bg-surface-subtle' : 'bg-surface-inset',
                )}
                onClick={() => setExpandedId(isExpanded ? null : id)}
                aria-expanded={isExpanded}
              >
                <GripVertical size={16} className="text-casa-muted shrink-0" />
                {/* Color swatch */}
                <span
                  className="w-8 h-8 rounded-full shrink-0 border-2 border-white shadow-sm"
                  style={{ backgroundColor: colorHex }}
                />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-body-sm text-casa-navy leading-none">
                    {m.name || <span className="text-casa-muted italic">New member</span>}
                    {m.is_admin && <Crown size={12} className="inline ml-1.5 text-casa-gold" />}
                  </p>
                  <p className="text-caption text-casa-muted mt-0.5">
                    {formatRoleLabel(m.role)}
                    {` · ${m.availability_mode ?? 'strict'} schedule`}
                    {' · '}
                    {m.phone || m.email || 'No contact'}
                  </p>
                </div>
                <span className="text-caption text-casa-muted">{isExpanded ? '▲' : '▼'}</span>
              </Button>

              {/* Expanded editor */}
              {isExpanded && (
                <div className="border-t border-casa-divider px-4 pb-4 space-y-4 pt-4">
                  {/* Name row */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Display Name</label>
                      <Input
                        type="text"
                        value={m.name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { name: e.target.value }) : patch(m.id!, { name: e.target.value })}
                        placeholder="Jake"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Full Name</label>
                      <Input
                        type="text"
                        value={m.full_name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { full_name: e.target.value }) : patch(m.id!, { full_name: e.target.value })}
                        placeholder="Jacob Tabor"
                      />
                    </div>
                  </div>

                  {/* Role */}
                  <div>
                    <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Role</label>
                    <SegmentedControl
                      aria-label={`${m.name || 'Family member'} role`}
                      value={m.role ?? 'child'}
                      options={ROLE_OPTIONS}
                      onChange={(value) => {
                        const nextCanDrive = value === 'parent' || value === 'caregiver'
                        const changes = {
                          role: value,
                          can_drive: nextCanDrive ? (m.can_drive ?? true) : false,
                          availability_mode: value === 'parent' ? 'flexible' as const : 'strict' as const,
                        }
                        if (isNew) patchNew(m._tempId!, changes)
                        else patch(m.id!, changes)
                      }}
                      fullWidth
                    />
                  </div>

                  {/* Color picker */}
                  <div>
                    <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Color</label>
                    <div className="flex flex-wrap gap-2">
                      {COLOR_OPTIONS.map(c => (
                        <Button
                          key={c.hex}
                          onClick={() => isNew ? patchNew(m._tempId!, { color_hex: c.hex, color_name: c.name }) : patch(m.id!, { color_hex: c.hex, color_name: c.name })}
                          className={cn(
                            'size-control rounded-button border-2 outline-none transition-all focus-visible:ring-2 focus-visible:ring-casa-gold',
                            colorHex === c.hex ? 'border-casa-navy scale-110 shadow-md' : 'border-transparent hover:scale-105',
                          )}
                          style={{ backgroundColor: c.hex }}
                          title={c.name}
                          aria-label={`Use ${c.name} color`}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-caption text-casa-muted">
                      Red/orange hues are reserved for alerts to reduce confusion.
                    </p>
                  </div>

                  {/* Contact */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Phone</label>
                      <Input
                        type="tel"
                        value={m.phone ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { phone: e.target.value }) : patch(m.id!, { phone: e.target.value })}
                        placeholder="+1 555 000 0000"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Email</label>
                      <Input
                        type="email"
                        value={m.email ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { email: e.target.value }) : patch(m.id!, { email: e.target.value })}
                        placeholder="jake@example.com"
                      />
                    </div>
                  </div>

                  {!isNew && m.id && (
                    <DisclosureSection
                      title="Private conversation history"
                      summary={adminSessionToken ? 'Set or change this member’s private-history PIN' : 'Unlock household admin access to enroll or change a PIN'}
                      icon={<ShieldCheck size={18} />}
                      className="rounded-card border border-casa-border"
                    >
                      <div className="space-y-3 pt-1">
                        <p className="text-body-sm text-casa-muted">
                          Conversations stay private to {m.name || 'this member'}, are retained for 90 days, and never become household memory or Daily Brief content.
                        </p>
                        {adminSessionToken ? (
                          <>
                            <Field label="New PIN" hint="Use 6 to 12 digits. Saving immediately replaces the prior PIN and locks existing sessions.">
                              <Input
                                type="password"
                                inputMode="numeric"
                                autoComplete="new-password"
                                pattern="[0-9]{6,12}"
                                value={memberPinDrafts[m.id] ?? ''}
                                onChange={(event) => setMemberPinDrafts((current) => ({ ...current, [m.id!]: event.target.value }))}
                                placeholder="6 to 12 digits"
                              />
                            </Field>
                            <Button
                              variant="secondary"
                              fullWidth
                              disabled={historySavingMemberId === m.id || !(memberPinDrafts[m.id] ?? '')}
                              onClick={() => { void saveMemberPin(m.id!) }}
                            >
                              {historySavingMemberId === m.id ? 'Saving PIN…' : 'Set or change PIN'}
                            </Button>
                          </>
                        ) : (
                          <Button variant="secondary" fullWidth onClick={() => setHistoryModalOpen(true)}>
                            Unlock household admin access
                          </Button>
                        )}
                      </div>
                    </DisclosureSection>
                  )}

                  {/* Driving & Availability Section (Adaptive by Role) */}
                  {(() => {
                    const isChild = (m.role ?? 'child') === 'child'
                    const memberRules = m.id ? rulesForMember(m.id) : []
                    const memberExceptions = m.id ? exceptionsForMember(m.id) : []
                    const dayOffDraft = dayOffDraftByMember[id] ?? ''
                    const availableDrivers = members.filter(mem => mem.can_drive || mem.role === 'parent' || mem.role === 'caregiver')

                    if (isChild) {
                      const routine = getEffectiveRoutineForMember(m.id!, m.name)
                      const currentRoutineType = !routine?.enabled ? 'paused' : (routine.routineType || 'school')

                      return (
                        <div className="rounded-xl border border-casa-border p-4 space-y-4 bg-surface-subtle/50">
                          {/* Home sidebar visibility */}
                          <div>
                            <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Home sidebar visibility</p>
                            <Switch
                              label="Show on homepage sidebar"
                              checked={m.show_on_home_sidebar ?? true}
                              onCheckedChange={(show_on_home_sidebar) => isNew
                                ? patchNew(m._tempId!, { show_on_home_sidebar })
                                : patch(m.id!, { show_on_home_sidebar })}
                            />
                          </div>

                          {!isNew && m.id && (
                            <>
                              {/* Consolidated Child Routine Card */}
                              <div className="pt-2 border-t border-casa-border/60 space-y-3">
                                <div>
                                  <p className="text-caption font-semibold text-casa-navy uppercase tracking-wide">Recurring Schedule & Routine</p>
                                  <p className="text-caption text-casa-muted mt-0.5">
                                    Configures daily school or summer camp times with automatic morning drop-off & afternoon pick-up events.
                                  </p>
                                </div>

                                {/* Routine Presets: School Year vs Summer Camp vs Paused */}
                                <div className="grid grid-cols-3 gap-2">
                                  <Button
                                    variant={currentRoutineType === 'school' ? 'strong' : 'secondary'}
                                    size="sm"
                                    onClick={() => {
                                      const isOwen = m.name?.toLowerCase().includes('owen')
                                      const defaultSchool = isOwen ? 'Palm Beach Public Elementary School' : 'Bak Middle School of the Arts'
                                      const defaultAddress = isOwen ? '239 Cocoanut Row, Palm Beach, FL 33480' : '1725 Echo Lake Dr, West Palm Beach, FL'
                                      const defaultStart = isOwen ? '08:15' : '08:00'
                                      const defaultEnd = isOwen ? '15:00' : '15:30'
                                      const isCampVenue = (routine?.venueName || '').toLowerCase().includes('camp')

                                      patchRoutine(m.id!, {
                                        title: 'School Routine',
                                        routineType: 'school',
                                        venueName: isCampVenue || !routine?.venueName ? defaultSchool : routine.venueName,
                                        venueAddress: isCampVenue || !routine?.venueAddress ? defaultAddress : routine.venueAddress,
                                        startLocal: routine?.startLocal || defaultStart,
                                        endLocal: routine?.endLocal || defaultEnd,
                                        enabled: true,
                                      })
                                    }}
                                    className="font-semibold text-caption"
                                  >
                                    School Year
                                  </Button>
                                  <Button
                                    variant={currentRoutineType === 'camp' ? 'strong' : 'secondary'}
                                    size="sm"
                                    onClick={() => {
                                      const isSchoolVenue = (routine?.venueName || '').toLowerCase().includes('school') || (routine?.venueName || '').toLowerCase().includes('bak')
                                      patchRoutine(m.id!, {
                                        title: 'Summer Camp',
                                        routineType: 'camp',
                                        venueName: isSchoolVenue || !routine?.venueName ? 'Summer Day Camp' : routine.venueName,
                                        venueAddress: isSchoolVenue || !routine?.venueAddress ? '1200 Lake Pavilion Way, West Palm Beach, FL' : routine.venueAddress,
                                        startLocal: routine?.startLocal || '09:00',
                                        endLocal: routine?.endLocal || '16:00',
                                        enabled: true,
                                      })
                                    }}
                                    className="font-semibold text-caption"
                                  >
                                    Summer Camp
                                  </Button>
                                  <Button
                                    variant={currentRoutineType === 'paused' ? 'strong' : 'secondary'}
                                    size="sm"
                                    onClick={() => {
                                      patchRoutine(m.id!, { enabled: false })
                                    }}
                                    className="font-semibold text-caption"
                                  >
                                    On Break
                                  </Button>
                                </div>

                                {routine && routine.enabled ? (
                                  <div className="rounded-xl border border-casa-border p-3.5 bg-white space-y-3 shadow-2xs">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">
                                          {currentRoutineType === 'camp' ? 'Camp / Program' : 'School / Venue'}
                                        </label>
                                        <SmartPlaceInput
                                          field="name"
                                          label={currentRoutineType === 'camp' ? 'Camp / Program' : 'School / Venue'}
                                          placeholder={currentRoutineType === 'camp' ? 'Summer Day Camp' : 'Search saved school (e.g. Palm Beach Public)…'}
                                          value={{ name: routine.venueName || '', address: routine.venueAddress || '' }}
                                          onChange={(place) => {
                                            patchRoutine(m.id!, {
                                              venueName: place.name,
                                              venueAddress: place.address || (place.name ? routine.venueAddress : ''),
                                            })
                                          }}
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Address</label>
                                        <SmartPlaceInput
                                          field="address"
                                          label="Address"
                                          placeholder="1725 Echo Lake Dr or 239 Cocoanut Row…"
                                          value={{ name: routine.venueName || '', address: routine.venueAddress || '' }}
                                          onChange={(place) => {
                                            patchRoutine(m.id!, {
                                              venueName: place.name || routine.venueName,
                                              venueAddress: place.address,
                                            })
                                          }}
                                        />
                                      </div>
                                    </div>

                                    {/* Days & Hours */}
                                    <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-center pt-1">
                                      <div className="flex flex-wrap gap-1">
                                        {WEEKDAY_ROWS.map(({ day, label }) => {
                                          const isDayActive = routine.daysOfWeek.includes(day)
                                          return (
                                            <Button
                                              key={day}
                                              variant={isDayActive ? 'strong' : 'secondary'}
                                              size="sm"
                                              className="h-8 px-2 text-caption font-bold"
                                              onClick={() => {
                                                const nextDays = isDayActive
                                                  ? routine.daysOfWeek.filter(d => d !== day)
                                                  : [...routine.daysOfWeek, day].sort()
                                                patchRoutine(m.id!, { daysOfWeek: nextDays })
                                              }}
                                            >
                                              {label}
                                            </Button>
                                          )
                                        })}
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-caption text-casa-muted font-bold">Start:</span>
                                        <Input
                                          type="time"
                                          value={routine.startLocal}
                                          onChange={(e) => {
                                            patchRoutine(m.id!, { startLocal: e.target.value })
                                          }}
                                          className="h-8 px-2 text-body-sm w-28 text-casa-navy"
                                        />
                                      </div>
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-caption text-casa-muted font-bold">End:</span>
                                        <Input
                                          type="time"
                                          value={routine.endLocal}
                                          onChange={(e) => {
                                            patchRoutine(m.id!, { endLocal: e.target.value })
                                          }}
                                          className="h-8 px-2 text-body-sm w-28 text-casa-navy"
                                        />
                                      </div>
                                    </div>

                                    {/* Drivers */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1 border-t border-casa-border/40">
                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Morning Drop-Off Driver</label>
                                        <select
                                          value={routine.dropoffDriverName}
                                          onChange={(e) => {
                                            const driverName = e.target.value
                                            const driverMember = availableDrivers.find(d => d.name === driverName)
                                            patchRoutine(m.id!, {
                                              dropoffDriverName: driverName,
                                              dropoffDriverId: driverMember?.id || null,
                                            })
                                          }}
                                          className="w-full h-9 px-2.5 rounded-lg border border-casa-border bg-white text-body-sm text-casa-navy font-semibold focus:outline-none focus:ring-2 focus:ring-casa-gold"
                                        >
                                          {availableDrivers.map((drv) => (
                                            <option key={drv.id} value={drv.name}>{drv.name} (Driver)</option>
                                          ))}
                                          <option value="Carpool">Carpool / Bus</option>
                                          <option value="None">None</option>
                                        </select>
                                      </div>

                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Afternoon Pick-Up Driver</label>
                                        <select
                                          value={routine.pickupDriverName}
                                          onChange={(e) => {
                                            const driverName = e.target.value
                                            const driverMember = availableDrivers.find(d => d.name === driverName)
                                            patchRoutine(m.id!, {
                                              pickupDriverName: driverName,
                                              pickupDriverId: driverMember?.id || null,
                                            })
                                          }}
                                          className="w-full h-9 px-2.5 rounded-lg border border-casa-border bg-white text-body-sm text-casa-navy font-semibold focus:outline-none focus:ring-2 focus:ring-casa-gold"
                                        >
                                          {availableDrivers.map((drv) => (
                                            <option key={drv.id} value={drv.name}>{drv.name} (Driver)</option>
                                          ))}
                                          <option value="Grandma">Grandma</option>
                                          <option value="Carpool">Carpool / Bus</option>
                                          <option value="None">None</option>
                                        </select>
                                      </div>
                                    </div>

                                    {/* Day-Specific Schedule Adjustments */}
                                    <div className="pt-2.5 border-t border-casa-border/40 space-y-2">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">
                                            Day-Specific Adjustments (Optional)
                                          </span>
                                          <p className="text-caption text-casa-muted">
                                            Early strings drop-offs, late clubs, early release days, or different drivers.
                                          </p>
                                        </div>
                                      </div>

                                      {/* Active Overrides */}
                                      {(routine.dayOverrides || []).length > 0 && (
                                        <div className="space-y-2">
                                          {(routine.dayOverrides || []).map((override, oIdx) => {
                                            const dayNames = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
                                            const dayLabel = dayNames[override.dayOfWeek] || `Day ${override.dayOfWeek}`

                                            return (
                                              <div key={override.dayOfWeek} className="p-2.5 rounded-lg border border-casa-border bg-casa-warm/40 space-y-2">
                                                <div className="flex items-center justify-between">
                                                  <span className="text-body-sm font-bold text-casa-navy">
                                                    {dayLabel}
                                                  </span>
                                                  <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => {
                                                      const updated = (routine.dayOverrides || []).filter((_, i) => i !== oIdx)
                                                      patchRoutine(m.id!, { dayOverrides: updated })
                                                    }}
                                                    className="h-6 px-2 text-caption text-red-500 hover:text-red-700 font-semibold"
                                                  >
                                                    Remove
                                                  </Button>
                                                </div>

                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                  <div>
                                                    <label className="block text-caption font-bold text-casa-muted uppercase">Start Time</label>
                                                    <Input
                                                      type="time"
                                                      value={override.startLocal || routine.startLocal}
                                                      onChange={(e) => {
                                                        const updated = [...(routine.dayOverrides || [])]
                                                        updated[oIdx] = { ...updated[oIdx], startLocal: e.target.value }
                                                        patchRoutine(m.id!, { dayOverrides: updated })
                                                      }}
                                                      className="h-8 px-1.5 text-body-sm text-casa-navy"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-caption font-bold text-casa-muted uppercase">End Time</label>
                                                    <Input
                                                      type="time"
                                                      value={override.endLocal || routine.endLocal}
                                                      onChange={(e) => {
                                                        const updated = [...(routine.dayOverrides || [])]
                                                        updated[oIdx] = { ...updated[oIdx], endLocal: e.target.value }
                                                        patchRoutine(m.id!, { dayOverrides: updated })
                                                      }}
                                                      className="h-8 px-1.5 text-body-sm text-casa-navy"
                                                    />
                                                  </div>
                                                  <div>
                                                    <label className="block text-caption font-bold text-casa-muted uppercase">AM Driver</label>
                                                    <select
                                                      value={override.dropoffDriverName || routine.dropoffDriverName}
                                                      onChange={(e) => {
                                                        const drv = availableDrivers.find(d => d.name === e.target.value)
                                                        const updated = [...(routine.dayOverrides || [])]
                                                        updated[oIdx] = {
                                                          ...updated[oIdx],
                                                          dropoffDriverName: e.target.value,
                                                          dropoffDriverId: drv?.id || null,
                                                        }
                                                        patchRoutine(m.id!, { dayOverrides: updated })
                                                      }}
                                                      className="w-full h-8 px-1.5 rounded border border-casa-border bg-white text-body-sm text-casa-navy font-semibold"
                                                    >
                                                      {availableDrivers.map((drv) => (
                                                        <option key={drv.id} value={drv.name}>{drv.name}</option>
                                                      ))}
                                                      <option value="Carpool">Carpool</option>
                                                      <option value="None">None</option>
                                                    </select>
                                                  </div>
                                                  <div>
                                                    <label className="block text-caption font-bold text-casa-muted uppercase">PM Driver</label>
                                                    <select
                                                      value={override.pickupDriverName || routine.pickupDriverName}
                                                      onChange={(e) => {
                                                        const drv = availableDrivers.find(d => d.name === e.target.value)
                                                        const updated = [...(routine.dayOverrides || [])]
                                                        updated[oIdx] = {
                                                          ...updated[oIdx],
                                                          pickupDriverName: e.target.value,
                                                          pickupDriverId: drv?.id || null,
                                                        }
                                                        patchRoutine(m.id!, { dayOverrides: updated })
                                                      }}
                                                      className="w-full h-8 px-1.5 rounded border border-casa-border bg-white text-body-sm text-casa-navy font-semibold"
                                                    >
                                                      {availableDrivers.map((drv) => (
                                                        <option key={drv.id} value={drv.name}>{drv.name}</option>
                                                      ))}
                                                      <option value="Grandma">Grandma</option>
                                                      <option value="Carpool">Carpool</option>
                                                      <option value="None">None</option>
                                                    </select>
                                                  </div>
                                                </div>
                                                <div>
                                                  <label className="block text-caption font-bold text-casa-muted uppercase">Schedule Note / Reason (Optional)</label>
                                                  <Input
                                                    type="text"
                                                    placeholder="e.g. Early Strings Orchestra, Half Day, Robotics Club…"
                                                    value={override.label || ''}
                                                    onChange={(e) => {
                                                      const updated = [...(routine.dayOverrides || [])]
                                                      updated[oIdx] = { ...updated[oIdx], label: e.target.value }
                                                      patchRoutine(m.id!, { dayOverrides: updated })
                                                    }}
                                                    className="h-8 px-2 text-body-sm text-casa-navy w-full"
                                                  />
                                                </div>
                                              </div>
                                            )
                                          })}
                                        </div>
                                      )}

                                      {/* Quick Day Adder */}
                                      <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                        <span className="text-caption font-semibold text-casa-muted">+ Customize Day:</span>
                                        {[
                                          { day: 1, label: 'Mon' },
                                          { day: 2, label: 'Tue' },
                                          { day: 3, label: 'Wed' },
                                          { day: 4, label: 'Thu' },
                                          { day: 5, label: 'Fri' },
                                        ]
                                          .filter((d) => !(routine.dayOverrides || []).some((o) => o.dayOfWeek === d.day))
                                          .map((d) => (
                                            <Button
                                              key={d.day}
                                              type="button"
                                              variant="secondary"
                                              size="sm"
                                              onClick={() => {
                                                const newOverride: DayScheduleOverride = {
                                                  dayOfWeek: d.day,
                                                  startLocal: routine.startLocal,
                                                  endLocal: routine.endLocal,
                                                  dropoffDriverName: routine.dropoffDriverName,
                                                  dropoffDriverId: routine.dropoffDriverId || null,
                                                  pickupDriverName: routine.pickupDriverName,
                                                  pickupDriverId: routine.pickupDriverId || null,
                                                  enabled: true,
                                                }
                                                patchRoutine(m.id!, {
                                                  dayOverrides: [...(routine.dayOverrides || []), newOverride],
                                                })
                                              }}
                                              className="h-7 px-2.5 text-caption font-semibold"
                                            >
                                              + {d.label}
                                            </Button>
                                          ))}
                                      </div>
                                    </div>

                                    {/* Google & Skylight Calendar Sync */}
                                    <div className="pt-2.5 border-t border-casa-border/40 space-y-2">
                                      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                                        <div>
                                          <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">
                                            Google & Skylight Calendar Sync
                                          </span>
                                          <p className="text-caption text-casa-muted">
                                            Controls how school drop-off & pick-up times appear on Google Calendar and Skylight hardware.
                                          </p>
                                        </div>
                                      </div>
                                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                                        <Button
                                          variant={(routine.syncMode === 'exceptions_only' || (!routine.syncMode && routine.syncToGoogle !== false)) ? 'strong' : 'secondary'}
                                          align="start"
                                          contentClassName="flex flex-col items-start w-full text-left"
                                          className={cn(
                                            'h-auto p-3 rounded-lg border transition-all text-left justify-start',
                                            (routine.syncMode === 'exceptions_only' || (!routine.syncMode && routine.syncToGoogle !== false))
                                              ? 'border-casa-gold bg-casa-gold/10 text-casa-navy ring-1 ring-casa-gold'
                                              : 'border-casa-border bg-white text-casa-muted hover:border-casa-navy/30'
                                          )}
                                          onClick={() => patchRoutine(m.id!, { syncMode: 'exceptions_only', syncToGoogle: true })}
                                        >
                                          <div className="flex items-center justify-between w-full mb-1">
                                            <span className="text-body-sm font-bold text-casa-navy">Exceptions Only</span>
                                            <span className="text-caption uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-casa-gold/20 text-casa-navy">
                                              Recommended
                                            </span>
                                          </div>
                                          <p className="text-caption text-casa-muted leading-tight font-normal">
                                            Only syncs unusual days (e.g. Early Strings, half days). Prevents Skylight wall scrolling.
                                          </p>
                                        </Button>

                                        <Button
                                          variant={routine.syncMode === 'none' || routine.syncToGoogle === false ? 'strong' : 'secondary'}
                                          align="start"
                                          contentClassName="flex flex-col items-start w-full text-left"
                                          className={cn(
                                            'h-auto p-3 rounded-lg border transition-all text-left justify-start',
                                            routine.syncMode === 'none' || routine.syncToGoogle === false
                                              ? 'border-casa-navy bg-casa-navy/5 text-casa-navy ring-1 ring-casa-navy'
                                              : 'border-casa-border bg-white text-casa-muted hover:border-casa-navy/30'
                                          )}
                                          onClick={() => patchRoutine(m.id!, { syncMode: 'none', syncToGoogle: false })}
                                        >
                                          <div className="flex items-center justify-between w-full mb-1">
                                            <span className="text-body-sm font-bold text-casa-navy">Casa Tabor Only</span>
                                            <span className="text-caption uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-casa-warm text-casa-muted">
                                              Off
                                            </span>
                                          </div>
                                          <p className="text-caption text-casa-muted leading-tight font-normal">
                                            Keeps external calendars 100% clean. Shows only in Casa Tabor ambient headers.
                                          </p>
                                        </Button>

                                        <Button
                                          variant={routine.syncMode === 'all' ? 'strong' : 'secondary'}
                                          align="start"
                                          contentClassName="flex flex-col items-start w-full text-left"
                                          className={cn(
                                            'h-auto p-3 rounded-lg border transition-all text-left justify-start',
                                            routine.syncMode === 'all'
                                              ? 'border-casa-navy bg-casa-navy/5 text-casa-navy ring-1 ring-casa-navy'
                                              : 'border-casa-border bg-white text-casa-muted hover:border-casa-navy/30'
                                          )}
                                          onClick={() => patchRoutine(m.id!, { syncMode: 'all', syncToGoogle: true })}
                                        >
                                          <div className="flex items-center justify-between w-full mb-1">
                                            <span className="text-body-sm font-bold text-casa-navy">Full Sync</span>
                                            <span className="text-caption uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-casa-warm text-casa-muted">
                                              Daily
                                            </span>
                                          </div>
                                          <p className="text-caption text-casa-muted leading-tight font-normal">
                                            Syncs every daily morning drop-off & afternoon pick-up event (2x/day per child).
                                          </p>
                                        </Button>
                                      </div>
                                    </div>

                                    {/* Season / School Year Date Range */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-casa-border/40">
                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">
                                          {currentRoutineType === 'camp' ? 'Camp Start Date (Optional)' : 'School Year Start (Optional)'}
                                        </label>
                                        <Input
                                          type="date"
                                          value={routine.startDate || ''}
                                          onChange={(e) => {
                                            patchRoutine(m.id!, { startDate: e.target.value || null })
                                          }}
                                          className="h-9 px-2 text-body-sm text-casa-navy"
                                        />
                                      </div>
                                      <div>
                                        <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">
                                          {currentRoutineType === 'camp' ? 'Camp End Date (Optional)' : 'School Year End (Optional)'}
                                        </label>
                                        <Input
                                          type="date"
                                          value={routine.endDate || ''}
                                          onChange={(e) => {
                                            patchRoutine(m.id!, { endDate: e.target.value || null })
                                          }}
                                          className="h-9 px-2 text-body-sm text-casa-navy"
                                        />
                                      </div>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="rounded-xl border border-dashed border-casa-border p-4 text-center bg-white">
                                    <p className="text-body-sm text-casa-muted mb-2">
                                      {routine ? 'Routine is currently paused (e.g. for summer vacation or school break).' : 'No weekly routine configured.'}
                                    </p>
                                    <div className="flex items-center justify-center gap-2">
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => { void applySchoolTemplate(m.id!) }}
                                      >
                                        + Set Up School Routine
                                      </Button>
                                      <Button
                                        variant="secondary"
                                        size="sm"
                                        onClick={() => { void applyCampTemplate(m.id!) }}
                                      >
                                        + Set Up Summer Camp
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Day-Off Overrides for Child */}
                              <div className="pt-2 border-t border-casa-border/60">
                                <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Day-off & holiday overrides</p>
                                <div className="flex items-center gap-2">
                                  <Input
                                    type="date"
                                    value={dayOffDraft}
                                    onChange={(event) => setDayOffDraftByMember((prev) => ({ ...prev, [id]: event.target.value }))}
                                    className="h-9 px-2 text-body-sm text-casa-navy"
                                  />
                                  <Button
                                    type="button"
                                    onClick={() => { void addDayOffException(m.id!, dayOffDraft) }}
                                    disabled={!dayOffDraft}
                                    className="h-9 px-3 rounded-button border border-casa-border text-body-sm font-medium text-casa-navy disabled:opacity-50"
                                  >
                                    Add day off
                                  </Button>
                                </div>
                                <div className="mt-2 space-y-1.5">
                                  {memberExceptions.length === 0 && (
                                    <p className="text-caption text-casa-muted">No day-off overrides set.</p>
                                  )}
                                  {memberExceptions.map((exception) => (
                                    <div key={exception.id} className="flex items-center justify-between gap-2 rounded-button border border-casa-border px-2.5 py-2 bg-white">
                                      <div>
                                        <p className="text-body-sm text-casa-navy font-medium">{exception.override_type.replace('_', ' ')}</p>
                                        <p className="text-caption text-casa-muted">{formatExceptionWindow(exception)}</p>
                                      </div>
                                      <Button
                                        type="button"
                                        onClick={() => { void removeAvailabilityException(exception.id) }}
                                        className="text-caption text-casa-error hover:underline"
                                      >
                                        Remove
                                      </Button>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      )
                    }

                    // Adult / Parent View
                    return (
                      <div className="rounded-xl border border-casa-border p-4 space-y-4">
                        <div>
                          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Driving</p>
                          <label className="flex items-center gap-3 cursor-pointer">
                            <div
                              onClick={() => isNew ? patchNew(m._tempId!, { can_drive: !m.can_drive }) : patch(m.id!, { can_drive: !m.can_drive })}
                              className={cn(
                                'relative w-10 h-5 rounded-full transition-colors shrink-0',
                                m.can_drive ? 'bg-casa-gold' : 'bg-casa-border',
                              )}
                            >
                              <span className={cn(
                                'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                                m.can_drive ? 'translate-x-5' : 'translate-x-0.5',
                              )} />
                            </div>
                            <span className="text-body-sm text-casa-navy font-medium">Can drive / cover transport</span>
                          </label>
                        </div>

                        <div>
                          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Home sidebar visibility</p>
                          <Switch
                            label="Show on homepage sidebar"
                            checked={m.show_on_home_sidebar ?? true}
                            onCheckedChange={(show_on_home_sidebar) => isNew
                              ? patchNew(m._tempId!, { show_on_home_sidebar })
                              : patch(m.id!, { show_on_home_sidebar })}
                          />
                        </div>

                        <div>
                          <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Availability mode</p>
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                            {AVAILABILITY_MODE_OPTIONS.map((option) => (
                              <Button
                                key={option.value}
                                variant={(m.availability_mode ?? 'strict') === option.value ? 'strong' : 'secondary'}
                                align="start"
                                contentClassName="flex-col items-start gap-0.5"
                                onClick={() => isNew
                                  ? patchNew(m._tempId!, { availability_mode: option.value })
                                  : patch(m.id!, { availability_mode: option.value })}
                                aria-pressed={(m.availability_mode ?? 'strict') === option.value}
                              >
                                <p className="text-body-sm font-semibold">{option.label}</p>
                                <p className={cn(
                                  'text-caption mt-0.5 leading-snug',
                                  (m.availability_mode ?? 'strict') === option.value ? 'text-white/80' : 'text-casa-muted',
                                )}
                                >
                                  {option.helper}
                                </p>
                              </Button>
                            ))}
                          </div>
                        </div>

                        {!isNew && m.id && (
                          <>
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Weekly work / blocked hours</p>
                                <div className="flex items-center gap-2">
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => { void applyWeekdayWorkTemplate(m.id!) }}
                                  >
                                    Apply M–F 7:30–6:30
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => { void clearAllWorkRules(m.id!) }}
                                    className="text-casa-error hover:bg-casa-error/10"
                                  >
                                    Clear
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-1.5">
                                {WEEKDAY_ROWS.map(({ day, label }) => {
                                  const dayRule = memberRules.find((rule) => rule.day_of_week === day && rule.availability_type === 'unavailable')
                                  const enabled = Boolean(dayRule)
                                  const startLocal = dayRule?.start_local?.slice(0, 5) ?? '07:30'
                                  const endLocal = dayRule?.end_local?.slice(0, 5) ?? '18:30'
                                  return (
                                    <div key={day} className="grid grid-cols-[56px_1fr_1fr] gap-2 items-center">
                                      <Button
                                        variant={enabled ? 'strong' : 'secondary'}
                                        size="sm"
                                        onClick={() => { void upsertWorkRule(m.id!, day, !enabled, startLocal, endLocal) }}
                                        aria-pressed={enabled}
                                      >
                                        {label}
                                      </Button>
                                      <Input
                                        type="time"
                                        value={startLocal}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                          const nextStart = event.target.value
                                          void upsertWorkRule(m.id!, day, true, nextStart, endLocal)
                                        }}
                                        className="h-9 px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                      />
                                      <Input
                                        type="time"
                                        value={endLocal}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                          const nextEnd = event.target.value
                                          void upsertWorkRule(m.id!, day, true, startLocal, nextEnd)
                                        }}
                                        className="h-9 px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Day-off overrides</p>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="date"
                                  value={dayOffDraft}
                                  onChange={(event) => setDayOffDraftByMember((prev) => ({ ...prev, [id]: event.target.value }))}
                                  className="h-9 px-2 text-body-sm text-casa-navy"
                                />
                                <Button
                                  type="button"
                                  onClick={() => { void addDayOffException(m.id!, dayOffDraft) }}
                                  disabled={!dayOffDraft}
                                  className="h-9 px-3 rounded-button border border-casa-border text-body-sm font-medium text-casa-navy disabled:opacity-50"
                                >
                                  Add day off
                                </Button>
                              </div>
                              <div className="mt-2 space-y-1.5">
                                {memberExceptions.length === 0 && (
                                  <p className="text-caption text-casa-muted">No day-off overrides set.</p>
                                )}
                                {memberExceptions.map((exception) => (
                                  <div key={exception.id} className="flex items-center justify-between gap-2 rounded-button border border-casa-border px-2.5 py-2">
                                    <div>
                                      <p className="text-body-sm text-casa-navy font-medium">{exception.override_type.replace('_', ' ')}</p>
                                      <p className="text-caption text-casa-muted">{formatExceptionWindow(exception)}</p>
                                    </div>
                                    <Button
                                      type="button"
                                      onClick={() => { void removeAvailabilityException(exception.id) }}
                                      className="text-caption text-casa-error hover:underline"
                                    >
                                      Remove
                                    </Button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}

                  {/* Admin toggle */}
                  <label className="flex items-center gap-3 cursor-pointer">
                    <div
                      onClick={() => isNew ? patchNew(m._tempId!, { is_admin: !m.is_admin }) : patch(m.id!, { is_admin: !m.is_admin })}
                      className={cn(
                        'relative w-10 h-5 rounded-full transition-colors shrink-0',
                        m.is_admin ? 'bg-casa-gold' : 'bg-casa-border',
                      )}
                    >
                      <span className={cn(
                        'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform',
                        m.is_admin ? 'translate-x-5' : 'translate-x-0.5',
                      )} />
                    </div>
                    <span className="text-body-sm text-casa-navy">
                      Admin <span className="text-casa-muted">(default event owner, AI fallback)</span>
                    </span>
                  </label>

                  {/* Delete */}
                  {!isNew && (
                    <Button
                      onClick={() => {
                        if (confirm(`Remove ${m.name} from the family?`)) {
                          deleteMutation.mutate(m.id!)
                          setExpandedId(null)
                        }
                      }}
                      className="flex items-center gap-2 text-body-sm text-casa-error hover:underline"
                    >
                      <Trash2 size={13} /> Remove {m.name}
                    </Button>
                  )}
                  {isNew && (
                    <Button
                      onClick={() => setNewMembers(prev => prev.filter(x => x._tempId !== m._tempId))}
                      className="flex items-center gap-2 text-body-sm text-casa-error hover:underline"
                    >
                      <Trash2 size={13} /> Discard
                    </Button>
                  )}
                </div>
              )}
            </div>
          )
        })}

        {/* Add member */}
        <Button
          onClick={() => {
            const nm = emptyMember()
            setNewMembers(prev => [...prev, nm])
            setExpandedId(nm._tempId!)
          }}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-card border-2 border-dashed border-casa-border text-casa-muted hover:border-casa-gold hover:text-casa-gold transition-all text-body-sm font-medium"
        >
          <Plus size={16} /> Add Family Member
        </Button>
      </div>
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Household private-history admin"
        size="sm"
      >
        <form
          className="space-y-4 pt-5"
          onSubmit={(event) => {
            event.preventDefault()
            setHistoryError(null)
            void (historySetupMode === 'bootstrap' ? bootstrapAdmin() : unlockAdmin())
              .catch((error) => setHistoryError(error instanceof Error ? error.message : 'Household admin access could not be unlocked.'))
          }}
        >
          <p className="text-body-sm text-casa-muted">
            Admin access only enrolls or resets family PINs. It cannot open anyone’s private conversations.
          </p>
          <SegmentedControl
            aria-label="Private-history admin action"
            value={historySetupMode}
            options={[
              { value: 'unlock', label: 'Unlock admin' },
              { value: 'bootstrap', label: 'First setup' },
            ]}
            onChange={setHistorySetupMode}
            fullWidth
          />
          {historySetupMode === 'bootstrap' && (
            <Field label="Secure setup token" hint="The server-provisioned one-time token for initial household setup.">
              <Input
                type="password"
                autoComplete="off"
                value={bootstrapToken}
                onChange={(event) => setBootstrapToken(event.target.value)}
                required
              />
            </Field>
          )}
          <Field label="Household admin PIN" error={historyError}>
            <Input
              type="password"
              inputMode="numeric"
              autoComplete={historySetupMode === 'bootstrap' ? 'new-password' : 'current-password'}
              pattern="[0-9]{6,12}"
              value={adminPin}
              onChange={(event) => setAdminPin(event.target.value)}
              placeholder="6 to 12 digits"
              required
            />
          </Field>
          <Button type="submit" fullWidth>
            {historySetupMode === 'bootstrap' ? 'Set household admin PIN' : 'Unlock admin access'}
          </Button>
        </form>
      </Modal>
    </>
  )
}
