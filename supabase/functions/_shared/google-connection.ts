import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { refreshAccessToken } from './google.ts'
import { isGoogleReauthorizationError } from './google-connection-core.mjs'

export interface CalendarConnection {
  id: string
  family_member_id: string
  google_email: string
  calendar_id: string
  access_mode: 'writable' | 'read_only'
  adoption_policy: 'automatic' | 'explicit' | 'none'
  is_enabled: boolean
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled'
  sync_token: string | null
  recurrence_sync_token: string | null
}

export interface GoogleToken {
  family_member_id: string
  google_email: string
  refresh_token: string
  access_token: string | null
  expires_at: string | null
}

export interface ResolvedGoogleConnection {
  connection: CalendarConnection
  token: GoogleToken
  accessToken: string
}

function connectionError(code: string, message: string): Error {
  const error = new Error(message)
  error.name = code
  return error
}

async function loadToken(
  sb: SupabaseClient,
  connection: CalendarConnection,
): Promise<GoogleToken> {
  const { data: token, error } = await sb
    .from('google_tokens')
    .select('family_member_id, google_email, refresh_token, access_token, expires_at')
    .eq('family_member_id', connection.family_member_id)
    .maybeSingle()

  if (error) throw connectionError('GOOGLE_TOKEN_LOOKUP_FAILED', error.message)
  if (!token) {
    throw connectionError(
      'GOOGLE_REAUTHORIZATION_REQUIRED',
      `Google authorization is missing for ${connection.google_email}. Reconnect this account.`,
    )
  }
  if (token.google_email.toLowerCase() !== connection.google_email.toLowerCase()) {
    throw connectionError(
      'GOOGLE_CONNECTION_IDENTITY_MISMATCH',
      'The Google authorization no longer matches its calendar connection.',
    )
  }
  return token as GoogleToken
}

export async function markGoogleConnectionFailure(
  sb: SupabaseClient,
  connectionId: string,
  error: Error,
): Promise<void> {
  const reauthorizationRequired = isGoogleReauthorizationError(error)
  const now = new Date().toISOString()
  const { error: updateError } = await sb
    .from('calendar_connections')
    .update({
      health_status: reauthorizationRequired ? 'reauthorization_required' : 'degraded',
      health_checked_at: now,
      last_error_at: now,
      last_error_code: reauthorizationRequired ? 'reauthorization_required' : error.name,
      last_sync_error: error.message,
    })
    .eq('id', connectionId)
  if (updateError) {
    console.error('[google-connection] could not persist connection failure:', updateError.message)
  }
}

export async function markGoogleConnectionHealthy(
  sb: SupabaseClient,
  connectionId: string,
  fields: Record<string, unknown> = {},
): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await sb
    .from('calendar_connections')
    .update({
      health_status: 'healthy',
      health_checked_at: now,
      last_success_at: now,
      last_sync_error: null,
      last_error_at: null,
      last_error_code: null,
      ...fields,
    })
    .eq('id', connectionId)
  if (error) throw connectionError('GOOGLE_CONNECTION_HEALTH_UPDATE_FAILED', error.message)
}

export async function resolveGoogleConnection(
  sb: SupabaseClient,
  connection: CalendarConnection,
): Promise<ResolvedGoogleConnection> {
  try {
    const token = await loadToken(sb, connection)
    let accessToken = token.access_token
    if (!accessToken || !token.expires_at || new Date(token.expires_at).getTime() < Date.now() + 60_000) {
      const refreshed = await refreshAccessToken({
        refreshToken: token.refresh_token,
        clientId: Deno.env.get('GOOGLE_CLIENT_ID')!,
        clientSecret: Deno.env.get('GOOGLE_CLIENT_SECRET')!,
      })
      accessToken = refreshed.access_token
      const { error } = await sb
        .from('google_tokens')
        .update({
          access_token: refreshed.access_token,
          expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('family_member_id', token.family_member_id)
      if (error) throw connectionError('GOOGLE_TOKEN_UPDATE_FAILED', error.message)
    }
    return { connection, token, accessToken }
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause))
    await markGoogleConnectionFailure(sb, connection.id, error)
    throw error
  }
}

export async function loadWritableGoogleConnection(
  sb: SupabaseClient,
): Promise<ResolvedGoogleConnection> {
  const { data, error } = await sb
    .from('calendar_connections')
    .select('*')
    .eq('is_enabled', true)
    .eq('access_mode', 'writable')
    .eq('adoption_policy', 'automatic')
    .maybeSingle()
  if (error) throw connectionError('GOOGLE_WRITABLE_CONNECTION_LOOKUP_FAILED', error.message)
  if (!data) {
    throw connectionError(
      'GOOGLE_WRITABLE_CONNECTION_MISSING',
      'No writable Google Calendar connection is configured.',
    )
  }
  return resolveGoogleConnection(sb, data as CalendarConnection)
}

export async function loadMemberGoogleConnection(
  sb: SupabaseClient,
  familyMemberId: string,
): Promise<ResolvedGoogleConnection> {
  const { data, error } = await sb
    .from('calendar_connections')
    .select('*')
    .eq('family_member_id', familyMemberId)
    .eq('is_enabled', true)
    .maybeSingle()
  if (error) throw connectionError('GOOGLE_MEMBER_CONNECTION_LOOKUP_FAILED', error.message)
  if (!data) {
    throw connectionError(
      'GOOGLE_MEMBER_CONNECTION_MISSING',
      'No enabled Google Calendar connection exists for this family member.',
    )
  }
  return resolveGoogleConnection(sb, data as CalendarConnection)
}
