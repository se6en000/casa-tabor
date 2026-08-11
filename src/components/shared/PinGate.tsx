import { useState, type ReactNode } from 'react'
import { KeyRound, UserRound } from 'lucide-react'

import { useProfileSession, ProfileSessionProvider } from '../../contexts/ProfileSessionContext'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { invokeAssistantHistory, unlockAdmin } from '../../lib/assistantConversationHistoryClient'
import { Alert, Button, Card, Field, Heading, Input, Select, Skeleton, Text } from '../ui'
import type { FamilyMember } from '../../types'

function ProfileUnlockGate({ children }: { children: ReactNode }) {
  const { profile, unlock } = useProfileSession()
  const { data: family = [], isLoading, error: familyError } = useFamilyMembers()
  const [selectedMember, setSelectedMember] = useState<FamilyMember | null>(null)
  const [pin, setPin] = useState('')
  const [unlocking, setUnlocking] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [managingPins, setManagingPins] = useState(false)

  if (profile) return <>{children}</>

  if (managingPins) {
    return <FamilyPinEnrollment onDone={() => setManagingPins(false)} />
  }

  const chooseMember = (member: FamilyMember | null) => {
    setSelectedMember(member)
    setPin('')
    setError(null)
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!selectedMember) return
    setUnlocking(true)
    setError(null)
    try {
      await unlock(selectedMember, pin)
    } catch (unlockError) {
      setPin('')
      setError(unlockError instanceof Error ? unlockError.message : 'Casa could not open this profile.')
    } finally {
      setUnlocking(false)
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center bg-casa-bg px-page-gutter py-8">
      <Card tone="surface" padding="lg" className="w-full max-w-xl">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-casa-gold/10 text-casa-gold">
            <UserRound size={24} />
          </span>
          <Heading role="display-sm" className="mt-4">Who is using Casa?</Heading>
          <Text role="body" muted className="mt-2">
            Choose your profile to keep your conversations private and personal on this device.
          </Text>
        </div>

        {isLoading && <div className="mt-6 space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
        {familyError && <Alert tone="danger" title="Family profiles are unavailable" className="mt-6">Refresh and try again.</Alert>}
        {!isLoading && !familyError && !selectedMember && (
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {family.map((member) => (
              <Button key={member.id} variant="secondary" fullWidth align="start" onClick={() => chooseMember(member)}>
                <span className="flex min-w-0 flex-col text-left">
                  <span className="truncate">{member.name}</span>
                  <span className="text-caption font-normal text-casa-muted">{member.role}</span>
                </span>
              </Button>
            ))}
          </div>
        )}
        {!isLoading && !familyError && family.length === 0 && (
          <Alert tone="warning" title="No family profiles yet" className="mt-6">Add a family member in Settings before signing in.</Alert>
        )}
        {selectedMember && (
          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div className="flex items-center justify-between gap-3">
              <Text role="body-sm">Signing in as <strong>{selectedMember.name}</strong></Text>
              <Button variant="ghost" size="sm" type="button" onClick={() => chooseMember(null)}>Choose someone else</Button>
            </div>
            <Field label={`${selectedMember.name}'s PIN`} error={error}>
              <Input
                autoFocus
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="[0-9]{6,12}"
                value={pin}
                onChange={(event) => setPin(event.target.value)}
                placeholder="6 to 12 digits"
                required
              />
            </Field>
            <Button type="submit" fullWidth leadingIcon={<KeyRound size={16} />} loading={unlocking}>
              Open {selectedMember.name}'s Casa
            </Button>
          </form>
        )}
        {!selectedMember && (
          <Button variant="ghost" fullWidth className="mt-5" onClick={() => setManagingPins(true)}>
            Manage family PINs
          </Button>
        )}
      </Card>
    </div>
  )
}

function FamilyPinEnrollment({ onDone }: { onDone: () => void }) {
  const { data: family = [], isLoading, error: familyError } = useFamilyMembers()
  const [adminPin, setAdminPin] = useState('')
  const [adminToken, setAdminToken] = useState<string | null>(null)
  const [selectedMemberId, setSelectedMemberId] = useState('')
  const [memberPin, setMemberPin] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const unlock = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      setAdminToken(await unlockAdmin(adminPin))
      setAdminPin('')
    } catch (unlockError) {
      setAdminPin('')
      setError(unlockError instanceof Error ? unlockError.message : 'Casa could not unlock household admin access.')
    } finally {
      setSaving(false)
    }
  }

  const saveMemberPin = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!adminToken || !selectedMemberId) return
    setSaving(true)
    setError(null)
    try {
      await invokeAssistantHistory(adminToken, {
        action: 'set_member_pin',
        member_id: selectedMemberId,
        pin: memberPin,
      })
      setMemberPin('')
      onDone()
    } catch (saveError) {
      setMemberPin('')
      setError(saveError instanceof Error ? saveError.message : 'Casa could not save this PIN.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="app-shell flex min-h-screen items-center justify-center bg-casa-bg px-page-gutter py-8">
      <Card tone="surface" padding="lg" className="w-full max-w-xl">
        <Heading role="display-sm">Manage family PINs</Heading>
        <Text role="body" muted className="mt-2">Household-admin access is required before setting or changing a member PIN.</Text>
        {familyError && <Alert tone="danger" title="Family profiles are unavailable" className="mt-6">Refresh and try again.</Alert>}
        {isLoading && <div className="mt-6 space-y-3"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>}
        {!isLoading && !familyError && !adminToken && (
          <form className="mt-6 space-y-4" onSubmit={unlock}>
            <Field label="Household-admin PIN" error={error}>
              <Input autoFocus type="password" inputMode="numeric" autoComplete="current-password" pattern="[0-9]{6,12}" value={adminPin} onChange={(event) => setAdminPin(event.target.value)} placeholder="6 to 12 digits" required />
            </Field>
            <Button type="submit" fullWidth loading={saving}>Unlock family PIN management</Button>
          </form>
        )}
        {!isLoading && !familyError && adminToken && (
          <form className="mt-6 space-y-4" onSubmit={saveMemberPin}>
            <Field label="Family member" error={error}>
              <Select value={selectedMemberId} onChange={(event) => setSelectedMemberId(event.target.value)} required>
                <option value="" disabled>Choose a family member</option>
                {family.map((member) => <option key={member.id} value={member.id}>{member.name}</option>)}
              </Select>
            </Field>
            <Field label="New member PIN">
              <Input type="password" inputMode="numeric" autoComplete="new-password" pattern="[0-9]{6,12}" value={memberPin} onChange={(event) => setMemberPin(event.target.value)} placeholder="6 to 12 digits" required />
            </Field>
            <Button type="submit" fullWidth loading={saving} disabled={!selectedMemberId}>Save member PIN</Button>
          </form>
        )}
        <Button variant="ghost" fullWidth className="mt-5" onClick={onDone}>Back to profile sign-in</Button>
      </Card>
    </div>
  )
}

export default function PinGate({ children }: { children: ReactNode }) {
  return (
    <ProfileSessionProvider>
      <ProfileUnlockGate>{children}</ProfileUnlockGate>
    </ProfileSessionProvider>
  )
}
