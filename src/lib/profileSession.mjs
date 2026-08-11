export const PROFILE_SESSION_STORAGE_KEY = 'casa_tabor_profile_session'

export function normalizeProfileSession(value) {
  if (!value || typeof value !== 'object') return null
  const { memberId, memberName, token } = value
  if (
    typeof memberId !== 'string' || !memberId.trim() ||
    typeof memberName !== 'string' || !memberName.trim() ||
    typeof token !== 'string' || !token.trim()
  ) {
    return null
  }
  return { memberId, memberName, token }
}
