import { useCallback, useMemo, useState } from 'react'
import { useProfileSession } from '../contexts/useProfileSession'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { invokeHistoryUnlock } from '../lib/assistantConversationHistoryClient'
import type { FamilyMember } from '../types'
import { pigmentIndexes } from '../wall/score'
import { BackLink, Face, HouseMark, PinKeypad, PinRings } from './SignInParts'
import { greeting, PIN_LENGTH, rememberedMember, rememberMember, signInPeople, wrongPinText } from './signin'

const store = typeof localStorage === 'undefined' ? null : localStorage

/**
 * Signing in (canvas 40a–40c): who's this, your PIN, the way in. This phone remembers its person, so most days it opens
 * straight to "Good morning, Jake" and the PIN.
 */
export default function SignIn({ onFamilyPins }: { onFamilyPins: () => void }) {
  const { adopt } = useProfileSession()
  const { data: family = [], isLoading, error: familyError } = useFamilyMembers()
  const people = useMemo(() => signInPeople(family), [family])
  const pigments = useMemo(() => pigmentIndexes(family as never), [family])
  const resetters = useMemo(() => family.filter((m) => m.is_admin).map((m) => m.name), [family])
  const [chosen, setChosen] = useState<FamilyMember | null>(null)
  const [picking, setPicking] = useState(false)
  const remembered = useMemo(() => {
    const id = rememberedMember(store)
    return id ? people.find((m) => m.id === id) ?? null : null
  }, [people])
  const member = chosen ?? (picking ? null : remembered)

  if (isLoading) return <Ground><div className="mt-[30vh] h-[72px] w-[72px]"><HouseMark className="h-full w-full" /></div></Ground>
  if (familyError) return <Ground><Note>The family couldn’t be loaded. Close the app and open it again.</Note></Ground>
  if (member) {
    return (
      <PinStep
        key={member.id}
        member={member}
        pigment={pigments.get(member.id) ?? 0}
        title={member === remembered && !chosen ? greeting(member.name, new Date()) : member.name}
        resetters={resetters}
        onBack={member === remembered && !chosen ? null : () => { setChosen(null); setPicking(true) }}
        onNotMe={member === remembered && !chosen ? () => setPicking(true) : null}
        onIn={(token) => {
          rememberMember(store, member.id)
          adopt({ memberId: member.id, memberName: member.name, token })
        }}
      />
    )
  }
  return (
    <Ground>
      <div className="mt-[max(18px,env(safe-area-inset-top))] h-[76px] w-[76px] motion-safe:animate-[signin-rise_0.4s_ease-out_both]"><HouseMark className="h-full w-full" /></div>
      <h1 className="m-0 mt-[18px] font-display text-phone-magnified font-semibold text-wall-ink">Who’s this?</h1>
      <p className="m-0 mt-[6px] font-body text-phone-body text-wall-ink-2">Tap your name.</p>
      {people.length === 0 && <Note>Nobody’s been added yet. Add the family in Settings.</Note>}
      <div className="mt-[28px] grid grid-cols-[repeat(2,140px)] gap-x-[34px] gap-y-[22px]">
        {people.map((m) => (
          <button key={m.id} type="button" onClick={() => { setChosen(m); setPicking(false) }} className="flex flex-col items-center gap-[10px] border-0 bg-transparent p-0 active:scale-[0.96] transition-transform">
            <Face name={m.name} pigment={pigments.get(m.id) ?? 0} />
            <span className="font-display text-phone-heading font-semibold text-wall-ink">{m.name}</span>
          </button>
        ))}
      </div>
      <button type="button" onClick={onFamilyPins} className="mb-[max(24px,env(safe-area-inset-bottom))] mt-auto min-h-[44px] border-0 bg-transparent pt-[28px] font-body text-phone-label font-semibold uppercase tracking-[0.16em] text-wall-brass-ink">
        Family PINs
      </button>
    </Ground>
  )
}

function PinStep({ member, pigment, title, resetters, onBack, onNotMe, onIn }: {
  member: FamilyMember; pigment: number; title: string; resetters: string[]
  onBack: (() => void) | null; onNotMe: (() => void) | null; onIn: (token: string) => void
}) {
  const [pin, setPin] = useState('')
  const [state, setState] = useState<'typing' | 'checking' | 'wrong' | 'right'>('typing')
  const [message, setMessage] = useState<string | null>(null)
  const check = useCallback(async (full: string) => {
    setState('checking')
    try {
      const { history_session_token: token } = await invokeHistoryUnlock(member.id, full)
      setState('right')
      // The way in: the rings go brass and a ring draws round the face, then the day.
      window.setTimeout(() => onIn(token), 950)
    } catch (e) {
      setState('wrong')
      setMessage(wrongPinText(e instanceof Error ? e.message : '', resetters))
      window.setTimeout(() => { setPin(''); setState('typing') }, 650)
    }
  }, [member.id, onIn, resetters])
  const press = useCallback((d: string) => {
    if (state !== 'typing' || pin.length >= PIN_LENGTH) return
    const next = `${pin}${d}`
    setMessage(null)
    setPin(next)
    if (next.length === PIN_LENGTH) void check(next)
  }, [state, pin, check])
  const del = useCallback(() => { if (state === 'typing') setPin((p) => p.slice(0, -1)) }, [state])

  if (state === 'right') {
    return (
      <Ground>
        <div className="mt-[22vh]"><Face name={member.name} pigment={pigment} size="lg" drawing /></div>
        <h1 className="m-0 mt-[28px] font-display text-phone-title font-semibold text-wall-ink">{title.startsWith('Good') ? title : greeting(member.name, new Date())}</h1>
        <div className="mt-[22px]"><PinRings filled={PIN_LENGTH} state="right" /></div>
        <p className="m-0 mt-[24px] font-display text-phone-heading italic text-wall-ink-2 motion-safe:animate-[signin-rise_0.5s_ease-out_0.2s_both]">Opening your day…</p>
      </Ground>
    )
  }
  return (
    <Ground>
      {onBack && <BackLink label="Everyone" onClick={onBack} />}
      <div className="mt-[max(64px,calc(env(safe-area-inset-top)+44px))]"><Face name={member.name} pigment={pigment} size="lg" ringed /></div>
      <h1 className="m-0 mt-[16px] text-center font-display text-phone-title font-semibold text-wall-ink">{title}</h1>
      <div className="mt-[10px] font-body text-phone-label font-semibold uppercase tracking-[0.22em] text-wall-brass-ink">Your PIN</div>
      <div className="mt-[22px]"><PinRings filled={pin.length} state={state === 'wrong' ? 'wrong' : 'typing'} /></div>
      <p role="alert" className={`m-0 mt-[14px] min-h-[22px] max-w-[320px] text-center font-body text-phone-detail ${message ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{message ?? ''}</p>
      <div className="mt-[14px]"><PinKeypad value={pin} onPress={press} onDelete={del} disabled={state === 'checking'} /></div>
      {onNotMe && (
        <button type="button" onClick={onNotMe} className="mt-[16px] min-h-[44px] border-0 bg-transparent font-body text-phone-body font-medium text-wall-brass-ink">Not {member.name}?</button>
      )}
    </Ground>
  )
}

export function Ground({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 overflow-y-auto bg-phone-ground font-body text-wall-ink">
      <div className="relative mx-auto flex min-h-full max-w-[440px] flex-col items-center px-[20px] pb-[24px]">{children}</div>
    </div>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return <p className="m-0 mt-[24px] max-w-[320px] text-center font-body text-phone-body text-wall-ink-2">{children}</p>
}
