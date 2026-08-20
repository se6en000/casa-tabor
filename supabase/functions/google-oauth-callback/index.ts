import { createClient } from 'npm:@supabase/supabase-js@2'
import { googleConnectionPolicy } from '../_shared/google-connection-core.mjs'

const TARGET_SYNC_GOOGLE_EMAIL = (Deno.env.get('GOOGLE_SYNC_TARGET_EMAIL') ?? 'jacobrtabor@gmail.com').toLowerCase()

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const stateRaw = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')
  const APP = Deno.env.get('APP_RETURN_URL')!
  const redir = (to: string) => new Response(null, { status: 302, headers: { location: to } })
  if (errorParam) return redir(APP + '?error=' + encodeURIComponent(errorParam))
  if (!code || !stateRaw) return redir(APP + '?error=missing_params')
  let familyMemberId: string
  let includesGmail = false
  try {
    const state = JSON.parse(atob(stateRaw))
    familyMemberId = state.m
    includesGmail = !!state.gmail
  } catch { return redir(APP + '?error=bad_state') }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, client_id: Deno.env.get('GOOGLE_CLIENT_ID')!, client_secret: Deno.env.get('GOOGLE_CLIENT_SECRET')!, redirect_uri: Deno.env.get('GOOGLE_REDIRECT_URI')!, grant_type: 'authorization_code' }) })
    const tokens = await tokenRes.json()
    if (!tokens.access_token) return redir(APP + '?error=exchange_failed')
    const emailRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', { headers: { authorization: 'Bearer ' + tokens.access_token } })
    const { email } = await emailRes.json()
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)
    // Google only returns refresh_token on first consent — keep the existing one if not provided
    let refreshToken = tokens.refresh_token
    if (!refreshToken) {
      const { data: existing } = await sb.from('google_tokens').select('refresh_token').eq('family_member_id', familyMemberId).single()
      refreshToken = existing?.refresh_token
    }
    if (!refreshToken) return redir(APP + '?error=no_refresh_token')
    const tokenRow: Record<string, unknown> = { family_member_id: familyMemberId, google_email: email, refresh_token: refreshToken, access_token: tokens.access_token, expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(), scope: tokens.scope, updated_at: new Date().toISOString() }
    // Enable Gmail scan if gmail scope was granted (either via gmail flow or standard connect)
    const hasGmailScope = (tokens.scope ?? '').includes('gmail') || includesGmail
    if (hasGmailScope) tokenRow.gmail_scan_enabled = true
    // Auto-discover if a calendar named "Casa Tabor" exists in this Google account
    let targetCalendarId = normalizedEmail
    try {
      const calListRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=writer', {
        headers: { authorization: 'Bearer ' + tokens.access_token },
      })
      if (calListRes.ok) {
        const calList = await calListRes.json()
        const casaCal = (calList.items ?? []).find((c: any) =>
          (c.summaryOverride || c.summary || '').trim().toLowerCase() === 'casa tabor'
        )
        if (casaCal?.id) {
          targetCalendarId = casaCal.id
        }
      }
    } catch (e) {
      console.warn('[google-oauth-callback] calendarList auto-discovery notice:', e)
    }

    const policy = googleConnectionPolicy(String(email), TARGET_SYNC_GOOGLE_EMAIL, targetCalendarId)
    const normalizedEmail = policy.googleEmail
    const { error: tokenError } = await sb.from('google_tokens').upsert({
      ...tokenRow,
      google_email: normalizedEmail,
    })
    if (tokenError) throw new Error(`Could not store Google authorization: ${tokenError.message}`)

    const now = new Date().toISOString()
    const { error: disableError } = await sb
      .from('calendar_connections')
      .update({
        is_enabled: false,
        health_status: 'disabled',
        health_checked_at: now,
      })
      .eq('family_member_id', familyMemberId)
      .neq('google_email', normalizedEmail)
      .eq('is_enabled', true)
    if (disableError) throw new Error(`Could not replace prior calendar connection: ${disableError.message}`)

    const { error: connectionError } = await sb.from('calendar_connections').upsert({
      family_member_id: familyMemberId,
      google_email: normalizedEmail,
      calendar_id: policy.calendarId,
      access_mode: policy.accessMode,
      adoption_policy: policy.adoptionPolicy,
      is_enabled: true,
      health_status: 'connected',
      health_checked_at: now,
      last_sync_error: null,
      last_error_at: null,
      last_error_code: null,
      updated_at: now,
    }, { onConflict: 'google_email,calendar_id' })
    if (connectionError) throw new Error(`Could not normalize calendar connection: ${connectionError.message}`)

    const { error: memberError } = await sb
      .from('family_members')
      .update({ email: normalizedEmail, google_calendar_id: normalizedEmail })
      .eq('id', familyMemberId)
    if (memberError) throw new Error(`Could not update family member connection: ${memberError.message}`)
    const returnPath = '/settings/google'
    return redir(APP.replace(/\/settings\/[^?]*/, returnPath) + '?connected=' + familyMemberId + (includesGmail ? '&gmail=1' : ''))
  } catch (err) {
    console.error(err)
    return redir(APP + '?error=exchange_failed')
  }
})
