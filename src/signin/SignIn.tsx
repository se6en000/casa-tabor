import { useCallback, useEffect, useMemo, useState } from 'react'
import { useProfileSession } from '../contexts/useProfileSession'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { invokeHistoryUnlock } from '../lib/assistantConversationHistoryClient'
import type { FamilyMember } from '../types'
import { pigmentIndexes } from '../wall/score'
import { faceIdAvailable, hasFaceId, markOfferedFaceId, setUpFaceId, signInWithFaceId, wasOfferedFaceId } from './passkey'
import { BackLink, Face, FaceIdGlyph, HouseMark, PinKeypad, PinRings } from './SignInParts'
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
  const [state, setState] = useState<'typing' | 'checking' | 'wrong' | 'offer' | 'right'>('typing')
  const [message, setMessage] = useState<string | null>(null)
  const [faceId, setFaceId] = useState<'none' | 'can' | 'has'>('none')
  const [token, setToken] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    void faceIdAvailable().then((ok) => { if (live) setFaceId(!ok ? 'none' : hasFaceId(member.id) ? 'has' : 'can') })
    return () => { live = false }
  }, [member.id])
  // The way in: the rings go brass and a ring draws round the face, then the day.
  const goIn = useCallback((t: string) => {
    setState('right')
    window.setTimeout(() => onIn(t), 950)
  }, [onIn])
  const check = useCallback(async (full: string) => {
    setState('checking')
    try {
      const { history_session_token: t } = await invokeHistoryUnlock(member.id, full)
      // Face ID, offered once after a right PIN on a phone that can do it (40c).
      if (faceId === 'can' && !wasOfferedFaceId(member.id)) {
        markOfferedFaceId(member.id)
        setToken(t)
        setState('offer')
        return
      }
      goIn(t)
    } catch (e) {
      setState('wrong')
      setMessage(wrongPinText(e instanceof Error ? e.message : '', resetters))
      window.setTimeout(() => { setPin(''); setState('typing') }, 650)
    }
  }, [member.id, resetters, faceId, goIn])
  const withFaceId = useCallback(async () => {
    setMessage(null)
    setState('checking')
    try {
      const t = await signInWithFaceId(member.id)
      if (t) goIn(t)
      else setState('typing')
    } catch (e) {
      setState('typing')
      setMessage(e instanceof Error ? e.message : 'Face ID didn’t work. Use your PIN.')
    }
  }, [member.id, goIn])
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
      <div className="mt-[14px]">
        <PinKeypad
          value={pin}
          onPress={press}
          onDelete={del}
          disabled={state === 'checking'}
          corner={faceId === 'has' ? (
            <button type="button" aria-label="Use Face ID" onClick={() => void withFaceId()} className="flex h-[78px] w-[78px] items-center justify-center justify-self-center rounded-full border-0 bg-transparent p-0 text-wall-brass active:scale-[0.94]">
              <FaceIdGlyph className="h-[34px] w-[34px]" />
            </button>
          ) : null}
        />
      </div>
      {state === 'offer' && token && (
        <FaceIdOffer
          onYes={async () => {
            try { await setUpFaceId(member.id, token) } catch { /* the PIN still works; nothing to say */ }
            goIn(token)
          }}
          onNo={() => goIn(token)}
        />
      )}
      {onNotMe && (
        <button type="button" onClick={onNotMe} className="mt-[16px] min-h-[44px] border-0 bg-transparent font-body text-phone-body font-medium text-wall-brass-ink">Not {member.name}?</button>
      )}
    </Ground>
  )
}

/** After the first right PIN on a phone that can: "Use Face ID next time?" — once (40c). */
function FaceIdOffer({ onYes, onNo }: { onYes: () => Promise<void>; onNo: () => void }) {
  const [busy, setBusy] = useState(false)
  return (
    <div className="fixed inset-0 flex items-end bg-wall-ink/30 p-[10px] motion-safe:animate-[signin-rise_0.3s_ease-out_both]">
      <div role="dialog" aria-label="Use Face ID next time?" className="mx-auto w-full max-w-[420px] rounded-[34px] bg-phone-ground px-[26px] pb-[max(22px,env(safe-area-inset-bottom))] pt-[30px] text-center">
        <FaceIdGlyph className="mx-auto h-[64px] w-[64px] text-wall-brass" />
        <h2 className="m-0 mt-[16px] font-display text-phone-title font-semibold text-wall-ink">Use Face ID next time?</h2>
        <p className="m-0 mt-[8px] font-body text-phone-detail text-wall-ink-2">Your face opens your day on this phone. Your PIN still works.</p>
        <button type="button" disabled={busy} onClick={() => { setBusy(true); void onYes() }} className="mt-[22px] min-h-[54px] w-full rounded-full border-0 bg-wall-ink font-body text-phone-body font-semibold text-phone-ground disabled:opacity-60">Use Face ID</button>
        <button type="button" disabled={busy} onClick={onNo} className="mt-[6px] min-h-[48px] w-full border-0 bg-transparent font-body text-phone-body font-medium text-wall-ink-2">Not now</button>
      </div>
    </div>
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
