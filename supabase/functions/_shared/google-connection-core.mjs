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
