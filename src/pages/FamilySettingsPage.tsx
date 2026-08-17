import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, GripVertical, Crown, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import { SettingsPageHeader } from '../components/settings'
import {
  Button,
  DisclosureSection,
  Field,
  Input,
  Modal,
  SegmentedControl,
  SkeletonRow,
  Switch,
} from '../components/ui'
import type {
  FamilyMember,
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'
import {
  FALLBACK_PROFILE_COLOR,
  getDisplayMemberColor,
  getMemberColorName,
  PROFILE_COLOR_OPTIONS,
} from '../design-system/memberColors'
import {
  deserializeHouseholdRhythm,
  serializeHouseholdRhythmToRule,
  getDailyOverrides,
  saveDailyOverrides,
  type HouseholdWeekdayRhythm,
  type DailyOverrides,
  HOUSEHOLD_RHYTHM_LOCALSTORAGE_KEY,
  createDefaultCasaTaborRhythm,
  createSchoolRoutine,
  createCampRoutine,
  deserializeRoutineFromAvailabilityRules,
  serializeRoutineToAvailabilityRules,
  type FamilyRoutine,
} from '../lib/familyRoutines'
import WeekdayRhythmHero from '../components/settings/family/WeekdayRhythmHero'
import SecurityAdminSection from '../components/settings/family/SecurityAdminSection'
import { format } from 'date-fns'

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
  const todayKey = format(new Date(), 'yyyy-MM-dd')

  const [activeTab, setActiveTab] = useState<'rhythm' | 'roster' | 'security'>('rhythm')

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: members = DEFAULT_CASA_TABOR_MEMBERS, isLoading: membersLoading } = useQuery<FamilyMember[]>({
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
        const { data, error } = await supabase.from('member_availability_rules').select('*')
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
        const { data, error } = await supabase.from('member_availability_exceptions').select('*')
        if (error) return []
        return data ?? []
      } catch {
        return []
      }
    },
    initialData: [],
    staleTime: 5 * 60_000,
  })

  // ── Local State & Drafts ──────────────────────────────────────────────────
  const [householdRhythm, setHouseholdRhythm] = useState<HouseholdWeekdayRhythm>(() => {
    return createDefaultCasaTaborRhythm(members)
  })

  const [dailyOverrides, setDailyOverrides] = useState<DailyOverrides>(() => {
    return getDailyOverrides(todayKey)
  })

  const [edits, setEdits] = useState<Record<string, EditableMember>>({})
  const [newMembers, setNewMembers] = useState<EditableMember[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [historyModalOpen, setHistoryModalOpen] = useState(false)
  const [historySetupMode, setHistorySetupMode] = useState<'unlock' | 'bootstrap'>('unlock')
  const [adminPin, setAdminPin] = useState('')
  const [bootstrapToken, setBootstrapToken] = useState('')
  const [adminSessionToken, setAdminSessionToken] = useState<string | null>(() => {
    try {
      return sessionStorage.getItem('casa_tabor_history_admin_session')
    } catch {
      return null
    }
  })
  const [memberPinDrafts, setMemberPinDrafts] = useState<Record<string, string>>({})
  const [historySavingMemberId, setHistorySavingMemberId] = useState<string | null>(null)
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [routineDrafts, setRoutineDrafts] = useState<Record<string, FamilyRoutine>>({})

  // Hydrate household rhythm from query when available
  useEffect(() => {
    if (availabilityRules.length > 0 || members.length > 0) {
      const resolved = deserializeHouseholdRhythm(availabilityRules, members)
      setHouseholdRhythm(resolved)
    }
  }, [availabilityRules, members])

  const formatRoleLabel = (role?: string | null) => {
    if (!role) return 'Child'
    if (role === 'caregiver') return 'Care Giver'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

  function getMember(m: FamilyMember): EditableMember {
    return { ...m, ...edits[m.id] }
  }

  function patch(id: string, changes: Partial<EditableMember>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...changes } }))
  }

  function patchNew(tempId: string, changes: Partial<EditableMember>) {
    setNewMembers((prev) => prev.map((m) => (m._tempId === tempId ? { ...m, ...changes } : m)))
  }

  function rulesForMember(memberId: string): MemberAvailabilityRule[] {
    return availabilityRules
      .filter((rule) => rule.member_id === memberId)
      .sort((a, b) => a.day_of_week - b.day_of_week || a.start_local.localeCompare(b.start_local))
  }

  function patchRoutine(memberId: string, changes: Partial<FamilyRoutine>) {
    setRoutineDrafts((prev) => {
      const memberRules = rulesForMember(memberId)
      const mem = members.find((x) => x.id === memberId)
      const base =
        prev[memberId] ??
        deserializeRoutineFromAvailabilityRules(memberId, memberRules) ??
        createSchoolRoutine(memberId, mem?.name)
      return {
        ...prev,
        [memberId]: { ...base, ...changes },
      }
    })
  }

  // ── Save Household Weekday Rhythm ─────────────────────────────────────────
  const handleUpdateRhythm = async (updated: HouseholdWeekdayRhythm) => {
    setHouseholdRhythm(updated)
    setSaving(true)
    setSaveError(null)

    // Save to local storage for immediate offline resilience
    try {
      localStorage.setItem(HOUSEHOLD_RHYTHM_LOCALSTORAGE_KEY, JSON.stringify(updated))
    } catch {}

    try {
      const adminMember = members.find((m) => m.is_admin) || members[0]
      const serialized = serializeHouseholdRhythmToRule(updated, adminMember?.id)

      const existingRule = availabilityRules.find((r) => {
        try {
          const p = JSON.parse(r.reason || '{}')
          return p.type === 'household_weekday_rhythm'
        } catch {
          return false
        }
      })

      if (existingRule) {
        const { error } = await supabase
          .from('member_availability_rules')
          .update({
            reason: serialized.reason,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existingRule.id)
        if (error) throw error
      } else if (adminMember) {
        const { error } = await supabase.from('member_availability_rules').insert(serialized)
        if (error) throw error
      }

      await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save rhythm')
    } finally {
      setSaving(false)
    }
  }

  // ── 1-Tap Daily Overrides Handlers ────────────────────────────────────────
  const handleToggleEmmeTransport = () => {
    const current = dailyOverrides.emmeTransportMode || householdRhythm.afternoonChain.emmeDefaultMode
    const next = current === 'bus' ? 'giselle_carpool' : 'bus'
    const updated = { ...dailyOverrides, emmeTransportMode: next as 'bus' | 'giselle_carpool' }
    setDailyOverrides(updated)
    saveDailyOverrides(todayKey, updated)
  }

  const handleToggleGiselleOff = () => {
    const updated = { ...dailyOverrides, giselleOffToday: !dailyOverrides.giselleOffToday }
    setDailyOverrides(updated)
    saveDailyOverrides(todayKey, updated)
  }

  const handleToggleKellyEarlyHome = () => {
    const updated = { ...dailyOverrides, kellyEarlyHome: !dailyOverrides.kellyEarlyHome }
    setDailyOverrides(updated)
    saveDailyOverrides(todayKey, updated)
  }

  // ── Security & Admin Operations ───────────────────────────────────────────
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

  async function saveRoutineForMember(memberId: string, routine: FamilyRoutine) {
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
      const { error } = await supabase.from('member_availability_rules').delete().in('id', existingRoutineRuleIds)
      if (error) throw error
    }

    if (routine.enabled && routine.daysOfWeek.length > 0) {
      const serialized = serializeRoutineToAvailabilityRules(routine)
      const { error } = await supabase.from('member_availability_rules').insert(serialized)
      if (error) throw error
    }

    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function applySchoolTemplate(memberId: string) {
    const mem = members.find((x) => x.id === memberId)
    const defaultRoutine = createSchoolRoutine(memberId, mem?.name)
    await saveRoutineForMember(memberId, defaultRoutine)
  }

  async function applyCampTemplate(memberId: string) {
    const defaultCamp = createCampRoutine(memberId)
    await saveRoutineForMember(memberId, defaultCamp)
  }

  async function upsertWorkRule(memberId: string, dayOfWeek: number, enabled: boolean, startLocal: string, endLocal: string) {
    const existing = rulesForMember(memberId).find((rule) => rule.day_of_week === dayOfWeek && rule.availability_type === 'unavailable')
    if (!enabled) {
      if (!existing) return
      const { error } = await supabase.from('member_availability_rules').delete().eq('id', existing.id)
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

    const { error } = await supabase.from('member_availability_rules').insert({
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
      const { error } = await supabase.from('member_availability_rules').delete().in('id', existing)
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
    const { error } = await supabase.from('member_availability_rules').insert(templateRows)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function clearAllWorkRules(memberId: string) {
    const memberRules = rulesForMember(memberId)
    if (memberRules.length === 0) return
    const { error } = await supabase.from('member_availability_rules').delete().eq('member_id', memberId)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-rules'] })
  }

  async function addDayOffException(memberId: string, dateValue: string, note?: string) {
    if (!dateValue) return
    const window = toDayOffWindow(dateValue)
    const { error } = await supabase.from('member_availability_exceptions').insert({
      member_id: memberId,
      start_at: window.start_at,
      end_at: window.end_at,
      override_type: 'day_off',
      note: note || 'Day off',
    })
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
  }

  async function removeAvailabilityException(exceptionId: string) {
    const { error } = await supabase.from('member_availability_exceptions').delete().eq('id', exceptionId)
    if (error) throw error
    await qc.invalidateQueries({ queryKey: ['member-availability-exceptions'] })
  }

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('family_members').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['family-members'] }),
  })

  async function handleSaveMembers() {
    if (saving) return
    setSaveError(null)
    setSaving(true)
    try {
      const updates = Object.entries(edits).map(([id, changes]) => {
        const base = members.find((m) => m.id === id)!
        const selectedColor = getDisplayMemberColor(changes.color_hex ?? base.color_hex)
        return supabase
          .from('family_members')
          .update({
            ...changes,
            color_hex: selectedColor,
            color_name: getMemberColorName(selectedColor),
            can_drive: changes.can_drive ?? base.can_drive,
            availability_mode: changes.availability_mode ?? base.availability_mode,
            show_on_home_sidebar: changes.show_on_home_sidebar ?? base.show_on_home_sidebar,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id)
      })

      const insertableNewMembers = newMembers.filter((m) => m.name?.trim())
      const draftNewMembers = newMembers.filter((m) => !m.name?.trim())
      const inserts = insertableNewMembers.map((m, i) => {
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
          availability_mode: m.availability_mode ?? (m.role === 'parent' ? 'flexible' : 'strict'),
          show_on_home_sidebar: m.show_on_home_sidebar ?? true,
          is_admin: m.is_admin ?? false,
          sort_order: members.length + i,
        })
      })

      await Promise.all([...updates, ...inserts])
      setEdits({})
      setNewMembers(draftNewMembers)
      await qc.invalidateQueries({ queryKey: ['family-members'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setSaveError((err as Error).message || 'Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  if (membersLoading && members.length === 0) {
    return (
      <div className="space-y-4">
        <SkeletonRow />
        <SkeletonRow />
        <SkeletonRow />
      </div>
    )
  }

  const allRows: EditableMember[] = [...members.map((m) => getMember(m)), ...newMembers]

  return (
    <div className="space-y-6">
      {/* Header with Save Feedback */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <SettingsPageHeader
            title="Family"
            description="Manage your household's weekday rhythm, roster, driving roles, and security."
          />
        </div>
        <div className="text-left sm:text-right">
          {saveError ? (
            <p className="text-caption text-casa-error font-medium">Save failed: {saveError}</p>
          ) : saving ? (
            <p className="text-caption text-casa-muted font-medium">Saving changes…</p>
          ) : saved ? (
            <p className="text-caption text-emerald-700 font-bold">✓ Saved</p>
          ) : null}
        </div>
      </div>

      {/* 3-Tab Sub-Navigation Segmented Control */}
      <SegmentedControl
        aria-label="Family Settings Section"
        value={activeTab}
        options={[
          { value: 'rhythm', label: 'Weekday Rhythm (Hero)' },
          { value: 'roster', label: `Family Roster (${members.length})` },
          { value: 'security', label: 'Security & Exceptions' },
        ]}
        onChange={(val) => setActiveTab(val as 'rhythm' | 'roster' | 'security')}
        fullWidth
      />

      {/* ── TAB 1: WEEKDAY RHYTHM HERO ────────────────────────────────────── */}
      {activeTab === 'rhythm' && (
        <WeekdayRhythmHero
          rhythm={householdRhythm}
          members={members}
          dailyOverrides={dailyOverrides}
          onUpdateRhythm={handleUpdateRhythm}
          onToggleEmmeTransport={handleToggleEmmeTransport}
          onToggleGiselleOff={handleToggleGiselleOff}
          onToggleKellyEarlyHome={handleToggleKellyEarlyHome}
        />
      )}

      {/* ── TAB 2: FAMILY ROSTER SECTION ─────────────────────────────────── */}
      {activeTab === 'roster' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-caption text-casa-muted">
              Tap any family member card to edit profile details, contact information, and role defaults.
            </p>
            {Object.keys(edits).length > 0 && (
              <Button variant="strong" size="sm" onClick={handleSaveMembers}>
                Save Roster Edits
              </Button>
            )}
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
                    <span
                      className="w-8 h-8 rounded-full shrink-0 border-2 border-white shadow-sm flex items-center justify-center text-white font-bold text-caption"
                      style={{ backgroundColor: colorHex }}
                    >
                      {m.name?.charAt(0) || '?'}
                    </span>
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
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Display Name</label>
                          <Input
                            type="text"
                            value={m.name ?? ''}
                            onChange={(e) => (isNew ? patchNew(m._tempId!, { name: e.target.value }) : patch(m.id!, { name: e.target.value }))}
                            placeholder="Jake"
                          />
                        </div>
                        <div>
                          <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Full Name</label>
                          <Input
                            type="text"
                            value={m.full_name ?? ''}
                            onChange={(e) => (isNew ? patchNew(m._tempId!, { full_name: e.target.value }) : patch(m.id!, { full_name: e.target.value }))}
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
                              can_drive: nextCanDrive ? m.can_drive ?? true : false,
                              availability_mode: value === 'parent' ? ('flexible' as const) : ('strict' as const),
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
                          {COLOR_OPTIONS.map((c) => (
                            <Button
                              key={c.hex}
                              onClick={() => (isNew ? patchNew(m._tempId!, { color_hex: c.hex, color_name: c.name }) : patch(m.id!, { color_hex: c.hex, color_name: c.name }))}
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
                      </div>

                      {/* Contact */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Phone</label>
                          <Input
                            type="tel"
                            value={m.phone ?? ''}
                            onChange={(e) => (isNew ? patchNew(m._tempId!, { phone: e.target.value }) : patch(m.id!, { phone: e.target.value }))}
                            placeholder="+1 555 000 0000"
                          />
                        </div>
                        <div>
                          <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Email</label>
                          <Input
                            type="email"
                            value={m.email ?? ''}
                            onChange={(e) => (isNew ? patchNew(m._tempId!, { email: e.target.value }) : patch(m.id!, { email: e.target.value }))}
                            placeholder="jake@example.com"
                          />
                        </div>
                      </div>

                      {/* Private conversation history */}
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

                      {/* Role-Specific Availability & Routines */}
                      {(() => {
                        const isChild = (m.role ?? 'child') === 'child'
                        const memberRules = m.id ? rulesForMember(m.id) : []

                        if (isChild) {
                          const baselineRoutine = m.id ? deserializeRoutineFromAvailabilityRules(m.id, memberRules) : null
                          const routine = m.id && routineDrafts[m.id] ? routineDrafts[m.id] : baselineRoutine
                          const currentRoutineType = !routine?.enabled ? 'paused' : routine.routineType || 'school'

                          return (
                            <div className="rounded-xl border border-casa-border p-4 space-y-4 bg-surface-subtle/50">
                              <div>
                                <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Home sidebar visibility</p>
                                <Switch
                                  label="Show on homepage sidebar"
                                  checked={m.show_on_home_sidebar ?? true}
                                  onCheckedChange={(show_on_home_sidebar) =>
                                    isNew ? patchNew(m._tempId!, { show_on_home_sidebar }) : patch(m.id!, { show_on_home_sidebar })
                                  }
                                />
                              </div>

                              {!isNew && m.id && (
                                <div className="pt-2 border-t border-casa-border/60 space-y-3">
                                  <div>
                                    <p className="text-caption font-semibold text-casa-navy uppercase tracking-wide">Recurring Schedule & Routine</p>
                                    <p className="text-caption text-casa-muted mt-0.5">
                                      Configures daily school or summer camp times with automatic morning drop-off & afternoon pick-up events.
                                    </p>
                                  </div>

                                  <div className="grid grid-cols-3 gap-2">
                                    <Button
                                      variant={currentRoutineType === 'school' ? 'strong' : 'secondary'}
                                      size="sm"
                                      onClick={() => {
                                        if (routine) {
                                          patchRoutine(m.id!, { title: 'School Routine', routineType: 'school', enabled: true })
                                        } else {
                                          void applySchoolTemplate(m.id!)
                                        }
                                      }}
                                      className="font-semibold text-caption"
                                    >
                                      School Year
                                    </Button>
                                    <Button
                                      variant={currentRoutineType === 'camp' ? 'strong' : 'secondary'}
                                      size="sm"
                                      onClick={() => {
                                        if (routine) {
                                          patchRoutine(m.id!, { title: 'Summer Camp', routineType: 'camp', enabled: true })
                                        } else {
                                          void applyCampTemplate(m.id!)
                                        }
                                      }}
                                      className="font-semibold text-caption"
                                    >
                                      Summer Camp
                                    </Button>
                                    <Button
                                      variant={currentRoutineType === 'paused' ? 'strong' : 'secondary'}
                                      size="sm"
                                      onClick={() => {
                                        if (routine) patchRoutine(m.id!, { ...routine, enabled: false })
                                      }}
                                      className="font-semibold text-caption"
                                    >
                                      On Break
                                    </Button>
                                  </div>

                                  {routine && routine.enabled && (
                                    <div className="space-y-3 pt-2">
                                      <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide">
                                        Day-Specific Adjustments (Optional)
                                      </span>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <Field label="School Year Start (Optional)">
                                          <Input
                                            type="date"
                                            value={routine.startDate || ''}
                                            onChange={(e) => patchRoutine(m.id!, { startDate: e.target.value || null })}
                                          />
                                        </Field>
                                        <Field label="School Year End (Optional)">
                                          <Input
                                            type="date"
                                            value={routine.endDate || ''}
                                            onChange={(e) => patchRoutine(m.id!, { endDate: e.target.value || null })}
                                          />
                                        </Field>
                                      </div>

                                      {/* Google Calendar Sync */}
                                      <div className="pt-2 border-t border-casa-border/40">
                                        <span className="text-caption font-semibold text-casa-muted uppercase tracking-wide block mb-1">
                                          Google & Skylight Calendar Sync
                                        </span>
                                        <div className="grid grid-cols-3 gap-2">
                                          <Button
                                            variant={routine.syncMode === 'exceptions_only' ? 'strong' : 'secondary'}
                                            size="sm"
                                            onClick={() => patchRoutine(m.id!, { syncMode: 'exceptions_only', syncToGoogle: true })}
                                          >
                                            Exceptions Only
                                          </Button>
                                          <Button
                                            variant={routine.syncMode === 'none' ? 'strong' : 'secondary'}
                                            size="sm"
                                            onClick={() => patchRoutine(m.id!, { syncMode: 'none', syncToGoogle: false })}
                                          >
                                            Casa Tabor Only
                                          </Button>
                                          <Button
                                            variant={routine.syncMode === 'all' ? 'strong' : 'secondary'}
                                            size="sm"
                                            onClick={() => patchRoutine(m.id!, { syncMode: 'all', syncToGoogle: true })}
                                          >
                                            Full Sync
                                          </Button>
                                        </div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        }

                        // Adult / Caregiver
                        return (
                          <div className="rounded-xl border border-casa-border p-4 space-y-4">
                            <div>
                              <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Driving</p>
                              <Switch
                                label="Can drive / cover transport"
                                checked={m.can_drive ?? false}
                                onCheckedChange={(can_drive) => (isNew ? patchNew(m._tempId!, { can_drive }) : patch(m.id!, { can_drive }))}
                              />
                            </div>

                            <div>
                              <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Home sidebar visibility</p>
                              <Switch
                                label="Show on homepage sidebar"
                                checked={m.show_on_home_sidebar ?? true}
                                onCheckedChange={(show_on_home_sidebar) =>
                                  isNew ? patchNew(m._tempId!, { show_on_home_sidebar }) : patch(m.id!, { show_on_home_sidebar })
                                }
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
                                    onClick={() => (isNew ? patchNew(m._tempId!, { availability_mode: option.value }) : patch(m.id!, { availability_mode: option.value }))}
                                    aria-pressed={(m.availability_mode ?? 'strict') === option.value}
                                  >
                                    <p className="text-body-sm font-semibold">{option.label}</p>
                                    <p className={cn('text-caption mt-0.5 leading-snug', (m.availability_mode ?? 'strict') === option.value ? 'text-white/80' : 'text-casa-muted')}>
                                      {option.helper}
                                    </p>
                                  </Button>
                                ))}
                              </div>
                            </div>

                            {!isNew && m.id && (
                              <div>
                                <div className="flex items-center justify-between gap-2 mb-2">
                                  <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Weekly work / blocked hours</p>
                                  <div className="flex items-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => { void applyWeekdayWorkTemplate(m.id!) }}>
                                      Apply M–F 7:30–6:30
                                    </Button>
                                    <Button variant="ghost" size="sm" onClick={() => { void clearAllWorkRules(m.id!) }} className="text-casa-error hover:bg-casa-error/10">
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
                                          onChange={(event) => void upsertWorkRule(m.id!, day, true, event.target.value, endLocal)}
                                          className="h-9 px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                        />
                                        <Input
                                          type="time"
                                          value={endLocal}
                                          disabled={!enabled}
                                          onChange={(event) => void upsertWorkRule(m.id!, day, true, startLocal, event.target.value)}
                                          className="h-9 px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                        />
                                      </div>
                                    )
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        )
                      })()}

                      {/* Admin Toggle */}
                      <Switch
                        label="Admin (default event owner, AI fallback)"
                        checked={m.is_admin ?? false}
                        onCheckedChange={(is_admin) => (isNew ? patchNew(m._tempId!, { is_admin }) : patch(m.id!, { is_admin }))}
                      />

                      {/* Delete */}
                      <div className="pt-2">
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
                            onClick={() => setNewMembers((prev) => prev.filter((x) => x._tempId !== m._tempId))}
                            className="flex items-center gap-2 text-body-sm text-casa-error hover:underline"
                          >
                            <Trash2 size={13} /> Discard
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )
            })}

            {/* Add member button */}
            <Button
              onClick={() => {
                const nm = emptyMember()
                setNewMembers((prev) => [...prev, nm])
                setExpandedId(nm._tempId!)
              }}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-card border-2 border-dashed border-casa-border text-casa-muted hover:border-casa-gold hover:text-casa-gold transition-all text-body-sm font-medium"
            >
              <Plus size={16} /> Add Family Member
            </Button>
          </div>
        </div>
      )}

      {/* ── TAB 3: SECURITY & ADMIN SECTION ──────────────────────────────── */}
      {activeTab === 'security' && (
        <SecurityAdminSection
          members={members}
          exceptions={availabilityExceptions}
          adminSessionToken={adminSessionToken}
          onUnlockAdmin={unlockAdmin}
          onBootstrapAdmin={bootstrapAdmin}
          onSetMemberPin={saveMemberPin}
          onAddException={addDayOffException}
          onRemoveException={removeAvailabilityException}
        />
      )}

      {/* Admin Unlock Modal */}
      <Modal
        open={historyModalOpen}
        onClose={() => setHistoryModalOpen(false)}
        title="Household Private-History Admin"
        size="sm"
      >
        <form
          className="space-y-4 pt-5"
          onSubmit={(event) => {
            event.preventDefault()
            setHistoryError(null)
            void (historySetupMode === 'bootstrap' ? bootstrapAdmin() : unlockAdmin()).catch((error) =>
              setHistoryError(error instanceof Error ? error.message : 'Household admin access could not be unlocked.'),
            )
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
          <Button type="submit" variant="strong" fullWidth>
            {historySetupMode === 'bootstrap' ? 'Set household admin PIN' : 'Unlock admin access'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
