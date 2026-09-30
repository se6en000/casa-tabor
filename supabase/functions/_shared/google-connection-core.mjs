export function googleConnectionPolicy(googleEmail, writableTargetEmail, customCalendarId) {
  const normalizedEmail = googleEmail.trim().toLowerCase()
  const normalizedTarget = writableTargetEmail.trim().toLowerCase()
  const writable = normalizedEmail === normalizedTarget
  return {
    googleEmail: normalizedEmail,
    calendarId: (customCalendarId && typeof customCalendarId === 'string' && customCalendarId.trim())
      ? customCalendarId.trim()
      : normalizedEmail,
    accessMode: writable ? 'writable' : 'read_only',
    adoptionPolicy: writable ? 'automatic' : 'explicit',
  }
}

export function isGoogleReauthorizationError(error) {
  const name = error instanceof Error ? error.name : ''
  const message = error instanceof Error ? error.message : String(error)
  return name === 'GOOGLE_REAUTHORIZATION_REQUIRED'
    || /invalid_grant|unauthorized_client|token has been expired or revoked/i.test(message)
}

/**
 * Which calendar a (re)connect syncs (Jake, 2026-09-29: reconnecting failed three times). An account
 * that already syncs a calendar keeps it — reconnecting only refreshes the sign-in; a first connection
 * takes the calendar found by name ("Casa Tabor"), else the account's own.
 */
export function reconnectCalendarId({ existing, email, discovered }) {
  const account = String(email ?? '').trim().toLowerCase()
  const kept = (existing ?? []).find((c) => String(c.google_email ?? '').trim().toLowerCase() === account && c.calendar_id)
  if (kept) return kept.calendar_id
  return discovered && String(discovered).trim() ? String(discovered).trim() : account
}
