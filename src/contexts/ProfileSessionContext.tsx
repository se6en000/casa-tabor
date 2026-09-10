import { useCallback, useState, type ReactNode } from 'react'

import { invokeHistoryUnlock } from '../lib/assistantConversationHistoryClient'
import { normalizeProfileSession, PROFILE_SESSION_STORAGE_KEY } from '../lib/profileSession.mjs'
import type { FamilyMember } from '../types'
import { ProfileSessionContext, type ProfileSession } from './useProfileSession'

function readStoredProfile(): ProfileSession | null {
  try {
    const raw = localStorage.getItem(PROFILE_SESSION_STORAGE_KEY)
    return raw ? normalizeProfileSession(JSON.parse(raw)) : null
  } catch {
    return null
  }
}

export function ProfileSessionProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<ProfileSession | null>(readStoredProfile)

  const unlock = useCallback(async (member: FamilyMember, pin: string) => {
    const result = await invokeHistoryUnlock(member.id, pin)
    const nextProfile = {
      memberId: member.id,
      memberName: member.name,
      token: result.history_session_token,
    }
    try {
      localStorage.setItem(PROFILE_SESSION_STORAGE_KEY, JSON.stringify(nextProfile))
    } catch {
      throw new Error('Casa could not keep this profile signed in on this device.')
    }
    setProfile(nextProfile)
  }, [])

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(PROFILE_SESSION_STORAGE_KEY)
    } catch {
      // State still clears in this running app even when browser storage is unavailable.
    }
    setProfile(null)
  }, [])

  return (
    <ProfileSessionContext.Provider value={{ profile, unlock, signOut }}>
      {children}
    </ProfileSessionContext.Provider>
  )
}
