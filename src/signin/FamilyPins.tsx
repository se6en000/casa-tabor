import { useCallback, useEffect, useMemo, useState } from 'react'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { invokeAssistantHistory, unlockAdmin } from '../lib/assistantConversationHistoryClient'
import type { FamilyMember } from '../types'
import { pigmentIndexes } from '../wall/score'
import { Ground } from './SignIn'
import { BackLink, Face, HouseMark, PinKeypad, PinRings } from './SignInParts'
import { nextNewPin, PIN_LENGTH, signInPeople, type NewPinStep } from './signin'

/**
 * Family PINs (canvas 40d): behind the household PIN, everyone with whether they have a PIN; Set or Change; a new PIN
 * typed twice. Replaces the old dropdown form ("Manage family PINs").
 */
export default function FamilyPins({ onDone }: { onDone: () => void }) {
  const { data: family = [] } = useFamilyMembers()
  const people = useMemo(() => signInPeople(family), [family])
  const pigments = useMemo(() => pigmentIndexes(family as never), [family])
  const [token, setToken] = useState<string | null>(null)
  const [hasPin, setHasPin] = useState<Set<string> | null>(null)
  const [editing, setEditing] = useState<FamilyMember | null>(null)
  const [saved, setSaved] = useState<string | null>(null)

  useEffect(() => {
    if (!token) return
    invokeAssistantHistory<{ member_ids: string[] }>(token, { action: 'list_member_pins' })
      .then((r) => setHasPin(new Set(r.member_ids)), () => setHasPin(new Set()))
  }, [token])

  if (!token) return <HouseholdPin onBack={onDone} onUnlocked={setToken} />
  if (editing) {
    return (
      <NewPin
        member={editing}
        pigment={pigments.get(editing.id) ?? 0}
        token={token}
        onBack={() => setEditing(null)}
        onSaved={() => {
          setHasPin((s) => new Set([...(s ?? []), editing.id]))
          setSaved(`${editing.name}’s PIN is set.`)
          setEditing(null)
        }}
      />
    )
  }
  return (
    <Ground>
      <BackLink label="Sign in" onClick={onDone} />
      <div className="mt-[max(96px,calc(env(safe-area-inset-top)+76px))] w-full">
        <div className="font-body text-phone-label font-semibold uppercase tracking-[0.22em] text-wall-brass-ink">Household</div>
        <h1 className="m-0 mt-[8px] font-display text-phone-magnified font-semibold text-wall-ink">Family PINs</h1>
        <p className="m-0 mt-[6px] font-body text-phone-detail text-wall-ink-2">Each person’s six-digit PIN for their phone.</p>
        {saved && <p role="status" className="m-0 mt-[12px] font-body text-phone-body font-medium text-wall-brass-ink">{saved}</p>}
        <ul className="m-0 mt-[14px] list-none p-0">
          {people.map((m) => {
            const set = hasPin?.has(m.id)
            return (
              <li key={m.id} className="border-0 border-b border-solid border-wall-rule">
                <button type="button" onClick={() => { setSaved(null); setEditing(m) }} className="flex min-h-[80px] w-full items-center gap-[16px] border-0 bg-transparent p-0 text-left">
                  <Face name={m.name} pigment={pigments.get(m.id) ?? 0} size="sm" />
                  <span className="flex flex-1 flex-col">
                    <span className="font-display text-phone-heading font-semibold text-wall-ink">{m.name}</span>
                    <span className={`font-body text-phone-detail ${hasPin && !set ? 'text-wall-rust' : 'text-wall-ink-2'}`}>{hasPin === null ? ' ' : set ? 'PIN set' : 'No PIN yet'}</span>
                  </span>
                  <span className="font-body text-phone-detail font-semibold text-wall-brass-ink">{set ? 'Change' : 'Set'}</span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </Ground>
  )
}

/** The household PIN (6 to 12 digits), the same rings and keypad as signing in. */
function HouseholdPin({ onBack, onUnlocked }: { onBack: () => void; onUnlocked: (token: string) => void }) {
  const [pin, setPin] = useState('')
  const [state, setState] = useState<'typing' | 'checking' | 'wrong'>('typing')
  const [message, setMessage] = useState<string | null>(null)
  const unlock = useCallback(async () => {
    setState('checking')
    try {
      onUnlocked(await unlockAdmin(pin))
    } catch (e) {
      setState('wrong')
      setMessage(/too many/i.test(e instanceof Error ? e.message : '') ? 'Too many tries. Try again in 15 minutes.' : 'That’s not the household PIN.')
      window.setTimeout(() => { setPin(''); setState('typing') }, 650)
    }
  }, [pin, onUnlocked])
  const press = useCallback((d: string) => { if (state === 'typing' && pin.length < 12) { setMessage(null); setPin(`${pin}${d}`) } }, [state, pin])
  const del = useCallback(() => { if (state === 'typing') setPin((p) => p.slice(0, -1)) }, [state])
  return (
    <Ground>
      <BackLink label="Sign in" onClick={onBack} />
      <div className="mt-[max(64px,calc(env(safe-area-inset-top)+44px))] h-[96px] w-[96px]"><HouseMark className="h-full w-full" /></div>
      <h1 className="m-0 mt-[16px] font-display text-phone-title font-semibold text-wall-ink">Family PINs</h1>
      <div className="mt-[10px] font-body text-phone-label font-semibold uppercase tracking-[0.22em] text-wall-brass-ink">The household PIN</div>
      <div className="mt-[22px]"><PinRings filled={pin.length} length={Math.max(PIN_LENGTH, pin.length)} state={state === 'wrong' ? 'wrong' : 'typing'} /></div>
      <p role="alert" className="m-0 mt-[14px] min-h-[22px] font-body text-phone-detail text-wall-rust">{message ?? ''}</p>
      <div className="mt-[14px]"><PinKeypad value={pin} onPress={press} onDelete={del} disabled={state === 'checking'} /></div>
      <button type="button" disabled={pin.length < PIN_LENGTH || state !== 'typing'} onClick={() => void unlock()} className="mt-[20px] min-h-[52px] w-[260px] rounded-full border-0 bg-wall-ink font-body text-phone-body font-semibold text-phone-ground disabled:opacity-30">
        Unlock
      </button>
    </Ground>
  )
}

/** A new PIN for someone, typed twice. */
function NewPin({ member, pigment, token, onBack, onSaved }: { member: FamilyMember; pigment: number; token: string; onBack: () => void; onSaved: () => void }) {
  const [step, setStep] = useState<NewPinStep>({ stage: 'first', first: '' })
  const [pin, setPin] = useState('')
  const [state, setState] = useState<'typing' | 'saving' | 'wrong'>('typing')
  const [message, setMessage] = useState<string | null>(null)
  const save = useCallback(async (full: string) => {
    setState('saving')
    try {
      await invokeAssistantHistory(token, { action: 'set_member_pin', member_id: member.id, pin: full })
      onSaved()
    } catch (e) {
      setState('typing')
      setPin('')
      setStep({ stage: 'first', first: '' })
      setMessage(e instanceof Error ? e.message : 'That PIN didn’t save. Try again.')
    }
  }, [token, member.id, onSaved])
  const press = useCallback((d: string) => {
    if (state !== 'typing' || pin.length >= PIN_LENGTH) return
    const typed = `${pin}${d}`
    setMessage(null)
    setPin(typed)
    if (typed.length < PIN_LENGTH) return
    const r = nextNewPin(step, typed)
    if (r.done) { void save(r.done); return }
    if (r.mismatch) {
      setState('wrong')
      setMessage('Those didn’t match. Start again.')
      window.setTimeout(() => { setPin(''); setStep(r.step); setState('typing') }, 650)
      return
    }
    window.setTimeout(() => { setPin(''); setStep(r.step) }, 220)
  }, [state, pin, step, save])
  const del = useCallback(() => { if (state === 'typing') setPin((p) => p.slice(0, -1)) }, [state])
  return (
    <Ground>
      <BackLink label="Family PINs" onClick={onBack} />
      <div className="mt-[max(64px,calc(env(safe-area-inset-top)+44px))]"><Face name={member.name} pigment={pigment} size="lg" ringed /></div>
      <h1 className="m-0 mt-[16px] font-display text-phone-title font-semibold text-wall-ink">{member.name}’s new PIN</h1>
      <div className="mt-[10px] font-body text-phone-label font-semibold uppercase tracking-[0.22em] text-wall-brass-ink">{step.stage === 'first' ? 'Six digits' : 'Once more, to be sure'}</div>
      <div className="mt-[22px]"><PinRings filled={pin.length} state={state === 'wrong' ? 'wrong' : 'typing'} /></div>
      <p role="alert" className="m-0 mt-[14px] min-h-[22px] max-w-[320px] text-center font-body text-phone-detail text-wall-rust">{message ?? ''}</p>
      <div className="mt-[14px]"><PinKeypad value={pin} onPress={press} onDelete={del} disabled={state === 'saving'} /></div>
    </Ground>
  )
}
