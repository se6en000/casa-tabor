// Google Calendar API helpers shared across Edge Functions.

export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

export function buildConsentUrl(opts: {
  clientId: string
  redirectUri: string
  state: string
}): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state: opts.state,
    include_granted_scopes: 'true',
  })
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export interface TokenResponse {
  access_token: string
  refresh_token?: string
  expires_in: number
  scope: string
  token_type: string
}

export async function exchangeCodeForTokens(opts: {
  code: string
  clientId: string
  clientSecret: string
  redirectUri: string
}): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) throw new Error(`Token exchange failed: ${await res.text()}`)
  return res.json()
}

export async function refreshAccessToken(opts: {
  refreshToken: string
  clientId: string
  clientSecret: string
}): Promise<TokenResponse> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: opts.refreshToken,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) throw new Error(`Token refresh failed: ${await res.text()}`)
  return res.json()
}

export async function fetchUserEmail(accessToken: string): Promise<string> {
  const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  if (!res.ok) throw new Error('Failed to fetch userinfo')
  const json = await res.json()
  return json.email
}

export interface GoogleEvent {
  id: string
  status: string
  summary?: string
  description?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
  attendees?: { email: string; responseStatus?: string }[]
  updated: string
}

export interface ListEventsResult {
  items: GoogleEvent[]
  nextSyncToken?: string
  nextPageToken?: string
}

export async function listCalendarEvents(opts: {
  accessToken: string
  calendarId?: string
  syncToken?: string
  timeMin?: string
  timeMax?: string
  pageToken?: string
}): Promise<ListEventsResult> {
  const calendarId = opts.calendarId ?? 'primary'
  const params = new URLSearchParams({ singleEvents: 'true', maxResults: '250' })
  if (opts.syncToken) {
    params.set('syncToken', opts.syncToken)
  } else {
    if (opts.timeMin) params.set('timeMin', opts.timeMin)
    if (opts.timeMax) params.set('timeMax', opts.timeMax)
    params.set('orderBy', 'startTime')
  }
  if (opts.pageToken) params.set('pageToken', opts.pageToken)

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`,
    { headers: { authorization: `Bearer ${opts.accessToken}` } },
  )
  if (!res.ok) throw new Error(`Calendar list failed: ${res.status} ${await res.text()}`)
  return res.json()
}

export async function patchGoogleEvent(opts: {
  accessToken: string
  calendarId: string
  eventId: string
  patch: {
    summary?: string
    description?: string
    location?: string
    start?: { dateTime?: string; date?: string }
    end?: { dateTime?: string; date?: string }
  }
}): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`,
    {
      method: 'PATCH',
      headers: { authorization: `Bearer ${opts.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(opts.patch),
    },
  )
  const responseText = await res.text()
  if (!res.ok) throw new Error(`Calendar patch failed: ${res.status} ${responseText}`)
}

export async function deleteGoogleEvent(opts: {
  accessToken: string
  calendarId: string
  eventId: string
}): Promise<void> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events/${encodeURIComponent(opts.eventId)}`,
    {
      method: 'DELETE',
      headers: { authorization: `Bearer ${opts.accessToken}` },
    },
  )
  // 404 = already gone — treat as success
  if (!res.ok && res.status !== 404) throw new Error(`Calendar delete failed: ${res.status} ${await res.text()}`)
}

export async function createGoogleEvent(opts: {
  accessToken: string
  calendarId: string
  event: {
    summary: string
    description?: string
    location?: string
    start: { dateTime: string }
    end: { dateTime: string }
  }
}): Promise<{ id: string }> {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(opts.calendarId)}/events`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${opts.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify(opts.event),
    },
  )
  if (!res.ok) throw new Error(`Calendar create failed: ${res.status} ${await res.text()}`)
  return res.json()
}
