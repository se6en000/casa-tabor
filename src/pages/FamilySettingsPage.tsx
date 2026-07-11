import { useEffect, useRef, useState } from 'react'
import { Plus, Trash2, GripVertical, Crown } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type {
  FamilyMember,
  MemberAvailabilityException,
  MemberAvailabilityRule,
} from '../types'
import { Button, SegmentedControl, SkeletonRow, Switch } from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import {
  FALLBACK_PROFILE_COLOR,
  getDisplayMemberColor,
  getMemberColorName,
  PROFILE_COLOR_OPTIONS,
} from '../design-system/memberColors'

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

export default function FamilySettingsPage() {
  const qc = useQueryClient()
  const { data: members = [], isLoading } = useQuery<FamilyMember[]>({
    queryKey: ['family-members'],
    queryFn: async () => {
      const { data, error } = await supabase.from('family_members').select('*').order('sort_order')
      if (error) throw error
      return data
    },
  })
  const { data: availabilityRules = [] } = useQuery<MemberAvailabilityRule[]>({
    queryKey: ['member-availability-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_availability_rules')
        .select('*')
      if (error) throw error
      return data ?? []
    },
  })
  const { data: availabilityExceptions = [] } = useQuery<MemberAvailabilityException[]>({
    queryKey: ['member-availability-exceptions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('member_availability_exceptions')
        .select('*')
      if (error) throw error
      return data ?? []
    },
  })

  const [edits, setEdits] = useState<Record<string, EditableMember>>({})
  const [newMembers, setNewMembers] = useState<EditableMember[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [dayOffDraftByMember, setDayOffDraftByMember] = useState<Record<string, string>>({})
  const hydratedRef = useRef(false)
  const formatRoleLabel = (role?: string | null) => {
    if (!role) return 'Child'
    if (role === 'caregiver') return 'Care Giver'
    return role.charAt(0).toUpperCase() + role.slice(1)
  }

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

  if (isLoading) return <div className="space-y-4"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>

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
          const memberRules = m.id ? rulesForMember(m.id) : []
          const memberExceptions = m.id ? exceptionsForMember(m.id) : []
          const dayOffDraft = dayOffDraftByMember[id] ?? ''

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
                      <input
                        type="text"
                        value={m.name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { name: e.target.value }) : patch(m.id!, { name: e.target.value })}
                        placeholder="Jake"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Full Name</label>
                      <input
                        type="text"
                        value={m.full_name ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { full_name: e.target.value }) : patch(m.id!, { full_name: e.target.value })}
                        placeholder="Jacob Tabor"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
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
                      <input
                        type="tel"
                        value={m.phone ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { phone: e.target.value }) : patch(m.id!, { phone: e.target.value })}
                        placeholder="+1 555 000 0000"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                    <div>
                      <label className="block text-caption font-semibold text-casa-muted uppercase tracking-wide mb-1">Email</label>
                      <input
                        type="email"
                        value={m.email ?? ''}
                        onChange={e => isNew ? patchNew(m._tempId!, { email: e.target.value }) : patch(m.id!, { email: e.target.value })}
                        placeholder="jake@example.com"
                        className="w-full px-3 py-2 rounded-button border border-casa-border text-body-sm text-casa-navy bg-white focus:outline-none focus:ring-2 focus:ring-casa-navy/20"
                      />
                    </div>
                  </div>

                  {/* Driving + availability */}
                  <div className="rounded-xl border border-casa-border p-3 space-y-3">
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
                        <span className="text-body-sm text-casa-navy">Can drive / cover transport</span>
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

                    <>
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
                                <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide">Weekly blocked hours</p>
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
                                      <input
                                        type="time"
                                        value={startLocal}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                          const nextStart = event.target.value
                                          void upsertWorkRule(m.id!, day, true, nextStart, endLocal)
                                        }}
                                        className="h-9 rounded-button border border-casa-border px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                      />
                                      <input
                                        type="time"
                                        value={endLocal}
                                        disabled={!enabled}
                                        onChange={(event) => {
                                          const nextEnd = event.target.value
                                          void upsertWorkRule(m.id!, day, true, startLocal, nextEnd)
                                        }}
                                        className="h-9 rounded-button border border-casa-border px-2 text-body-sm text-casa-navy disabled:opacity-50"
                                      />
                                    </div>
                                  )
                                })}
                              </div>
                            </div>

                            <div>
                              <p className="text-caption font-semibold text-casa-muted uppercase tracking-wide mb-2">Day-off overrides</p>
                              <div className="flex items-center gap-2">
                                <input
                                  type="date"
                                  value={dayOffDraft}
                                  onChange={(event) => setDayOffDraftByMember((prev) => ({ ...prev, [id]: event.target.value }))}
                                  className="h-9 rounded-button border border-casa-border px-2 text-body-sm text-casa-navy"
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

                        {isNew && (
                          <p className="text-caption text-casa-muted">
                            Save this member first to configure recurring blocked hours and day-off overrides.
                          </p>
                        )}
                    </>
                  </div>

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
    </>
  )
}
