import { createContext, useContext } from 'react'
import type { FamilyMember } from '../types'

export type ProfileSession = {
  memberId: string
  memberName: string
  token: string
}

export type ProfileSessionContextValue = {
  profile: ProfileSession | null
  unlock: (member: FamilyMember, pin: string) => Promise<void>
  /** Sign in with a session already checked (the sign-in screen checks the PIN, plays its way in, then adopts it). */
  adopt: (session: ProfileSession) => void
  signOut: () => void
}

export const ProfileSessionContext = createContext<ProfileSessionContextValue | null>(null)

export function useProfileSession() {
  const context = useContext(ProfileSessionContext)
  if (!context) throw new Error('useProfileSession must be used inside ProfileSessionProvider.')
  return context
}
