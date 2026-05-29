import { createClient } from 'npm:@supabase/supabase-js@2'

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
    await sb.from('google_tokens').upsert(tokenRow)
    await sb.from('family_members').update({ email, google_calendar_id: email }).eq('id', familyMemberId)
    const returnPath = includesGmail ? '/settings/gmail-scan' : '/settings/calendars'
    return redir(APP.replace(/\/settings\/[^?]*/, returnPath) + '?connected=' + familyMemberId + (includesGmail ? '&gmail=1' : ''))
  } catch (err) {
    console.error(err)
    return redir(APP + '?error=exchange_failed')
  }
})
