export const PROFILE_SESSION_STORAGE_KEY: string

export type NormalizedProfileSession = {
  memberId: string
  memberName: string
  token: string
}

export function normalizeProfileSession(value: unknown): NormalizedProfileSession | null
