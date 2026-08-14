import { useState, type ReactNode } from 'react'
import { Delete, KeyRound, Sparkles, ArrowLeft, ShieldCheck } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

import { useProfileSession, ProfileSessionProvider } from '../../contexts/ProfileSessionContext'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { invokeAssistantHistory, unlockAdmin } from '../../lib/assistantConversationHistoryClient'
import { Alert, Button, Skeleton } from '../ui'
import type { FamilyMember } from '../../types'
import { cn } from '../../utils/cn'

const DEFAULT_MEMBER_COLOR = 'var(--color-casa-gold)'

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

  const submitUnlock = async (overridePin?: string) => {
    if (!selectedMember) return
    const pinToSubmit = overridePin ?? pin
    if (pinToSubmit.length < 4) return

    setUnlocking(true)
    setError(null)
    try {
      await unlock(selectedMember, pinToSubmit)
    } catch (unlockError) {
      setPin('')
      setError(unlockError instanceof Error ? unlockError.message : 'Casa could not open this profile.')
    } finally {
      setUnlocking(false)
    }
  }

  const handleKeypadPress = (digit: string) => {
    if (pin.length < 12) {
      const nextPin = `${pin}${digit}`
      setPin(nextPin)
      setError(null)
      if (nextPin.length === 6) {
        submitUnlock(nextPin)
      }
    }
  }

  return (
    <div className="relative min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-casa-navy to-slate-900 p-4 sm:p-6 overflow-hidden">
      {/* ── Ambient Background Glow Orbs ── */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-casa-gold/15 rounded-full blur-3xl pointer-events-none animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

      {/* ── Main Glassmorphic Container Card ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 15 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="relative z-10 w-full max-w-lg bg-slate-900/85 border border-white/15 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-8 text-white flex flex-col items-center"
      >
        <AnimatePresence mode="wait">
          {!selectedMember ? (
            /* ── STEP 1: Profile Selection Grid ── */
            <motion.div
              key="select-profile"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center text-center"
            >
              <div className="w-14 h-14 rounded-2xl bg-casa-gold/20 border border-casa-gold/40 text-casa-gold flex items-center justify-center shadow-lg shadow-casa-gold/10 mb-4">
                <Sparkles size={26} />
              </div>

              <h1 className="font-display text-display-xs sm:text-display-sm font-bold text-white tracking-tight">
                Who is using Casa?
              </h1>
              <p className="text-body-sm text-white/70 mt-1.5 max-w-sm">
                Select your profile to access your personalized private dashboard.
              </p>

              {isLoading && (
                <div className="mt-8 grid grid-cols-2 gap-4 w-full">
                  <Skeleton className="h-28 w-full rounded-2xl bg-white/10" />
                  <Skeleton className="h-28 w-full rounded-2xl bg-white/10" />
                </div>
              )}

              {familyError && (
                <Alert tone="danger" title="Profiles Unavailable" className="mt-6 w-full text-left">
                  Refresh the page and try again.
                </Alert>
              )}

              {!isLoading && !familyError && family.length > 0 && (
                <div className="mt-7 grid grid-cols-2 gap-3.5 w-full">
                  {family.map((member) => (
                    <motion.div
                      key={member.id}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={() => chooseMember(member)}
                      className="group flex flex-col items-center justify-center p-4 rounded-2xl bg-white/5 border border-white/10 hover:border-casa-gold/50 hover:bg-white/10 transition-all cursor-pointer min-h-[120px] text-center relative overflow-hidden"
                    >
                      {/* Avatar Circle with Dynamic Accent Ring */}
                      <div
                        className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg text-white shadow-md border-2 transition-transform group-hover:scale-105"
                        style={{
                          backgroundColor: 'rgba(255, 255, 255, 0.1)',
                          borderColor: member.color_hex || DEFAULT_MEMBER_COLOR,
                          color: member.color_hex || DEFAULT_MEMBER_COLOR,
                        }}
                      >
                        {member.name.charAt(0).toUpperCase()}
                      </div>

                      <span className="font-display font-bold text-body text-white mt-2.5 truncate max-w-[120px]">
                        {member.name}
                      </span>
                      <span className="text-caption text-white/50 capitalize font-medium mt-0.5">
                        {member.role || 'Family Member'}
                      </span>
                    </motion.div>
                  ))}
                </div>
              )}

              {!isLoading && !familyError && family.length === 0 && (
                <Alert tone="warning" title="No Family Profiles" className="mt-6 w-full text-left">
                  Add a family member in Settings to set up your profiles.
                </Alert>
              )}

              <Button
                variant="ghost"
                onClick={() => setManagingPins(true)}
                className="mt-6 text-white/60 hover:text-white hover:bg-white/10 min-h-control rounded-xl gap-2"
              >
                <ShieldCheck size={16} />
                <span>Manage Family PINs</span>
              </Button>
            </motion.div>
          ) : (
            /* ── STEP 2: Selected Profile PIN Entry ── */
            <motion.div
              key="enter-pin"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
              className="w-full flex flex-col items-center"
            >
              {/* Back to Profile Selector Header */}
              <div className="w-full flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => chooseMember(null)}
                  leadingIcon={<ArrowLeft size={16} />}
                  className="text-white/70 hover:text-white hover:bg-white/10 min-h-control"
                >
                  Choose someone else
                </Button>
                <span className="text-caption text-casa-gold font-semibold uppercase tracking-wider">
                  PIN Required
                </span>
              </div>

              {/* Selected Member Glowing Avatar Halo */}
              <div className="relative mb-3">
                <div
                  className="w-20 h-20 rounded-full flex items-center justify-center font-display font-bold text-2xl text-white border-2 shadow-xl"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.1)',
                    borderColor: selectedMember.color_hex || DEFAULT_MEMBER_COLOR,
                    color: selectedMember.color_hex || DEFAULT_MEMBER_COLOR,
                  }}
                >
                  {selectedMember.name.charAt(0).toUpperCase()}
                </div>
              </div>

              <h2 className="font-display text-heading-md font-bold text-white tracking-tight">
                Signing in as {selectedMember.name}
              </h2>
              <p className="text-caption text-white/60 mt-1">
                Enter {selectedMember.name}'s PIN to unlock
              </p>

              {/* Error Alert Display */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="w-full mt-3 p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-body-sm font-medium text-center"
                >
                  {error}
                </motion.div>
              )}

              {/* Glowing Animated PIN Slot Dot Array */}
              <motion.div
                animate={error ? { x: [-10, 10, -8, 8, -4, 4, 0] } : {}}
                transition={{ duration: 0.4 }}
                className="w-full flex items-center justify-center gap-3 my-6 py-2"
              >
                {Array.from({ length: 6 }).map((_, idx) => {
                  const isFilled = idx < pin.length
                  const isActive = idx === pin.length
                  return (
                    <motion.div
                      key={idx}
                      animate={{ scale: isFilled ? 1.15 : isActive ? [1, 1.1, 1] : 1 }}
                      transition={{ duration: 0.25, repeat: isActive ? Infinity : 0 }}
                      className={cn(
                        'w-4 h-4 rounded-full border transition-all duration-200',
                        isFilled
                          ? 'bg-casa-gold border-casa-gold shadow-md'
                          : isActive
                          ? 'border-casa-gold bg-casa-gold/20'
                          : 'border-white/30 bg-white/5'
                      )}
                    />
                  )
                })}
              </motion.div>

              {/* Tactile Keypad */}
              <PinKeypad
                value={pin}
                onPress={handleKeypadPress}
                onDelete={() => {
                  setPin(pin.slice(0, -1))
                  setError(null)
                }}
                disabled={unlocking}
              />

              {/* Submit Action Button */}
              <Button
                variant="primary"
                fullWidth
                loading={unlocking}
                disabled={unlocking || pin.length < 4}
                onClick={() => submitUnlock()}
                leadingIcon={!unlocking ? <KeyRound size={18} /> : undefined}
                className="mt-6 min-h-[52px] bg-gradient-to-r from-casa-gold via-amber-400 to-amber-500 text-casa-navy font-bold rounded-2xl text-body shadow-lg shadow-casa-gold/20 hover:brightness-110"
              >
                Open {selectedMember.name}'s Casa
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
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
    <div className="relative min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-slate-950 via-casa-navy to-slate-900 p-4 sm:p-6 overflow-hidden">
      <div className="relative z-10 w-full max-w-md bg-slate-900/85 border border-white/15 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-8 text-white">
        <h2 className="font-display text-heading-md font-bold text-white tracking-tight">
          Manage Family PINs
        </h2>
        <p className="text-body-sm text-white/70 mt-1">
          Household-admin access is required before setting or changing a member PIN.
        </p>

        {familyError && (
          <Alert tone="danger" title="Profiles Unavailable" className="mt-6">
            Refresh and try again.
          </Alert>
        )}

        {isLoading && (
          <div className="mt-6 space-y-3">
            <Skeleton className="h-14 w-full bg-white/10 rounded-xl" />
            <Skeleton className="h-14 w-full bg-white/10 rounded-xl" />
          </div>
        )}

        {!isLoading && !familyError && !adminToken && (
          <form className="mt-6 space-y-5" onSubmit={unlock}>
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-body-sm">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label className="text-caption font-semibold text-white/80">Household-admin PIN</label>
              <div className="flex justify-center my-3">
                <PinKeypad
                  value={adminPin}
                  onPress={(digit) => adminPin.length < 12 && setAdminPin(`${adminPin}${digit}`)}
                  onDelete={() => setAdminPin(adminPin.slice(0, -1))}
                  disabled={saving}
                />
              </div>
            </div>
            <Button type="submit" fullWidth loading={saving} className="bg-casa-gold text-casa-navy font-bold min-h-control rounded-xl">
              Unlock Admin Settings
            </Button>
          </form>
        )}

        {!isLoading && !familyError && adminToken && (
          <form className="mt-6 space-y-4" onSubmit={saveMemberPin}>
            {error && (
              <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-200 text-body-sm">
                {error}
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-caption font-semibold text-white/80">Family Member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                required
                className="w-full min-h-control px-4 rounded-xl bg-white/10 border border-white/20 text-white font-medium focus:outline-none focus:border-casa-gold"
              >
                <option value="" disabled className="bg-slate-900 text-white">
                  Choose a family member
                </option>
                {family.map((member) => (
                  <option key={member.id} value={member.id} className="bg-slate-900 text-white">
                    {member.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-caption font-semibold text-white/80">New Member PIN</label>
              <PinKeypad
                value={memberPin}
                onPress={(digit) => memberPin.length < 12 && setMemberPin(`${memberPin}${digit}`)}
                onDelete={() => setMemberPin(memberPin.slice(0, -1))}
                disabled={saving}
              />
            </div>

            <Button
              type="submit"
              fullWidth
              loading={saving}
              disabled={!selectedMemberId || memberPin.length < 4}
              className="bg-casa-gold text-casa-navy font-bold min-h-control rounded-xl mt-4"
            >
              Save Member PIN
            </Button>
          </form>
        )}

        <Button
          variant="ghost"
          fullWidth
          className="mt-5 text-white/60 hover:text-white hover:bg-white/10 rounded-xl"
          onClick={onDone}
        >
          Back to Profile Sign-In
        </Button>
      </div>
    </div>
  )
}

function PinKeypad({
  value,
  onPress,
  onDelete,
  disabled = false,
}: {
  value: string
  onPress: (digit: string) => void
  onDelete: () => void
  disabled?: boolean
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5 w-full max-w-xs mx-auto" aria-label="PIN Keypad">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
        <Button
          key={digit}
          variant="secondary"
          type="button"
          disabled={disabled}
          onClick={() => onPress(digit)}
          className="h-14 min-h-[56px] rounded-2xl bg-white/5 border-white/10 text-white font-display text-2xl font-bold flex items-center justify-center transition-all cursor-pointer select-none hover:bg-white/15"
        >
          {digit}
        </Button>
      ))}

      {/* Empty Spacer Slot */}
      <div className="h-14 min-h-[56px]" aria-hidden="true" />

      {/* Zero Key */}
      <Button
        variant="secondary"
        type="button"
        disabled={disabled}
        onClick={() => onPress('0')}
        className="h-14 min-h-[56px] rounded-2xl bg-white/5 border-white/10 text-white font-display text-2xl font-bold flex items-center justify-center transition-all cursor-pointer select-none hover:bg-white/15"
      >
        0
      </Button>

      {/* Delete / Backspace Key */}
      <Button
        variant="secondary"
        type="button"
        disabled={disabled || value.length === 0}
        onClick={onDelete}
        aria-label="Delete PIN digit"
        className={cn(
          'h-14 min-h-[56px] rounded-2xl border flex items-center justify-center transition-all cursor-pointer select-none',
          value.length > 0
            ? 'bg-rose-500/15 border-rose-500/30 text-rose-300 hover:bg-rose-500/25'
            : 'bg-white/5 border-white/5 text-white/20 cursor-not-allowed'
        )}
      >
        <Delete size={22} />
      </Button>
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
