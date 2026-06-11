/**
 * GoogleServicesPage
 *
 * Combined Google Services settings — Calendar sync + Gmail Inbox Scan.
 * One auth flow per family member, with checkboxes to select which services
 * to enable. Shows live green status + last activity timestamp per service.
 */

import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  ChevronLeft, Calendar, Mail, Check, AlertCircle,
  RefreshCw, Unlink, Sparkles,
} from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { FamilyMember } from '../types'
import BounceScroll from '../components/shared/BounceScroll'

// ── Types ─────────────────────────────────────────────────────────

interface GoogleStatus {
  family_member_id: string
  google_email: string
  connected_at: string
  last_sync_at: string | null
  last_sync_error: string | null
  gmail_scan_enabled: boolean
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
      // Most recent Gmail scan per member
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
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
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

  // Connect / re-auth
  const connectGoogle = useMutation({
    mutationFn: async ({ memberId, includeGmail }: { memberId: string; includeGmail: boolean }) => {
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: { family_member_id: memberId, include_gmail: includeGmail },
      })
      if (error || !data?.url) throw new Error('Failed to start OAuth')
      window.open(data.url as string, '_self')
    },
  })

  // Toggle Gmail scan on/off via Edge Function (service role needed to write google_tokens)
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

  // Disconnect
  const disconnect = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.functions.invoke('disconnect-calendar', {
        body: { family_member_id: memberId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['google-services'] })
      refetch()
    },
  })

  // Sync calendar now
  const syncCalendar = useMutation({
    mutationFn: async (memberId: string) => {
      // Run calendar sync and Gmail scan in parallel — one button does both
      const [calResult, gmailResult] = await Promise.allSettled([
        supabase.functions.invoke('sync-calendars', { body: { family_member_id: memberId } }),
        supabase.functions.invoke('scan-gmail-inbox', { body: { family_member_id: memberId } }),
      ])
      if (calResult.status === 'rejected') throw calResult.reason
      if (calResult.value.error) throw calResult.value.error
      if (gmailResult.status === 'fulfilled' && !gmailResult.value.error) {
        const results = gmailResult.value.data?.results ?? []
        const created = results.reduce((s: number, r: { created: number }) => s + r.created, 0)
        const scanned = results.reduce((s: number, r: { scanned: number }) => s + r.scanned, 0)
        setScanResult(`Scanned ${scanned} emails · ${created} event${created !== 1 ? 's' : ''} added`)
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['google-services'] })
      qc.invalidateQueries({ queryKey: ['events'] })
      refetch()
    },
  })

  // Scan Gmail now
  async function runGmailScan(memberId: string) {
    setScanning(true)
    setScanResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('scan-gmail-inbox', {
        body: { family_member_id: memberId },
      })
      if (error) throw error
      const results = data?.results ?? []
      const created = results.reduce((s: number, r: { created: number }) => s + r.created, 0)
      const scanned = results.reduce((s: number, r: { scanned: number }) => s + r.scanned, 0)
      setScanResult(`Scanned ${scanned} emails · ${created} event${created !== 1 ? 's' : ''} added`)
      refetch()
      qc.invalidateQueries({ queryKey: ['events'] })
    } catch (e) {
      setScanResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setScanning(false)
    }
  }

  return (
    <BounceScroll className="flex-1">
      <div className="max-w-2xl mx-auto p-6">
        <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
          <ChevronLeft size={16} /> Settings
        </Link>

        <h1 className="font-display text-display-md text-casa-navy mb-1">Google Services</h1>
        <p className="text-body text-casa-muted mb-6">
          Connect each family member's Google account to enable calendar sync and Gmail inbox scanning.
        </p>

        {/* Status banners */}
        {connectedParam && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-body-sm mb-4">
            <Check size={16} />
            {gmailParam ? 'Connected — Calendar sync and Gmail scan are now active.' : 'Connected — Calendar sync is now active.'}
          </div>
        )}
        {errorParam && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-body-sm mb-4">
            <AlertCircle size={16} /> {errorParam.replace(/_/g, ' ')}
          </div>
        )}
        {scanResult && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-casa-gold/10 border border-casa-gold/30 text-casa-navy text-body-sm mb-4">
            <Sparkles size={16} className="text-casa-gold" /> {scanResult}
          </div>
        )}

        {/* Member cards */}
        <div className="space-y-4">
          {isLoading ? (
            <p className="text-body-sm text-casa-muted">Loading…</p>
          ) : (
            members?.map(member => (
              <MemberCard
                key={member.id}
                member={member}
                onConnect={(includeGmail) => connectGoogle.mutate({ memberId: member.id, includeGmail })}
                onToggleGmail={(enabled) => toggleGmail.mutate({ memberId: member.id, enabled })}
                onSyncCalendar={() => syncCalendar.mutate(member.id)}
                onScanGmail={() => runGmailScan(member.id)}
                onDisconnect={() => disconnect.mutate(member.id)}
                isBusy={
                  (connectGoogle.isPending && (connectGoogle.variables as { memberId: string })?.memberId === member.id) ||
                  (disconnect.isPending && disconnect.variables === member.id) ||
                  (syncCalendar.isPending && syncCalendar.variables === member.id) ||
                  scanning
                }
              />
            ))
          )}
        </div>
      </div>
    </BounceScroll>
  )
}

