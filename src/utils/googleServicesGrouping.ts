type GoogleServiceStatusLike = {
  google_email?: string | null
  is_enabled?: boolean | null
  reauthorization_required?: boolean | null
  gmail_scan_enabled?: boolean | null
}

export type GoogleServiceMemberLike = {
  id: string
  sort_order: number
  status: GoogleServiceStatusLike | null
}

export function isActiveGoogleServiceMember(member: GoogleServiceMemberLike): boolean {
  const status = member.status
  return !!status?.google_email && status.is_enabled !== false && !status.reauthorization_required
}

export function isGmailActiveMember(member: GoogleServiceMemberLike): boolean {
  return isActiveGoogleServiceMember(member) && !!member.status?.gmail_scan_enabled
}

export function isCalendarOnlyMember(member: GoogleServiceMemberLike): boolean {
  return isActiveGoogleServiceMember(member) && !member.status?.gmail_scan_enabled
}

export function splitGoogleServiceMembers<T extends GoogleServiceMemberLike>(members: readonly T[]) {
  const ordered = [...members].sort((a, b) => a.sort_order - b.sort_order)
  const gmailActiveMembers = ordered.filter((member) => isGmailActiveMember(member))
  const calendarOnlyMembers = ordered.filter((member) => isCalendarOnlyMember(member))
  const activeMembers = [...gmailActiveMembers, ...calendarOnlyMembers]
  const inactiveMembers = ordered.filter((member) => !isActiveGoogleServiceMember(member))

  return { gmailActiveMembers, calendarOnlyMembers, activeMembers, inactiveMembers }
}
