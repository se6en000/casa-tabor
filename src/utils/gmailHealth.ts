// Shared Gmail connection health summary -- the single source of truth for the
// at-a-glance health chip shown on Home and the Action & Activity Hub. Full detail
// (per-account reconnect flow, error codes) lives in Settings > Google Services;
// this just answers "is it broken right now, and do I need to do something?"
import type { ChipTone } from '../design-system/variants.mjs'

export interface GmailConnectionHealthRow {
  gmail_scan_enabled: boolean | null
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled' | null
  reauthorization_required: boolean | null
  last_sync_error: string | null
  last_sync_at: string | null
}

export type GmailHealthStatus = 'healthy' | 'stale' | 'error' | 'off'

export interface GmailHealthSummary {
  status: GmailHealthStatus
  label: string
  tone: ChipTone
  /** Only present when status !== 'off'; most recent sync across enabled accounts. */
  lastSyncAt: string | null
}

// Gmail is scanned by a cron job every 15 minutes (see
// supabase/migrations/20260607000100_cron_gmail_scan.sql). Allow 3x that interval
// before calling a silent (no-error) connection "stale" rather than "healthy",
// to absorb normal jitter/retries without false-alarming.
const STALE_AFTER_MS = 45 * 60 * 1000

export function summarizeGmailHealth(rows: GmailConnectionHealthRow[]): GmailHealthSummary {
  const enabled = rows.filter((r) => r.gmail_scan_enabled)

  if (enabled.length === 0) {
    return { status: 'off', label: 'Email scan off', tone: 'neutral', lastSyncAt: null }
  }

  const lastSyncTimes = enabled
    .map((r) => r.last_sync_at)
    .filter((v): v is string => !!v)
    .sort()
  const lastSyncAt = lastSyncTimes.at(-1) ?? null

  const needsReauth = enabled.some((r) => r.reauthorization_required || r.health_status === 'reauthorization_required')
  if (needsReauth) {
    return { status: 'error', label: 'Reconnect Gmail', tone: 'danger', lastSyncAt }
  }

  const hasError = enabled.some((r) => !!r.last_sync_error || r.health_status === 'degraded')
  if (hasError) {
    return { status: 'error', label: 'Gmail sync issue', tone: 'danger', lastSyncAt }
  }

  const isStale = !lastSyncAt || (Date.now() - new Date(lastSyncAt).getTime()) > STALE_AFTER_MS
  if (isStale) {
    return { status: 'stale', label: 'Gmail sync delayed', tone: 'warning', lastSyncAt }
  }

  return { status: 'healthy', label: 'Email sync OK', tone: 'success', lastSyncAt }
}
