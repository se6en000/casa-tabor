/**
 * GoogleServicesPage
 *
 * High-density, touch-optimized Google Services & Calendar management.
 * - Complies with kiosk-ux-refactor design system (>=48px touch targets, zero raw emojis, fluid rem scaling)
 * - Interactive Google Calendar target selector (supports dedicated 'Casa Tabor' calendar)
 * - Single universal "Sync all services" header action
 * - Compact connected account cards with inline status and Switch toggle
 * - Safe confirmation dialog on disconnect
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar, Mail, Check,
  RefreshCw, Unlink, AlertCircle, Layers,
  ChevronRight, ShieldCheck,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Button, Chip, ConfirmationDialog, Modal,
  Switch, Checkbox,
} from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { FamilyMember } from '../types'
import { FALLBACK_PROFILE_COLOR } from '../design-system/memberColors'
import { useGoogleCalendarList, useSelectGoogleCalendar } from '../hooks/useCalendarConnections'

// ── Types ─────────────────────────────────────────────────────────

interface GoogleStatus {
  family_member_id: string
  google_email: string
  connected_at: string
  last_sync_at: string | null
  last_sync_error: string | null
  gmail_scan_enabled: boolean
  connection_id: string | null
  calendar_id: string | null
  access_mode: 'writable' | 'read_only' | null
  adoption_policy: 'automatic' | 'explicit' | 'none' | null
  is_enabled: boolean | null
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled' | null
  reauthorization_required: boolean
  read_calendar_ids?: string[]
  gmail_last_scan_attempt_at: string | null
  gmail_last_scan_success_at: string | null
  gmail_last_scan_error: string | null
}

interface MemberWithStatus extends FamilyMember {
  status: GoogleStatus | null
  lastGmailScan: string | null
}

// ── Hook ──────────────────────────────────────────────────────────

function useGoogleServices() {
  return useQuery({
    queryKey: ['google-services'],
    staleTime: 0,
    queryFn: async (): Promise<MemberWithStatus[]> => {
      const [{ data: members }, { data: statuses }, { data: gmailMsgs }] = await Promise.all([
        supabase.from('family_members').select('*').order('sort_order'),
        supabase.from('google_connection_status').select('*'),
        supabase
          .from('gmail_processed_messages')
          .select('family_member_id, processed_at')
          .order('processed_at', { ascending: false })
          .limit(100),
      ])
      const byId = new Map(
        (statuses ?? []).map((s: GoogleStatus) => [s.family_member_id, s]),
      )
      const lastScanById = new Map<string, string>()
      for (const msg of gmailMsgs ?? []) {
        if (!lastScanById.has(msg.family_member_id)) {
          lastScanById.set(msg.family_member_id, msg.processed_at)
        }
      }
      return (members ?? []).map((m: FamilyMember) => ({
        ...m,
        status: byId.get(m.id) ?? null,
        lastGmailScan: lastScanById.get(m.id) ?? null,
      }))
    },
  })
}

// ── Main Page Component ───────────────────────────────────────────

export default function GoogleServicesPage() {
  const [params, setParams] = useSearchParams()
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncResult, setSyncResult] = useState<{ tone: 'success' | 'danger'; title: string; message?: string } | null>(null)
  const [memberToDisconnect, setMemberToDisconnect] = useState<MemberWithStatus | null>(null)
  const [connectingMember, setConnectingMember] = useState<MemberWithStatus | null>(null)
  const [memberForCalendarPicker, setMemberForCalendarPicker] = useState<MemberWithStatus | null>(null)
  const [connectWithGmail, setConnectWithGmail] = useState(true)
  const qc = useQueryClient()

  const { data: members = [], isLoading, refetch } = useGoogleServices()

  const connectedParam = params.get('connected')
  const gmailParam = params.get('gmail')
  const errorParam = params.get('error')

  useEffect(() => {
    if (connectedParam || errorParam) {
      refetch()
      const t = setTimeout(() => {
        params.delete('connected')
        params.delete('error')
        params.delete('gmail')
        setParams(params, { replace: true })
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [connectedParam, errorParam, params, refetch, setParams])

  // OAuth start mutation
  const connectGoogle = useMutation({
    mutationFn: async ({ memberId, includeGmail }: { memberId: string; includeGmail: boolean }) => {
      const returnUrl = typeof window !== 'undefined'
        ? `${window.location.origin}/settings/google`
        : 'https://casa-tabor.vercel.app/settings/google'
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: {
          family_member_id: memberId,
          include_gmail: includeGmail,
          return_url: returnUrl,
        },
      })
      if (error || !data?.url) throw new Error('Failed to start OAuth')
      window.open(data.url as string, '_self')
    },
  })

  // Toggle Gmail scan on/off
  const toggleGmail = useMutation({
    mutationFn: async ({ memberId, enabled }: { memberId: string; enabled: boolean }) => {
      const { data, error } = await supabase.functions.invoke('toggle-gmail-scan', {
        body: { family_member_id: memberId, enabled },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['google-services'] })
      refetch()
    },
  })

  // Disconnect Google account
  const disconnect = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.functions.invoke('disconnect-calendar', {
        body: { family_member_id: memberId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      setMemberToDisconnect(null)
      qc.invalidateQueries({ queryKey: ['google-services'] })
      refetch()
    },
  })

  // Universal Sync All Services
  async function handleSyncAll() {
    setIsSyncingAll(true)
    setSyncResult(null)

    const activeMembers = members.filter(
      (m) => !!m.status?.google_email && m.status?.is_enabled !== false && !m.status?.reauthorization_required,
    )

    if (activeMembers.length === 0) {
      setIsSyncingAll(false)
      return
    }

    let totalEmailsScanned = 0
    let totalEventsCreated = 0
    const errors: string[] = []
    const tasks: Promise<unknown>[] = []

    for (const m of activeMembers) {
      // 1. Calendar sync
      tasks.push(
        supabase.functions
          .invoke('sync-calendars', { body: { family_member_id: m.id } })
          .then((res) => {
            if (res.error) throw new Error(`${m.name} Calendar: ${res.error.message ?? 'Sync failed'}`)
          })
          .catch((err) => {
            errors.push(err instanceof Error ? err.message : String(err))
          }),
      )

      // 2. Gmail scan if enabled
      if (m.status?.gmail_scan_enabled) {
        tasks.push(
          supabase.functions
            .invoke('scan-gmail-inbox', { body: { family_member_id: m.id } })
            .then((res) => {
              if (res.error) throw new Error(`${m.name} Gmail: ${res.error.message ?? 'Scan failed'}`)
              const results = res.data?.results ?? []
              for (const r of results) {
                totalEventsCreated += r.created ?? 0
                totalEmailsScanned += r.scanned ?? 0
              }
            })
            .catch((err) => {
              errors.push(err instanceof Error ? err.message : String(err))
            }),
        )
      }
    }

    await Promise.allSettled(tasks)
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['google-services'] }),
      qc.invalidateQueries({ queryKey: ['events'] }),
    ])
    await refetch()
    setIsSyncingAll(false)

    if (errors.length > 0) {
      setSyncResult({
        tone: 'danger',
        title: 'Sync completed with warnings',
        message: errors.join(' · '),
      })
    } else {
      setSyncResult({
        tone: 'success',
        title: 'All services synchronized',
        message: `Updated ${activeMembers.length} connected account${activeMembers.length === 1 ? '' : 's'}${
          totalEmailsScanned > 0
            ? ` · ${totalEmailsScanned} emails scanned · ${totalEventsCreated} event${totalEventsCreated === 1 ? '' : 's'} added`
            : ''
        }`,
      })
    }
  }

  // Partition members into connected and unconnected
  const { connectedMembers, unconnectedMembers, gmailActiveCount, latestSyncDate } = useMemo(() => {
    const connected: MemberWithStatus[] = []
    const unconnected: MemberWithStatus[] = []
    let gmailActive = 0
    let latest: Date | null = null

    for (const m of members) {
      if (m.status?.google_email) {
        connected.push(m)
        if (m.status.gmail_scan_enabled) gmailActive++
        if (m.status.last_sync_at) {
          const d = new Date(m.status.last_sync_at)
          if (!latest || d > latest) latest = d
        }
        if (m.status.gmail_last_scan_success_at) {
          const d = new Date(m.status.gmail_last_scan_success_at)
          if (!latest || d > latest) latest = d
        }
      } else {
        unconnected.push(m)
      }
    }

    return {
      connectedMembers: connected,
      unconnectedMembers: unconnected,
      gmailActiveCount: gmailActive,
      latestSyncDate: latest,
    }
  }, [members])

  return (
    <div className="w-full max-w-4xl mx-auto space-y-6 px-1 sm:px-4 py-2">
      <SettingsPageHeader
        title="Google Services"
        description="Connect family Google accounts for calendar sync and Gmail event imports."
        actions={
          connectedMembers.length > 0 ? (
            <Button
              variant="subtle"
              size="md"
              onClick={handleSyncAll}
              disabled={isSyncingAll}
              className="min-h-[44px] sm:min-h-[48px] px-4 font-semibold text-body-sm"
              leadingIcon={<RefreshCw size={15} className={isSyncingAll ? 'animate-spin' : ''} />}
            >
              {isSyncingAll ? 'Syncing all…' : 'Sync all services'}
            </Button>
          ) : null
        }
      />

      {/* Status feedback alerts */}
      {connectedParam && (
        <Alert
          className="mt-4"
          tone="success"
          title={gmailParam ? 'Calendar sync and Gmail scan are active' : 'Calendar sync is active'}
        />
      )}
      {errorParam && (
        <Alert className="mt-4" tone="danger" title="Google connection failed">
          {errorParam.replace(/_/g, ' ')}
        </Alert>
      )}
      {syncResult && (
        <Alert
          className="mt-4"
          tone={syncResult.tone}
          title={syncResult.title}
        >
          {syncResult.message}
        </Alert>
      )}

      {/* Overview status strip */}
      {!isLoading && members.length > 0 && connectedMembers.length > 0 && (
        <div className="flex items-center gap-3 rounded-card border border-casa-border bg-casa-surface/80 p-4 shadow-card">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-casa-bg text-casa-navy">
            <Layers size={18} />
          </div>
          <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-body font-semibold text-casa-navy">
                {connectedMembers.length} of {members.length} accounts connected
              </p>
              <p className="text-caption text-casa-muted mt-0.5">
                {gmailActiveCount} active inbox {gmailActiveCount === 1 ? 'monitor' : 'monitors'} ·{' '}
                {latestSyncDate ? `Last sync ${formatDistanceToNow(latestSyncDate)} ago` : 'Ready to sync'}
              </p>
            </div>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="py-12 text-center text-body-sm text-casa-muted flex items-center justify-center gap-2">
          <RefreshCw size={16} className="animate-spin" />
          <span>Loading Google Services…</span>
        </div>
      ) : members.length === 0 ? (
        <p className="text-body-sm text-casa-muted">No family members found.</p>
      ) : (
        <div className="space-y-6">
          {/* ── Section 1: Connected Accounts ── */}
          {connectedMembers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-semibold text-caption text-casa-muted uppercase tracking-wider">
                  Connected Accounts ({connectedMembers.length})
                </h2>
              </div>

              <div className="space-y-4">
                {connectedMembers.map((member) => (
                  <ConnectedMemberCard
                    key={member.id}
                    member={member}
                    onToggleGmail={(enabled) => toggleGmail.mutate({ memberId: member.id, enabled })}
                    onReconnect={() => connectGoogle.mutate({ memberId: member.id, includeGmail: Boolean(member.status?.gmail_scan_enabled) })}
                    onRequestDisconnect={() => setMemberToDisconnect(member)}
                    onOpenCalendarPicker={() => setMemberForCalendarPicker(member)}
                    isBusy={
                      (disconnect.isPending && disconnect.variables === member.id) ||
                      (toggleGmail.isPending && (toggleGmail.variables as { memberId: string })?.memberId === member.id) ||
                      (connectGoogle.isPending && (connectGoogle.variables as { memberId: string })?.memberId === member.id) ||
                      isSyncingAll
                    }
                  />
                ))}
              </div>
            </div>
          )}

          {/* ── Section 2: Unconnected Family Members ── */}
          {unconnectedMembers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="font-semibold text-caption text-casa-muted uppercase tracking-wider">
                  Available Members ({unconnectedMembers.length} not connected)
                </h2>
              </div>

              <div className="rounded-card border border-casa-border bg-casa-surface shadow-card divide-y divide-casa-border/60 overflow-hidden">
                {unconnectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 p-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex size-10 shrink-0 items-center justify-center rounded-full font-bold text-body-sm text-white"
                        style={{ backgroundColor: member.color_hex ?? FALLBACK_PROFILE_COLOR }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-body text-casa-navy leading-none truncate">{member.name}</p>
                        <p className="mt-1 text-caption text-casa-muted">Google account not connected</p>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="md"
                      className="min-h-[44px] sm:min-h-[48px] px-4 font-medium"
                      onClick={() => {
                        setConnectingMember(member)
                        setConnectWithGmail(true)
                      }}
                      disabled={connectGoogle.isPending}
                      leadingIcon={<GoogleIcon />}
                    >
                      Connect
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Target Calendar Selector Modal (1-click calendar picker) ── */}
      {memberForCalendarPicker && (
        <CalendarSelectorModal
          member={memberForCalendarPicker}
          onClose={() => setMemberForCalendarPicker(null)}
          onRefetchParent={refetch}
          onReconnect={() => {
            const m = memberForCalendarPicker
            setMemberForCalendarPicker(null)
            setConnectingMember(m)
          }}
        />
      )}

      {/* ── Connect Account Modal (Keeps page compact) ── */}
      {connectingMember && (
        <Modal
          open={true}
          onClose={() => setConnectingMember(null)}
          title={`Connect ${connectingMember.name}'s Google Account`}
        >
          <div className="space-y-4 pt-2">
            <p className="text-body-sm text-casa-muted leading-relaxed">
              Link Google Calendar and optionally enable Gmail event detection. Casa will automatically discover and link to your dedicated <strong>Casa Tabor</strong> calendar if one exists in your account.
            </p>
            <div className="space-y-3 rounded-card border border-casa-border/60 bg-casa-bg p-4">
              <div className="flex items-center gap-2.5 opacity-90">
                <div className="flex size-5 shrink-0 items-center justify-center rounded border-2 border-casa-navy bg-casa-navy">
                  <Check size={12} className="text-white" />
                </div>
                <span className="font-semibold text-body-sm text-casa-navy">Google Calendar Sync</span>
                <span className="rounded-full bg-casa-divider px-2 py-0.5 text-caption font-medium text-casa-muted">Required</span>
              </div>

              <Checkbox
                label="Gmail Inbox Scan"
                description="Automatically detect and import event invitations & confirmations"
                checked={connectWithGmail}
                onChange={(e) => setConnectWithGmail(e.target.checked)}
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                variant="secondary"
                size="md"
                className="min-h-[44px] sm:min-h-[48px] px-4"
                onClick={() => setConnectingMember(null)}
              >
                Cancel
              </Button>
              <Button
                variant="strong"
                size="md"
                className="min-h-[44px] sm:min-h-[48px] px-5 font-semibold"
                onClick={() => {
                  const memberId = connectingMember.id
                  setConnectingMember(null)
                  connectGoogle.mutate({ memberId, includeGmail: connectWithGmail })
                }}
                disabled={connectGoogle.isPending}
                leadingIcon={<GoogleIcon />}
              >
                {connectGoogle.isPending ? 'Redirecting…' : 'Continue with Google'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Disconnect confirmation modal ── */}
      {memberToDisconnect && (
        <ConfirmationDialog
          open={true}
          onClose={() => setMemberToDisconnect(null)}
          onConfirm={() => disconnect.mutate(memberToDisconnect.id)}
          title={`Disconnect ${memberToDisconnect.name}'s Google Account?`}
          description={`This will unlink ${memberToDisconnect.status?.google_email ?? 'Google account'} from Casa. Calendar sync and Gmail monitoring will stop, but existing events in your household schedule are kept.`}
          confirmLabel="Disconnect"
          destructive={true}
          loading={disconnect.isPending}
        />
      )}
    </div>
  )
}

// ── Connected Member Card (High-density, single unified panel) ─────

function ConnectedMemberCard({
  member,
  onToggleGmail,
  onReconnect,
  onRequestDisconnect,
  onOpenCalendarPicker,
  isBusy,
}: {
  member: MemberWithStatus
  onToggleGmail: (enabled: boolean) => void
  onReconnect: () => void
  onRequestDisconnect: () => void
  onOpenCalendarPicker: () => void
  isBusy: boolean
}) {
  const s = member.status!
  const calendarActive = s.is_enabled !== false && !s.reauthorization_required
  const gmailActive = Boolean(s.gmail_scan_enabled)
  const reauthRequired = Boolean(s.reauthorization_required)

  const isDedicatedCasaCalendar = Boolean(s.calendar_id && s.calendar_id !== s.google_email)

  return (
    <div
      className={cn(
        'rounded-card border bg-casa-surface p-4 sm:p-5 shadow-card transition-all space-y-4',
        reauthRequired ? 'border-casa-gold/60 ring-1 ring-casa-gold/30' : 'border-casa-border',
      )}
    >
      {/* ── Top Header Row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="flex size-11 shrink-0 items-center justify-center rounded-full font-bold text-body text-white shadow-sm"
            style={{ backgroundColor: member.color_hex ?? FALLBACK_PROFILE_COLOR }}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-body text-casa-navy leading-none">{member.name}</span>
              {s.access_mode === 'writable' ? (
                <Chip tone="accent">Casa write target</Chip>
              ) : (
                <Chip tone="neutral">Read-only</Chip>
              )}
            </div>
            <p className="mt-1 truncate text-body-sm text-casa-muted">{s.google_email}</p>
          </div>
        </div>

        {/* Action / Disconnect */}
        <div className="flex shrink-0 items-center gap-2">
          {reauthRequired ? (
            <Button
              variant="strong"
              size="md"
              className="min-h-[44px] sm:min-h-[48px] px-4 font-semibold"
              onClick={onReconnect}
              disabled={isBusy}
              leadingIcon={<GoogleIcon />}
            >
              Reconnect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="md"
              onClick={onRequestDisconnect}
              disabled={isBusy}
              className="min-h-[44px] sm:min-h-[48px] text-casa-error hover:bg-casa-error/10 text-body-sm px-3"
              title="Disconnect Google account"
              leadingIcon={<Unlink size={15} />}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {reauthRequired && (
        <div className="flex items-center gap-2.5 rounded-xl bg-casa-gold/10 p-3 text-body-sm text-casa-navy">
          <AlertCircle size={17} className="shrink-0 text-casa-gold" />
          <span>Google session expired. Reconnect to resume calendar sync and Gmail scan.</span>
        </div>
      )}

      {/* ── Inline Services Bar (Touch-friendly cards) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-casa-border/50 pt-3.5">
        {/* Target Calendar Selector Trigger */}
        <div
          role="button"
          tabIndex={isBusy || reauthRequired ? -1 : 0}
          onClick={() => !isBusy && !reauthRequired && onOpenCalendarPicker()}
          onKeyDown={(e) => {
            if (!isBusy && !reauthRequired && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault()
              onOpenCalendarPicker()
            }
          }}
          className={cn(
            'flex items-center justify-between rounded-xl border p-3.5 text-left transition-all cursor-pointer select-none',
            'min-h-[48px] sm:min-h-[52px]',
            'bg-casa-bg hover:border-casa-navy/40 hover:bg-casa-surface/80 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-casa-navy/20',
            (isBusy || reauthRequired) && 'opacity-60 pointer-events-none',
            isDedicatedCasaCalendar ? 'border-casa-navy/30' : 'border-casa-border/60',
          )}
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg',
              isDedicatedCasaCalendar ? 'bg-casa-navy text-white' : 'bg-casa-surface text-casa-navy border border-casa-border',
            )}>
              <Calendar size={17} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-body-sm text-casa-navy truncate">
                  {isDedicatedCasaCalendar ? 'Casa Tabor (Primary Write)' : 'Primary Calendar'}
                </span>
                {isDedicatedCasaCalendar ? (
                  <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-caption font-semibold flex items-center gap-1">
                    <ShieldCheck size={11} /> Dedicated
                  </span>
                ) : (
                  <span className="rounded-full bg-casa-divider px-1.5 py-0.5 text-caption text-casa-muted">Personal</span>
                )}
              </div>
              <p className="text-caption text-casa-muted truncate mt-0.5">
                {s.read_calendar_ids && s.read_calendar_ids.length > 0
                  ? `+ ${s.read_calendar_ids.length} imported calendar${s.read_calendar_ids.length > 1 ? 's' : ''} (read-only)`
                  : calendarActive
                    ? s.last_sync_at
                      ? `Synced ${formatDistanceToNow(new Date(s.last_sync_at))} ago`
                      : 'Sync active'
                    : 'Sync paused'} · Tap to configure
              </p>
            </div>
          </div>
          <ChevronRight size={18} className="shrink-0 text-casa-muted ml-2" />
        </div>

        {/* Gmail Inbox Scan Card */}
        <div className="flex items-center justify-between rounded-xl border border-casa-border/60 bg-casa-bg p-3.5 min-h-[48px] sm:min-h-[52px]">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-casa-surface text-casa-navy border border-casa-border">
              <Mail size={17} />
            </div>
            <div className="min-w-0">
              <span className="font-semibold text-body-sm text-casa-navy truncate block">Gmail Scan</span>
              <span className="flex items-center gap-1.5 text-caption text-casa-muted mt-0.5">
                {gmailActive && <span className="size-2 rounded-full bg-emerald-500" />}
                {gmailActive
                  ? s.gmail_last_scan_success_at
                    ? `Scanned ${formatDistanceToNow(new Date(s.gmail_last_scan_success_at))} ago`
                    : 'Active monitoring'
                  : 'Monitoring off'}
              </span>
            </div>
          </div>
          <Switch
            label=""
            checked={gmailActive}
            onCheckedChange={(checked) => onToggleGmail(checked)}
            disabled={isBusy || reauthRequired}
            aria-label={`Toggle Gmail scanning for ${member.name}`}
          />
        </div>
      </div>
    </div>
  )
}

// ── Calendar Selector Modal (2-Tier Multi-Calendar Ingestion) ───────

function CalendarSelectorModal({
  member,
  onClose,
  onRefetchParent,
  onReconnect,
}: {
  member: MemberWithStatus
  onClose: () => void
  onRefetchParent: () => void
  onReconnect: () => void
}) {
  const { data, isLoading, isError, error, refetch } = useGoogleCalendarList(member.id, true)
  const selectMutation = useSelectGoogleCalendar()

  const [writeCalId, setWriteCalId] = useState<string>('')
  const [readCalIds, setReadCalIds] = useState<string[]>([])
  const [hasInitialized, setHasInitialized] = useState(false)

  useEffect(() => {
    if (data?.ok && data.calendars && !hasInitialized) {
      const initialWrite =
        data.current_calendar_id ||
        member.status?.calendar_id ||
        data.calendars.find((c) => c.summary.trim().toLowerCase() === 'casa tabor')?.id ||
        data.calendars.find((c) => c.primary)?.id ||
        data.calendars[0]?.id ||
        ''
      setWriteCalId(initialWrite)
      setReadCalIds(data.read_calendar_ids || member.status?.read_calendar_ids || [])
      setHasInitialized(true)
    }
  }, [data, member.status, hasInitialized])

  function toggleReadCalendar(id: string) {
    setReadCalIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    )
  }

  async function handleSave() {
    if (!writeCalId) return
    const readMetadata = (data?.calendars ?? [])
      .filter((c) => readCalIds.includes(c.id) && c.id !== writeCalId)
      .map((c) => ({
        id: c.id,
        summary: c.summary,
        backgroundColor: c.backgroundColor || undefined,
      }))

    await selectMutation.mutateAsync({
      familyMemberId: member.id,
      writeCalendarId: writeCalId,
      readCalendarIds: readCalIds.filter((id) => id !== writeCalId),
      readCalendarMetadata: readMetadata,
    })
    onRefetchParent()
    onClose()
  }

  const isReauth =
    data?.reauth_required || (error instanceof Error && error.message.includes('expired'))

  const calendars = data?.calendars ?? []
  const writableCalendars = calendars.filter((c) => c.can_write !== false)
  const otherCalendars = calendars.filter((c) => c.id !== writeCalId)

  return (
    <Modal open={true} onClose={onClose} title="Configure Google Calendars">
      <div className="space-y-5 pt-2">
        <p className="text-body-sm text-casa-muted leading-relaxed">
          Configure how Casa Tabor connects with <strong>{member.name}</strong>’s Google Calendar account.
        </p>

        {isLoading ? (
          <div className="py-12 text-center text-body-sm text-casa-muted flex items-center justify-center gap-2">
            <RefreshCw size={18} className="animate-spin text-casa-navy" />
            <span>Discovering Google Calendars…</span>
          </div>
        ) : isError || data?.ok === false ? (
          <div className="space-y-3">
            <Alert
              tone={isReauth ? 'warning' : 'danger'}
              title={isReauth ? 'Re-authorization Required' : 'Could not list Google Calendars'}
            >
              {data?.error || (error instanceof Error ? error.message : 'Please check your connection and try again.')}
            </Alert>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="md" onClick={() => refetch()} leadingIcon={<RefreshCw size={14} />}>
                Retry
              </Button>
              <Button
                variant="strong"
                size="md"
                className="min-h-[44px] sm:min-h-[48px] px-4 font-semibold"
                onClick={onReconnect}
                leadingIcon={<GoogleIcon />}
              >
                Reconnect Account
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-5 max-h-[60vh] overflow-y-auto pr-1">
            {/* ── Tier 1: Primary Write Target ── */}
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex size-5 shrink-0 items-center justify-center rounded bg-casa-navy text-white text-caption font-bold">
                  1
                </div>
                <span className="font-semibold text-body-sm text-casa-navy">
                  Primary Write Calendar
                </span>
                <span className="rounded-full bg-casa-gold/15 text-casa-gold px-2 py-0.5 text-caption font-semibold">
                  Where Casa saves events
                </span>
              </div>
              <p className="text-caption text-casa-muted leading-relaxed pl-7">
                All events, routines, and chores created in Casa push <strong>strictly</strong> to this calendar. Your other personal calendars remain untouched.
              </p>

              <div className="space-y-2 pl-7 pt-1">
                {writableCalendars.map((cal) => {
                  const isSelected = cal.id === writeCalId
                  const isCasaTabor = cal.summary.trim().toLowerCase() === 'casa tabor'

                  return (
                    <div
                      key={cal.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => setWriteCalId(cal.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          setWriteCalId(cal.id)
                        }
                      }}
                      className={cn(
                        'w-full flex items-center justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer select-none min-h-[48px] sm:min-h-[52px]',
                        isSelected
                          ? 'border-casa-navy bg-casa-navy/5 ring-1 ring-casa-navy/20'
                          : 'border-casa-border/60 bg-casa-surface hover:border-casa-navy/30 hover:bg-casa-bg',
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-full border',
                            isSelected
                              ? 'border-casa-navy bg-casa-navy text-white'
                              : 'border-casa-border bg-casa-bg',
                          )}
                        >
                          {isSelected && <Check size={12} />}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-body-sm text-casa-navy truncate">
                              {cal.summary}
                            </span>
                            {isCasaTabor && (
                              <span className="rounded-full bg-emerald-500/10 text-emerald-700 px-2 py-0.5 text-caption font-semibold flex items-center gap-1">
                                <ShieldCheck size={11} /> Recommended
                              </span>
                            )}
                            {cal.primary && (
                              <span className="rounded-full bg-casa-divider px-1.5 py-0.5 text-caption text-casa-muted">
                                Personal
                              </span>
                            )}
                          </div>
                          {cal.description && (
                            <p className="text-caption text-casa-muted truncate mt-0.5">
                              {cal.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Tier 2: Also Import / Read From ── */}
            {otherCalendars.length > 0 && (
              <div className="space-y-2 pt-3 border-t border-casa-border/50">
                <div className="flex items-center gap-2">
                  <div className="flex size-5 shrink-0 items-center justify-center rounded bg-casa-surface border border-casa-border text-casa-navy text-caption font-bold">
                    2
                  </div>
                  <span className="font-semibold text-body-sm text-casa-navy">
                    Also Display on Kiosk (Read-Only)
                  </span>
                </div>
                <p className="text-caption text-casa-muted leading-relaxed pl-7">
                  Check any calendars below to display their activities on your smart kiosk. Casa will read these events without ever modifying them in Google.
                </p>

                <div className="space-y-2 pl-7 pt-1">
                  {otherCalendars.map((cal) => {
                    const isChecked = readCalIds.includes(cal.id)

                    return (
                      <div
                        key={cal.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => toggleReadCalendar(cal.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            toggleReadCalendar(cal.id)
                          }
                        }}
                        className={cn(
                          'w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all cursor-pointer select-none min-h-[48px] sm:min-h-[50px]',
                          isChecked
                            ? 'border-casa-border bg-casa-bg'
                            : 'border-casa-border/40 bg-casa-surface/60 hover:bg-casa-surface',
                        )}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={cn(
                              'flex size-5 shrink-0 items-center justify-center rounded border',
                              isChecked
                                ? 'border-casa-navy bg-casa-navy text-white'
                                : 'border-casa-border bg-casa-bg',
                            )}
                          >
                            {isChecked && <Check size={12} />}
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              {cal.backgroundColor && (
                                <span
                                  className="size-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: cal.backgroundColor }}
                                />
                              )}
                              <span className="font-medium text-body-sm text-casa-navy truncate">
                                {cal.summary}
                              </span>
                              {cal.primary && (
                                <span className="rounded-full bg-casa-divider px-1.5 py-0.5 text-caption text-casa-muted">
                                  Personal
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <span className="text-caption text-casa-muted shrink-0 ml-2">
                          {isChecked ? 'Importing' : 'Ignored'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-3 border-t border-casa-border/50">
          <Button
            variant="secondary"
            size="md"
            className="min-h-[44px] sm:min-h-[48px] px-4"
            onClick={onClose}
            disabled={selectMutation.isPending}
          >
            Cancel
          </Button>

          <Button
            variant="strong"
            size="md"
            className="min-h-[44px] sm:min-h-[48px] px-5 font-semibold"
            onClick={handleSave}
            disabled={selectMutation.isPending || isLoading || !writeCalId}
            leadingIcon={selectMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
          >
            {selectMutation.isPending ? 'Saving…' : 'Save Calendar Setup'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Google logo icon (SVG) ─────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="var(--color-casa-info)" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="var(--color-casa-success)" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="var(--color-casa-gold)" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="var(--color-casa-error)" />
    </svg>
  )
}
