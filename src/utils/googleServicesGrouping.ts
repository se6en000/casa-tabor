type GoogleServiceStatusLike = {
  google_email?: string | null
  is_enabled?: boolean | null
  reauthorization_required?: boolean | null
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

export function splitGoogleServiceMembers<T extends GoogleServiceMemberLike>(members: readonly T[]) {
  const ordered = [...members].sort((a, b) => a.sort_order - b.sort_order)
  const activeMembers = ordered.filter((member) => isActiveGoogleServiceMember(member))
  const inactiveMembers = ordered.filter((member) => !isActiveGoogleServiceMember(member))

  return { activeMembers, inactiveMembers }
}
