import { useEffect, useState, type ReactNode } from 'react'
import { ProfileSessionProvider } from '../../contexts/ProfileSessionContext'
import { useProfileSession } from '../../contexts/useProfileSession'
import { finishSplash } from '../../phone/splash'
import FamilyPins from '../../signin/FamilyPins'
import SignIn from '../../signin/SignIn'

/** Signed out: Tabor House's sign-in (canvas row 40) — who's this, your PIN, the way in — or Family PINs behind it. */
function ProfileUnlockGate({ children }: { children: ReactNode }) {
  const { profile } = useProfileSession()
  const [familyPins, setFamilyPins] = useState(false)
  // Signed out: the loading mark (39a) gives way to the sign-in at once.
  useEffect(() => { if (!profile) finishSplash() }, [profile])
  if (profile) return <>{children}</>
  return familyPins ? <FamilyPins onDone={() => setFamilyPins(false)} /> : <SignIn onFamilyPins={() => setFamilyPins(true)} />
}

export default function PinGate({ children }: { children: ReactNode }) {
  return (
    <ProfileSessionProvider>
      <ProfileUnlockGate>{children}</ProfileUnlockGate>
    </ProfileSessionProvider>
  )
}
