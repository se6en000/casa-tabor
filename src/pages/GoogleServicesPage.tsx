/**
 * GoogleServicesPage
 *
 * Streamlined Google Services management — Calendar sync + Gmail Inbox Scan.
 * Features:
 * - Universal "Sync all services" button with aggregate feedback
 * - Flat, scannable family member cards with clear health indicators
 * - Native Switch toggles for Gmail scanning (no conflicting inline triggers)
 * - Safe disconnect dialog to prevent accidental unlinking
 * - Clean visual hierarchy adhering to Casa design system
 */

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Calendar, Mail, Check,
  RefreshCw, Unlink, AlertCircle, Layers,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Alert, Button, Chip, ConfirmationDialog,
  Switch, Checkbox,
} from '../components/ui'
import { SettingsPageHeader } from '../components/settings'
import { formatDistanceToNow, format } from 'date-fns'
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

// ── Hooks ─────────────────────────────────────────────────────────

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

// ── Page ──────────────────────────────────────────────────────────

export default function GoogleServicesPage() {
  const [params, setParams] = useSearchParams()
  const [isSyncingAll, setIsSyncingAll] = useState(false)
  const [syncResult, setSyncResult] = useState<{ tone: 'success' | 'danger'; title: string; message?: string } | null>(null)
  const [memberToDisconnect, setMemberToDisconnect] = useState<MemberWithStatus | null>(null)
  const qc = useQueryClient()

  const { data: members, isLoading, refetch } = useGoogleServices()

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

  // Toggle Gmail scan on/off via Edge Function
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

  // Sync individual account
  const syncAccount = useMutation({
    mutationFn: async (memberId: string) => {
      const member = members?.find((m) => m.id === memberId)
      const tasks: Promise<{ data: any; error: any }>[] = [
        supabase.functions.invoke('sync-calendars', { body: { family_member_id: memberId } }),
      ]
      if (member?.status?.gmail_scan_enabled) {
        tasks.push(supabase.functions.invoke('scan-gmail-inbox', { body: { family_member_id: memberId } }))
      }

      const results = await Promise.allSettled(tasks)
      const calRes = results[0]
      if (calRes.status === 'rejected') throw calRes.reason
      if (calRes.status === 'fulfilled' && calRes.value.error) throw calRes.value.error

      const gmailRes = results[1]
      if (gmailRes && gmailRes.status === 'fulfilled' && !gmailRes.value.error) {
        const gmailData = gmailRes.value.data?.results ?? []
        const created = gmailData.reduce((s: number, r: { created: number }) => s + (r.created ?? 0), 0)
        const scanned = gmailData.reduce((s: number, r: { scanned: number }) => s + (r.scanned ?? 0), 0)
        if (scanned > 0 || created > 0) {
          setSyncResult({
            tone: 'success',
            title: `${member?.name ?? 'Account'} synced`,
            message: `Scanned ${scanned} emails · ${created} event${created !== 1 ? 's' : ''} added`,
          })
        }
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['google-services'] })
      qc.invalidateQueries({ queryKey: ['events'] })
      refetch()
    },
  })

  // Universal Sync All Services
  async function handleSyncAll() {
    setIsSyncingAll(true)
    setSyncResult(null)

    const activeMembers = (members ?? []).filter(
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

  // Summary counts
  const { connectedCount, gmailActiveCount, latestSyncDate } = useMemo(() => {
    let connected = 0
    let gmailActive = 0
    let latest: Date | null = null

    for (const m of members ?? []) {
      if (m.status?.google_email) {
        connected++
        if (m.status.gmail_scan_enabled) gmailActive++
        if (m.status.last_sync_at) {
          const d = new Date(m.status.last_sync_at)
          if (!latest || d > latest) latest = d
        }
        if (m.status.gmail_last_scan_success_at) {
          const d = new Date(m.status.gmail_last_scan_success_at)
          if (!latest || d > latest) latest = d
        }
      }
    }

    return {
      connectedCount: connected,
      gmailActiveCount: gmailActive,
      latestSyncDate: latest,
    }
  }, [members])

  const hasAnyMembers = (members?.length ?? 0) > 0

  return (
    <>
      <SettingsPageHeader
        title="Google Services"
        description="Connect each family member's account for calendar sync and Gmail scanning."
        actions={
          connectedCount > 0 ? (
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

      {/* Status banners */}
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

      {/* Overview stats bar */}
      {!isLoading && hasAnyMembers && connectedCount > 0 && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-card border border-casa-border bg-casa-surface/60 p-4 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-casa-bg text-casa-navy">
              <Layers size={18} />
            </div>
            <div>
              <p className="text-body-sm font-semibold text-casa-navy">
                {connectedCount} of {members?.length} accounts connected
              </p>
              <p className="text-caption text-casa-muted">
                {gmailActiveCount} active inbox {gmailActiveCount === 1 ? 'monitor' : 'monitors'} ·{' '}
                {latestSyncDate ? `Last sync ${formatDistanceToNow(latestSyncDate)} ago` : 'Ready to sync'}
              </p>
            </div>
          </div>
          <Button
            variant="subtle"
            size="sm"
            onClick={handleSyncAll}
            disabled={isSyncingAll}
            leadingIcon={<RefreshCw size={14} className={isSyncingAll ? 'animate-spin' : ''} />}
          >
            {isSyncingAll ? 'Syncing…' : 'Sync now'}
          </Button>
        </div>
      )}

      {/* Member cards */}
      {isLoading ? (
        <p className="mt-6 text-body-sm text-casa-muted">Loading…</p>
      ) : !hasAnyMembers ? (
        <p className="mt-6 text-body-sm text-casa-muted">No family members found.</p>
      ) : (
        <div className="mt-6 space-y-4">
          {(members ?? []).map((member) => (
            <MemberCard
              key={member.id}
              member={member}
              onConnect={(includeGmail) => connectGoogle.mutate({ memberId: member.id, includeGmail })}
              onToggleGmail={(enabled) => toggleGmail.mutate({ memberId: member.id, enabled })}
              onSyncAccount={() => syncAccount.mutate(member.id)}
              onRequestDisconnect={() => setMemberToDisconnect(member)}
              isBusy={
                (connectGoogle.isPending && (connectGoogle.variables as { memberId: string })?.memberId === member.id) ||
                (disconnect.isPending && disconnect.variables === member.id) ||
                (syncAccount.isPending && syncAccount.variables === member.id) ||
                (toggleGmail.isPending && (toggleGmail.variables as { memberId: string })?.memberId === member.id) ||
                isSyncingAll
              }
            />
          ))}
        </div>
      )}

      {/* Disconnect confirmation modal */}
      {memberToDisconnect && (
        <ConfirmationDialog
          open={true}
          onClose={() => setMemberToDisconnect(null)}
          onConfirm={() => disconnect.mutate(memberToDisconnect.id)}
          title={`Disconnect ${memberToDisconnect.name}'s Google Account?`}
          description={`This will disconnect ${memberToDisconnect.status?.google_email ?? 'Google account'} from Casa. Calendar sync and Gmail monitoring will stop, but existing events in your household schedule will be kept.`}
          confirmLabel="Disconnect"
          destructive={true}
          loading={disconnect.isPending}
        />
      )}
    </>
  )
}

// ── Member Card Component ──────────────────────────────────────────

function MemberCard({
  member,
  onConnect,
  onToggleGmail,
  onSyncAccount,
  onRequestDisconnect,
  isBusy,
}: {
  member: MemberWithStatus
  onConnect: (includeGmail: boolean) => void
  onToggleGmail: (enabled: boolean) => void
  onSyncAccount: () => void
  onRequestDisconnect: () => void
  isBusy: boolean
}) {
  const s = member.status
  const isConnected = !!s?.google_email
  const calendarActive = isConnected && s?.is_enabled !== false && !s?.reauthorization_required
  const gmailActive = isConnected && !!s?.gmail_scan_enabled
  const reauthRequired = isConnected && !!s?.reauthorization_required
  const [wantGmail, setWantGmail] = useState(true)

  return (
    <div
      className={cn(
        'rounded-card border bg-casa-surface p-5 shadow-card transition-all',
        reauthRequired ? 'border-casa-gold/60 ring-1 ring-casa-gold/30' : 'border-casa-border',
      )}
    >
      {/* ── Card Header ── */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-casa-border/60 pb-4">
        {/* Left: Avatar + Identity */}
        <div className="flex min-w-0 items-center gap-3">
          <div
            className="flex size-10 shrink-0 items-center justify-center rounded-full font-semibold text-body text-white"
            style={{ backgroundColor: member.color_hex ?? FALLBACK_PROFILE_COLOR }}
          >
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-body text-casa-navy leading-none">{member.name}</p>
              {isConnected && s?.access_mode === 'writable' && (
                <Chip tone="accent">Casa write target</Chip>
              )}
              {isConnected && s?.access_mode === 'read_only' && (
                <Chip tone="neutral">Read-only</Chip>
              )}
            </div>
            {isConnected ? (
              <p className="mt-1 truncate text-caption text-casa-muted">{s.google_email}</p>
            ) : (
              <p className="mt-1 text-caption text-casa-muted">Google account not connected</p>
            )}
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex shrink-0 items-center gap-2">
          {isConnected && reauthRequired ? (
            <Button
              variant="strong"
              size="sm"
              onClick={() => onConnect(gmailActive)}
              disabled={isBusy}
              leadingIcon={<GoogleIcon />}
            >
              Reconnect
            </Button>
          ) : isConnected ? (
            <>
              <Button
                variant="subtle"
                size="sm"
                onClick={onSyncAccount}
                disabled={isBusy || !calendarActive}
                title="Sync account"
                leadingIcon={<RefreshCw size={14} className={isBusy ? 'animate-spin' : ''} />}
              >
                Sync
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRequestDisconnect}
                disabled={isBusy}
                className="text-casa-error hover:bg-casa-error/10"
                title="Disconnect Google account"
                leadingIcon={<Unlink size={14} />}
              >
                Disconnect
              </Button>
            </>
          ) : null}
        </div>
      </div>

      {/* ── Card Body ── */}
      {isConnected ? (
        <div className="space-y-3 pt-4">
          {reauthRequired && (
            <div className="flex items-center gap-2 rounded-xl bg-casa-gold/10 p-3 text-body-sm text-casa-navy">
              <AlertCircle size={16} className="shrink-0 text-casa-gold" />
              <span>Google session expired. Please reconnect to resume sync and email scanning.</span>
            </div>
          )}

          {/* 1. Calendar Sync Row */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-casa-border/50 bg-casa-bg px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn('shrink-0', calendarActive ? 'text-casa-navy' : 'text-casa-muted')}>
                <Calendar size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-body-sm text-casa-navy leading-none">Google Calendar Sync</p>
                <p className="mt-1 text-caption text-casa-muted">
                  {calendarActive ? (
                    <>
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-green-500" />
                      {s.last_sync_at
                        ? `Synced ${formatDistanceToNow(new Date(s.last_sync_at))} ago`
                        : `Connected ${format(new Date(s.connected_at), 'MMM d, h:mm a')}`}
                    </>
                  ) : reauthRequired ? (
                    'Reauthorization needed'
                  ) : (
                    'Sync paused'
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <Chip tone={calendarActive ? 'success' : 'neutral'}>
                {calendarActive ? 'Active' : 'Inactive'}
              </Chip>
            </div>
          </div>

          {/* 2. Gmail Inbox Scan Row with Native Switch */}
          <div className="flex items-center justify-between gap-3 rounded-xl border border-casa-border/50 bg-casa-bg px-4 py-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className={cn('shrink-0', gmailActive ? 'text-casa-navy' : 'text-casa-muted')}>
                <Mail size={18} />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-body-sm text-casa-navy leading-none">Gmail Inbox Scan</p>
                <p className="mt-1 text-caption text-casa-muted">
                  {gmailActive ? (
                    <>
                      <span className="mr-1 inline-block size-1.5 rounded-full bg-green-500" />
                      {s.gmail_last_scan_success_at
                        ? `Checked ${formatDistanceToNow(new Date(s.gmail_last_scan_success_at))} ago`
                        : 'Active · Auto-importing event invitations'}
                    </>
                  ) : (
                    'Disabled · Auto-import off'
                  )}
                </p>
              </div>
            </div>
            <div className="shrink-0">
              <Switch
                label=""
                checked={gmailActive}
                onCheckedChange={(checked) => onToggleGmail(checked)}
                disabled={isBusy || reauthRequired}
                aria-label={`Toggle Gmail scanning for ${member.name}`}
              />
            </div>
          </div>

          {/* Context footnote */}
          <p className="px-1 text-caption text-casa-muted">
            {s.access_mode === 'writable'
              ? 'Casa-created and adopted events project automatically to this calendar.'
              : 'Events from this calendar stay read-only until explicitly adopted into Casa.'}
          </p>
        </div>
      ) : (
        /* ── Not Connected State ── */
        <div className="space-y-3 pt-4">
          <p className="text-caption text-casa-muted">
            Connect to synchronize calendar events and optionally auto-scan Gmail for invites:
          </p>

          <div className="space-y-2 rounded-xl border border-casa-border/50 bg-casa-bg p-3">
            {/* Calendar — always required */}
            <div className="flex items-center gap-2 opacity-80">
              <div className="flex size-4 shrink-0 items-center justify-center rounded border-2 border-casa-navy bg-casa-navy">
                <Check size={10} className="text-white" />
              </div>
              <span className="font-semibold text-body-sm text-casa-navy">Google Calendar Sync</span>
              <span className="rounded-full bg-casa-divider px-1.5 py-0.5 text-caption text-casa-muted">Required</span>
            </div>

            {/* Gmail — selectable toggle */}
            <Checkbox
              label="Gmail Inbox Scan"
              description="Automatically import invitations & confirmations from email"
              checked={wantGmail}
              onChange={(e) => setWantGmail(e.target.checked)}
            />
          </div>

          <Button
            variant="strong"
            onClick={() => onConnect(wantGmail)}
            disabled={isBusy}
            fullWidth
            className="mt-2"
            leadingIcon={<GoogleIcon />}
          >
            {isBusy ? 'Redirecting to Google…' : 'Connect Google Account'}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── Google logo icon (SVG) ─────────────────────────────────────────

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}
