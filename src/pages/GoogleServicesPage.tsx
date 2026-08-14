/**
 * GoogleServicesPage
 *
 * High-density, zero-clutter Google Services management.
 * - Single universal "Sync all services" header action
 * - Compact connected account cards with inline status and Switch toggle
 * - Clean, space-efficient list for unconnected family members with modal setup
 * - Safe confirmation dialog on disconnect
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar, Mail, Check,
  RefreshCw, Unlink, AlertCircle, Layers,
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
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: { family_member_id: memberId, include_gmail: includeGmail },
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
    <>
      <SettingsPageHeader
        title="Google Services"
        description="Connect family Google accounts for calendar sync and Gmail event imports."
        actions={
          connectedMembers.length > 0 ? (
            <Button
              variant="subtle"
              size="sm"
              onClick={handleSyncAll}
              disabled={isSyncingAll}
              leadingIcon={<RefreshCw size={14} className={isSyncingAll ? 'animate-spin' : ''} />}
            >
              {isSyncingAll ? 'Syncing all…' : 'Sync all services'}
            </Button>
          ) : null
        }
      />

      {/* Status feedback alerts */}
      {connectedParam && (
        <Alert
          className="mt-6"
          tone="success"
          title={gmailParam ? 'Calendar sync and Gmail scan are active' : 'Calendar sync is active'}
        />
      )}
      {errorParam && (
        <Alert className="mt-6" tone="danger" title="Google connection failed">
          {errorParam.replace(/_/g, ' ')}
        </Alert>
      )}
      {syncResult && (
        <Alert
          className="mt-6"
          tone={syncResult.tone}
          title={syncResult.title}
        >
          {syncResult.message}
        </Alert>
      )}

      {/* Overview status strip (compact, zero duplicate buttons) */}
      {!isLoading && members.length > 0 && connectedMembers.length > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-card border border-casa-border bg-casa-surface/60 px-4 py-3 shadow-card">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-casa-bg text-casa-navy">
            <Layers size={16} />
          </div>
          <div className="min-w-0 flex-1 flex flex-wrap items-center justify-between gap-2">
            <p className="text-body-sm font-semibold text-casa-navy">
              {connectedMembers.length} of {members.length} accounts connected
            </p>
            <p className="text-caption text-casa-muted">
              {gmailActiveCount} active inbox {gmailActiveCount === 1 ? 'monitor' : 'monitors'} ·{' '}
              {latestSyncDate ? `Last sync ${formatDistanceToNow(latestSyncDate)} ago` : 'Ready to sync'}
            </p>
          </div>
        </div>
      )}

      {isLoading ? (
        <p className="mt-6 text-body-sm text-casa-muted">Loading…</p>
      ) : members.length === 0 ? (
        <p className="mt-6 text-body-sm text-casa-muted">No family members found.</p>
      ) : (
        <div className="mt-6 space-y-6">
          {/* ── Section 1: Connected Accounts ── */}
          {connectedMembers.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-body-sm text-casa-navy uppercase tracking-wide">
                  Connected Accounts ({connectedMembers.length})
                </h2>
              </div>

              <div className="space-y-3">
                {connectedMembers.map((member) => (
                  <ConnectedMemberCard
                    key={member.id}
                    member={member}
                    onToggleGmail={(enabled) => toggleGmail.mutate({ memberId: member.id, enabled })}
                    onReconnect={() => connectGoogle.mutate({ memberId: member.id, includeGmail: Boolean(member.status?.gmail_scan_enabled) })}
                    onRequestDisconnect={() => setMemberToDisconnect(member)}
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
              <div className="flex items-center justify-between">
                <h2 className="font-semibold text-body-sm text-casa-navy uppercase tracking-wide">
                  Available Members ({unconnectedMembers.length} not connected)
                </h2>
              </div>

              <div className="rounded-card border border-casa-border bg-casa-surface shadow-card divide-y divide-casa-border/60 overflow-hidden">
                {unconnectedMembers.map((member) => (
                  <div
                    key={member.id}
                    className="flex items-center justify-between gap-3 p-3.5 sm:px-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div
                        className="flex size-8 shrink-0 items-center justify-center rounded-full font-semibold text-caption text-white"
                        style={{ backgroundColor: member.color_hex ?? FALLBACK_PROFILE_COLOR }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-body-sm text-casa-navy leading-none truncate">{member.name}</p>
                        <p className="mt-1 text-caption text-casa-muted">Not connected</p>
                      </div>
                    </div>

                    <Button
                      variant="secondary"
                      size="sm"
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

      {/* ── Connect Account Modal (Keeps page compact) ── */}
      {connectingMember && (
        <Modal
          open={true}
          onClose={() => setConnectingMember(null)}
          title={`Connect ${connectingMember.name}'s Google Account`}
        >
          <div className="space-y-4 pt-2">
            <p className="text-body-sm text-casa-muted">
              Link Google Calendar and optionally enable Gmail event detection.
            </p>
            <div className="space-y-2.5 rounded-xl border border-casa-border/60 bg-casa-bg p-3.5">
              <div className="flex items-center gap-2.5 opacity-90">
                <div className="flex size-4 shrink-0 items-center justify-center rounded border-2 border-casa-navy bg-casa-navy">
                  <Check size={10} className="text-white" />
                </div>
                <span className="font-semibold text-body-sm text-casa-navy">Google Calendar Sync</span>
                <span className="rounded-full bg-casa-divider px-1.5 py-0.5 text-caption text-casa-muted">Required</span>
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
                size="sm"
                onClick={() => setConnectingMember(null)}
              >
                Cancel
              </Button>
              <Button
                variant="strong"
                size="sm"
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
    </>
  )
}

// ── Connected Member Card (High-density, single unified panel) ─────

function ConnectedMemberCard({
  member,
  onToggleGmail,
  onReconnect,
  onRequestDisconnect,
  isBusy,
}: {
  member: MemberWithStatus
  onToggleGmail: (enabled: boolean) => void
  onReconnect: () => void
  onRequestDisconnect: () => void
  isBusy: boolean
}) {
  const s = member.status!
  const calendarActive = s.is_enabled !== false && !s.reauthorization_required
  const gmailActive = Boolean(s.gmail_scan_enabled)
  const reauthRequired = Boolean(s.reauthorization_required)

  return (
    <div
      className={cn(
        'rounded-card border bg-casa-surface p-4 shadow-card transition-all',
        reauthRequired ? 'border-casa-gold/60 ring-1 ring-casa-gold/30' : 'border-casa-border',
      )}
    >
      {/* ── Top Header Row ── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Identity */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-full font-semibold text-body-sm text-white"
            style={{ backgroundColor: member.color_hex ?? FALLBACK_PROFILE_COLOR }}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold text-body-sm text-casa-navy leading-none">{member.name}</span>
              {s.access_mode === 'writable' ? (
                <Chip tone="accent">Casa write target</Chip>
              ) : (
                <Chip tone="neutral">Read-only</Chip>
              )}
            </div>
            <p className="mt-1 truncate text-caption text-casa-muted">{s.google_email}</p>
          </div>
        </div>

        {/* Action / Disconnect */}
        <div className="flex shrink-0 items-center gap-2">
          {reauthRequired ? (
            <Button
              variant="strong"
              size="sm"
              onClick={onReconnect}
              disabled={isBusy}
              leadingIcon={<GoogleIcon />}
            >
              Reconnect
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRequestDisconnect}
              disabled={isBusy}
              className="text-casa-error hover:bg-casa-error/10 text-caption"
              title="Disconnect Google account"
              leadingIcon={<Unlink size={13} />}
            >
              Disconnect
            </Button>
          )}
        </div>
      </div>

      {reauthRequired && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-casa-gold/10 p-2.5 text-caption text-casa-navy">
          <AlertCircle size={15} className="shrink-0 text-casa-gold" />
          <span>Google session expired. Reconnect to resume calendar sync and Gmail scan.</span>
        </div>
      )}

      {/* ── Inline Services Bar (Side-by-side on tablet/desktop) ── */}
      <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 border-t border-casa-border/50 pt-3">
        {/* Calendar Sync */}
        <div className="flex items-center justify-between rounded-lg border border-casa-border/40 bg-casa-bg px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Calendar size={15} className="shrink-0 text-casa-navy" />
            <span className="font-medium text-body-sm text-casa-navy truncate">Calendar Sync</span>
          </div>
          <span className="flex shrink-0 items-center gap-1.5 text-caption text-casa-muted">
            <span
              className={cn(
                'size-1.5 rounded-full',
                calendarActive ? 'bg-emerald-500' : 'bg-casa-muted',
              )}
            />
            {calendarActive
              ? s.last_sync_at
                ? `${formatDistanceToNow(new Date(s.last_sync_at))} ago`
                : 'Active'
              : 'Paused'}
          </span>
        </div>

        {/* Gmail Inbox Scan */}
        <div className="flex items-center justify-between rounded-lg border border-casa-border/40 bg-casa-bg px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <Mail size={15} className="shrink-0 text-casa-navy" />
            <span className="font-medium text-body-sm text-casa-navy truncate">Gmail Scan</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="flex items-center gap-1.5 text-caption text-casa-muted">
              {gmailActive && <span className="size-1.5 rounded-full bg-emerald-500" />}
              {gmailActive
                ? s.gmail_last_scan_success_at
                  ? `${formatDistanceToNow(new Date(s.gmail_last_scan_success_at))} ago`
                  : 'Active'
                : 'Off'}
            </span>
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
    </div>
  )
}

// ── Google logo icon (SVG) ─────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="var(--color-casa-info)" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="var(--color-casa-success)" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="var(--color-casa-gold)" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="var(--color-casa-error)" />
    </svg>
  )
}
