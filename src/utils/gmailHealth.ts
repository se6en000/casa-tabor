// Shared Gmail connection health summary -- the single source of truth for the
// at-a-glance health chip shown on Home and the Action & Activity Hub. Full detail
// (per-account reconnect flow, error codes) lives in Settings > Google Services;
// this just answers "is it broken right now, and do I need to do something?"
import type { ChipTone } from '../design-system/variants.mjs'

export interface GmailConnectionHealthRow {
  family_member_id?: string
  google_email?: string | null
  gmail_scan_enabled: boolean | null
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled' | null
  reauthorization_required: boolean | null
  last_sync_error: string | null
  last_sync_at: string | null
  gmail_last_scan_attempt_at?: string | null
  gmail_last_scan_success_at?: string | null
  gmail_last_scan_error?: string | null
}

export type GmailHealthStatus = 'healthy' | 'stale' | 'error' | 'off'

export interface GmailHealthSummary {
  status: GmailHealthStatus
  label: string
  tone: ChipTone
  /** Only present when status !== 'off'; most recent sync across enabled accounts. */
  lastSyncAt: string | null
  /** True whenever Gmail sync is broken, degraded, or not responding (status === 'error' | 'stale'). */
  isDown: boolean
  /** User-friendly explanation of the sync state for banners or modals. */
  description?: string
  /** Error detail from the server or auth provider if present. */
  errorMessage?: string | null
}

// Gmail is scanned by a cron job every 15 minutes (see
// supabase/migrations/20260607000100_cron_gmail_scan.sql). Allow 3x that interval
// before calling a silent (no-error) connection "stale" rather than "healthy",
// to absorb normal jitter/retries without false-alarming.
const STALE_AFTER_MS = 45 * 60 * 1000

export function summarizeGmailHealth(rows: GmailConnectionHealthRow[]): GmailHealthSummary {
  const enabled = rows.filter((r) => r.gmail_scan_enabled)

  if (enabled.length === 0) {
    return {
      status: 'off',
      label: 'Email scan off',
      tone: 'neutral',
      lastSyncAt: null,
      isDown: false,
      description: 'Gmail scanning is disabled for all family accounts.',
    }
  }

  const lastSyncTimes = enabled
    .map((r) => r.gmail_last_scan_success_at ?? r.last_sync_at)
    .filter((v): v is string => !!v)
    .sort()
  const lastSyncAt = lastSyncTimes.at(-1) ?? null

  const needsReauth = enabled.some((r) => r.reauthorization_required || r.health_status === 'reauthorization_required')
  if (needsReauth) {
    const errorMsg = enabled.find((r) => r.reauthorization_required || r.health_status === 'reauthorization_required')?.last_sync_error ?? null
    return {
      status: 'error',
      label: 'Reconnect Gmail',
      tone: 'danger',
      lastSyncAt,
      isDown: true,
      description: 'Google account authorization expired or was revoked. Reconnect in Settings to resume sync.',
      errorMessage: errorMsg,
    }
  }

  const hasError = enabled.some((r) => !!r.last_sync_error || r.health_status === 'degraded' || !!r.gmail_last_scan_error)
  if (hasError) {
    const errorRow = enabled.find((r) => !!r.last_sync_error || !!r.gmail_last_scan_error || r.health_status === 'degraded')
    const errorMsg = errorRow?.gmail_last_scan_error ?? errorRow?.last_sync_error ?? null
    return {
      status: 'error',
      label: 'Gmail sync issue',
      tone: 'danger',
      lastSyncAt,
      isDown: true,
      description: 'Gmail synchronization is failing or degraded. Check Google Services settings.',
      errorMessage: errorMsg,
    }
  }

  const isStale = !lastSyncAt || (Date.now() - new Date(lastSyncAt).getTime()) > STALE_AFTER_MS
  if (isStale) {
    return {
      status: 'stale',
      label: 'Gmail sync delayed',
      tone: 'warning',
      lastSyncAt,
      isDown: true,
      description: 'Gmail sync has not responded in over 45 minutes. Automatic event scanning may be delayed.',
    }
  }

  return {
    status: 'healthy',
    label: 'Email sync OK',
    tone: 'success',
    lastSyncAt,
    isDown: false,
    description: 'Gmail inbox scan is connected and actively monitoring for family events.',
  }
}