// ── Member card ────────────────────────────────────────────────────

function MemberCard({
  member, onConnect, onToggleGmail, onSyncCalendar, onScanGmail, onDisconnect, isBusy,
}: {
  member: MemberWithStatus
  onConnect: (includeGmail: boolean) => void
  onToggleGmail: (enabled: boolean) => void
  onSyncCalendar: () => void
  onScanGmail: () => void
  onDisconnect: () => void
  isBusy: boolean
}) {
  const s = member.status
  const isConnected = !!s?.google_email
  const calendarActive = isConnected
  const gmailActive = isConnected && !!s?.gmail_scan_enabled
  const [wantGmail, setWantGmail] = useState(true)

  return (
    <div className="bg-casa-surface border border-casa-border rounded-card p-5 shadow-card">
      {/* Header row */}
      <div className="flex items-center gap-3 mb-4">
        <div
          className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-body shrink-0"
          style={{ backgroundColor: member.color_hex ?? '#2D3B4E' }}
        >
          {member.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-casa-navy text-body leading-none">{member.name}</p>
          {s?.google_email && (
            <p className="text-caption text-casa-muted mt-0.5 truncate">{s.google_email}</p>
          )}
        </div>
        {isConnected && (
          <button
            onClick={onDisconnect}
            disabled={isBusy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-caption text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
            title="Disconnect Google account"
          >
            <Unlink size={12} /> Disconnect
          </button>
        )}
      </div>

      {isConnected ? (
        /* ── Connected: show status rows ── */
        <div className="space-y-3">
          {/* Calendar row */}
          <ServiceRow
            icon={<Calendar size={14} />}
            label="Google Calendar"
            active={calendarActive}
            statusText={calendarActive
              ? (s?.last_sync_at
                  ? `synced ${formatDistanceToNow(new Date(s.last_sync_at))} ago`
                  : `connected ${format(new Date(s!.connected_at), 'MMM d, h:mm a')}`)
              : 'Not active'}
            errorText={s?.last_sync_error ?? undefined}
            action={
              <button
                onClick={onSyncCalendar}
                disabled={isBusy}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-casa-border text-caption text-casa-navy hover:bg-casa-bg disabled:opacity-50 transition-colors"
                title="Sync now"
              >
                <RefreshCw size={11} className={isBusy ? 'animate-spin' : ''} /> Sync now
              </button>
            }
          />

          {/* Gmail row */}
          <ServiceRow
            icon={<Mail size={14} />}
            label="Gmail Inbox Scan"
            active={gmailActive}
            statusText={gmailActive
              ? (member.lastGmailScan
                  ? `last scanned ${formatDistanceToNow(new Date(member.lastGmailScan))} ago`
                  : 'enabled — no scans yet')
              : 'Not enabled'}
            action={
              gmailActive ? (
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={onScanGmail}
                    disabled={isBusy}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-casa-border text-caption text-casa-navy hover:bg-casa-bg disabled:opacity-50 transition-colors"
                    title="Scan now"
                  >
                    <RefreshCw size={11} className={isBusy ? 'animate-spin' : ''} /> Scan now
                  </button>
                  <button
                    onClick={() => onToggleGmail(false)}
                    disabled={isBusy}
                    className="px-2.5 py-1 rounded-lg border border-red-200 text-caption text-red-500 hover:bg-red-50 disabled:opacity-50 transition-colors"
                  >
                    Disable
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => onToggleGmail(true)}
                  disabled={isBusy}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-casa-navy text-white text-caption font-semibold hover:bg-casa-navy/90 disabled:opacity-50 transition-colors"
                >
                  <Mail size={11} /> Enable
                </button>
              )
            }
          />
        </div>
      ) : (
        /* ── Not connected: checkbox selection + connect button ── */
        <div className="space-y-3">
          <p className="text-caption text-casa-muted">Choose which services to enable, then connect:</p>

          {/* Calendar — always required */}
          <label className="flex items-center gap-3 cursor-not-allowed opacity-70">
            <div className="w-4 h-4 rounded border-2 border-casa-gold bg-casa-gold flex items-center justify-center shrink-0">
              <Check size={10} className="text-white" />
            </div>
            <div className="flex items-center gap-2">
              <Calendar size={14} className="text-casa-muted" />
              <span className="text-body-sm text-casa-navy font-semibold">Google Calendar</span>
              <span className="text-[10px] text-casa-muted bg-casa-divider px-1.5 py-0.5 rounded-full">Required</span>
            </div>
          </label>

          {/* Gmail — optional */}
          <label className="flex items-center gap-3 cursor-pointer group">
            <div
              className={cn(
                'w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
                wantGmail ? 'border-casa-gold bg-casa-gold' : 'border-casa-border bg-white group-hover:border-casa-gold/50',
              )}
              onClick={() => setWantGmail(v => !v)}
            >
              {wantGmail && <Check size={10} className="text-white" />}
            </div>
            <div className="flex items-center gap-2" onClick={() => setWantGmail(v => !v)}>
              <Mail size={14} className="text-casa-muted" />
              <span className="text-body-sm text-casa-navy">Gmail Inbox Scan</span>
              <span className="text-caption text-casa-muted">Auto-import events from email</span>
            </div>
          </label>

          <button
            onClick={() => onConnect(wantGmail)}
            disabled={isBusy}
            className="mt-1 w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60 transition-all"
          >
            <GoogleIcon />
            {isBusy ? 'Redirecting…' : 'Connect Google Account'}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Service status row ─────────────────────────────────────────────

function ServiceRow({
  icon, label, active, statusText, errorText, action,
}: {
  icon: React.ReactNode
  label: string
  active: boolean
  statusText: string
  errorText?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-casa-bg border border-casa-border/50">
      <div className={cn('shrink-0', active ? 'text-casa-navy' : 'text-casa-muted')}>{icon}</div>
      <div className="flex-1 min-w-0">
        <p className={cn('text-body-sm font-semibold leading-none', active ? 'text-casa-navy' : 'text-casa-muted')}>
          {label}
        </p>
        <p className={cn('text-[11px] mt-0.5', active ? 'text-green-600' : 'text-casa-muted')}>
          {active && <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1 mb-px" />}
          {statusText}
        </p>
        {errorText && <p className="text-[11px] text-casa-error mt-0.5">{errorText}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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
