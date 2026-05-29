/**
 * GmailScanPage
 * Per-member Gmail inbox scanning settings.
 * Allows each family member to enable auto-import of calendar events from Gmail.
 * Shows recently auto-imported events from each member's inbox.
 */

import { useState, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ChevronLeft, Mail, Check, AlertCircle, RefreshCw, Sparkles } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { formatDistanceToNow, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import { cn } from '../utils/cn'
import type { FamilyMember } from '../types'

// ── Types ─────────────────────────────────────────────────────────

interface GmailStatus {
  family_member_id: string
  google_email: string
  gmail_scan_enabled: boolean
  connected_at: string
  last_sync_at: string | null
}

interface ProcessedMessage {
  id: string
  family_member_id: string
  gmail_message_id: string
  subject: string
  from_email: string
  received_at: string | null
  created_event_id: string | null
  skipped_reason: string | null
  processed_at: string
  events?: { title: string; start_time: string } | null
}

// ── Hooks ─────────────────────────────────────────────────────────

function useGmailConnections() {
  return useQuery({
    queryKey: ['gmail-connections'],
    staleTime: 0,
    queryFn: async () => {
      const [{ data: members }, { data: statuses }] = await Promise.all([
        supabase.from('family_members').select('*').order('sort_order'),
        supabase.from('google_connection_status').select('*'),
      ])
      const byId = new Map((statuses ?? []).map((s: GmailStatus) => [s.family_member_id, s]))
      return (members ?? []).map((m: FamilyMember) => ({
        ...m,
        gmailStatus: byId.get(m.id) as GmailStatus | undefined,
      }))
    },
  })
}

function useProcessedMessages(limit = 20) {
  return useQuery({
    queryKey: ['gmail-processed', limit],
    queryFn: async () => {
      const { data } = await supabase
        .from('gmail_processed_messages')
        .select('*, events(title, start_time)')
        .order('processed_at', { ascending: false })
        .limit(limit)
      return (data ?? []) as ProcessedMessage[]
    },
  })
}

// ── Page ──────────────────────────────────────────────────────────

export default function GmailScanPage() {
  const [params, setParams] = useSearchParams()
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: members, isLoading, refetch } = useGmailConnections()
  const { data: messages, refetch: refetchMessages } = useProcessedMessages()

  const connected = params.get('connected')
  const gmail = params.get('gmail')
  const errorParam = params.get('error')

  useEffect(() => {
    if (connected || errorParam) {
      refetch()
      const t = setTimeout(() => {
        params.delete('connected')
        params.delete('error')
        params.delete('gmail')
        setParams(params, { replace: true })
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [connected, errorParam, params, refetch, setParams])

  // Enable Gmail for a member = re-auth with gmail scope
  const enableGmail = useMutation({
    mutationFn: async (memberId: string) => {
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: { family_member_id: memberId, include_gmail: true },
      })
      if (error || !data?.url) throw new Error('Failed to start OAuth')
      window.open(data.url as string, '_self')
    },
  })

  // Disable Gmail scanning for a member
  const disableGmail = useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('google_tokens')
        .update({ gmail_scan_enabled: false })
        .eq('family_member_id', memberId)
      if (error) throw error
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gmail-connections'] })
      refetch()
    },
  })

  async function runScan(memberId?: string) {
    setScanning(true)
    setScanResult(null)
    try {
      const { data, error } = await supabase.functions.invoke('scan-gmail-inbox', {
        body: memberId ? { family_member_id: memberId } : {},
      })
      if (error) throw error
      const results = data?.results ?? []
      const totalCreated = results.reduce((s: number, r: { created: number }) => s + r.created, 0)
      const totalScanned = results.reduce((s: number, r: { scanned: number }) => s + r.scanned, 0)
      setScanResult(`Scanned ${totalScanned} emails · ${totalCreated} event${totalCreated !== 1 ? 's' : ''} added`)
      await refetchMessages()
      qc.invalidateQueries({ queryKey: ['events'] })
    } catch (e) {
      setScanResult(`Error: ${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setScanning(false)
    }
  }

  const enabledCount = members?.filter(m => m.gmailStatus?.gmail_scan_enabled).length ?? 0

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link to="/settings" className="inline-flex items-center gap-1 text-body-sm text-casa-muted hover:text-casa-navy mb-4">
        <ChevronLeft size={16} /> Settings
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="font-display text-display-md text-casa-navy mb-1">Gmail Inbox Scan</h1>
          <p className="text-body text-casa-muted">
            Automatically detect appointments, bookings, and invites in Gmail and add them to the family calendar.
          </p>
        </div>
        {enabledCount > 0 && (
          <button
            type="button"
            onClick={() => runScan()}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60 transition-all shrink-0 ml-4"
          >
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} />
            {scanning ? 'Scanning…' : 'Scan Now'}
          </button>
        )}
      </div>

      {/* Status banners */}
      {connected && gmail && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-green-50 border border-green-200 text-green-800 text-body-sm mb-4">
          <Check size={16} /> Gmail access granted — scanning is now active.
        </div>
      )}
      {connected && !gmail && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-body-sm mb-4">
          <Check size={16} /> Connected. Click "Enable Gmail Scan" below to grant inbox access.
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

      {/* How it works */}
      <div className="bg-casa-surface border border-casa-border rounded-card p-4 mb-6 text-body-sm text-casa-muted space-y-1">
        <p className="font-semibold text-casa-navy">How it works</p>
        <p>• Checks Gmail every 5 minutes for new emails that look like calendar events</p>
        <p>• Detects: appointments, bookings, reservations, invitations, reminders, doctor visits, concerts, flights, school events, and more</p>
        <p>• Uses AI to extract the date, time, and location — then adds it directly to your calendar</p>
        <p>• Each family member grants read-only Gmail access (no email is sent or modified)</p>
      </div>

      {/* Family member cards */}
      <div className="space-y-3 mb-8">
        {isLoading ? (
          <p className="text-body-sm text-casa-muted">Loading…</p>
        ) : (
          members?.map(member => {
            const status = member.gmailStatus
            const hasGoogle = !!status?.google_email
            const gmailEnabled = !!status?.gmail_scan_enabled

            return (
              <div key={member.id} className="bg-casa-surface border border-casa-border rounded-card p-4 shadow-card">
                <div className="flex items-center gap-3">
                  {/* Avatar */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-body shrink-0"
                    style={{ backgroundColor: member.color_hex ?? '#2D3B4E' }}
                  >
                    {member.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-casa-navy text-body">{member.name}</p>
                    {status?.google_email && (
                      <p className="text-caption text-casa-muted truncate">{status.google_email}</p>
                    )}
                  </div>

                  {/* Status badge */}
                  <div className={cn(
                    'px-2.5 py-1 rounded-full text-caption font-semibold shrink-0',
                    gmailEnabled ? 'bg-green-100 text-green-700' : hasGoogle ? 'bg-amber-50 text-amber-700' : 'bg-casa-bg text-casa-muted'
                  )}>
                    {gmailEnabled ? '● Scanning' : hasGoogle ? '○ Not enabled' : 'No Google account'}
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-3 flex gap-2">
                  {!hasGoogle ? (
                    <p className="text-caption text-casa-muted">
                      Connect Google Calendar first in{' '}
                      <Link to="/settings/calendars" className="text-casa-navy underline">Calendar Settings</Link>.
                    </p>
                  ) : gmailEnabled ? (
                    <>
                      <button
                        type="button"
                        onClick={() => runScan(member.id)}
                        disabled={scanning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-casa-border text-body-sm text-casa-navy hover:bg-casa-bg disabled:opacity-60 transition-colors"
                      >
                        <RefreshCw size={13} className={scanning ? 'animate-spin' : ''} /> Scan now
                      </button>
                      <button
                        type="button"
                        onClick={() => disableGmail.mutate(member.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-body-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        Disable
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => enableGmail.mutate(member.id)}
                      disabled={enableGmail.isPending}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-casa-navy text-white text-body-sm font-semibold hover:bg-casa-navy/90 disabled:opacity-60 transition-all"
                    >
                      <Mail size={14} />
                      {enableGmail.isPending ? 'Redirecting…' : 'Enable Gmail Scan'}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* Recent activity log */}
      {(messages?.length ?? 0) > 0 && (
        <div>
          <h2 className="font-display text-heading text-casa-navy mb-3">Recent Activity</h2>
          <div className="space-y-2">
            {messages!.map(msg => {
              const isCreated = !!msg.created_event_id
              const memberName = members?.find(m => m.id === msg.family_member_id)?.name ?? ''

              return (
                <div key={msg.id} className={cn(
                  'bg-casa-surface border rounded-card px-4 py-3 shadow-card',
                  isCreated ? 'border-casa-border' : 'border-casa-border/50 opacity-70'
                )}>
                  <div className="flex items-start gap-3">
                    <div className={cn('mt-0.5 shrink-0', isCreated ? 'text-green-500' : 'text-casa-muted')}>
                      {isCreated ? <Sparkles size={15} /> : <Mail size={15} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-body-sm font-semibold text-casa-navy truncate">
                        {msg.subject || '(no subject)'}
                      </p>
                      <p className="text-caption text-casa-muted truncate">
                        {msg.from_email} · {memberName}
                      </p>
                      {isCreated && msg.events && (
                        <p className="text-caption text-green-600 mt-0.5">
                          → Added: <strong>{msg.events.title}</strong>
                          {msg.events.start_time && ` · ${format(new Date(msg.events.start_time), 'MMM d, h:mm a')}`}
                        </p>
                      )}
                      {!isCreated && msg.skipped_reason && (
                        <p className="text-caption text-casa-muted/70 mt-0.5 italic">{msg.skipped_reason}</p>
                      )}
                    </div>
                    <span className="text-caption text-casa-muted shrink-0">
                      {formatDistanceToNow(new Date(msg.processed_at), { addSuffix: true })}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
