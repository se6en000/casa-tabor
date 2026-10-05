import { Delete } from 'lucide-react'
import { useEffect } from 'react'
import { pigmentStyleFor } from '../wall/lanes'
import { PIN_LENGTH } from './signin'

/** The Tabor House mark (38l): the ring, the T, a brass rule, HOUSE. */
export function HouseMark({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 1024 1024" className={className} role="img" aria-label="Tabor House">
      <circle cx="512" cy="512" r="306" fill="none" className="stroke-wall-brass" strokeWidth="16" />
      <text x="512" y="580" textAnchor="middle" className="fill-wall-ink font-display" fontWeight="500" fontSize="330">T</text>
      <line x1="452" y1="622" x2="572" y2="622" className="stroke-wall-brass" strokeWidth="6" />
      <text x="520" y="700" textAnchor="middle" className="fill-wall-brass font-body" fontWeight="600" fontSize="46" letterSpacing="16">HOUSE</text>
    </svg>
  )
}

/** A person's face: their initial on their lane's colour, as on the wall. */
export function Face({ name, pigment, size = 'md', ringed = false, drawing = false }: { name: string; pigment: number; size?: 'sm' | 'md' | 'lg'; ringed?: boolean; drawing?: boolean }) {
  const box = size === 'lg' ? 'h-[96px] w-[96px] text-phone-magnified' : size === 'md' ? 'h-[84px] w-[84px] text-phone-magnified' : 'h-[52px] w-[52px] text-phone-heading'
  return (
    <span className="relative inline-flex">
      <span className={`flex items-center justify-center rounded-full font-display font-medium text-wall-on-pigment ${pigmentStyleFor(pigment).solid} ${box} ${ringed ? 'ring-[2px] ring-wall-brass ring-offset-[3px] ring-offset-phone-ground' : ''}`}>{name.charAt(0).toUpperCase()}</span>
      {drawing && (
        <svg viewBox="0 0 120 120" className="pointer-events-none absolute left-[-12px] top-[-12px] h-[120px] w-[120px] -rotate-90" aria-hidden="true">
          <circle cx="60" cy="60" r="56" fill="none" className="stroke-wall-brass motion-safe:animate-[signin-draw_0.9s_cubic-bezier(.6,0,.3,1)_both]" strokeWidth="3" strokeLinecap="round" strokeDasharray="352" />
        </svg>
      )}
    </span>
  )
}

/** Six brass rings that fill with ink; rust and a shake when it's wrong; brass on the way in. */
export function PinRings({ filled, state = 'typing', length = PIN_LENGTH }: { filled: number; state?: 'typing' | 'wrong' | 'right'; length?: number }) {
  return (
    <div role="status" aria-label={`${filled} of ${length} digits`} className={`flex justify-center gap-[18px] ${state === 'wrong' ? 'motion-safe:animate-[signin-shake_0.42s_ease-in-out]' : ''}`}>
      {Array.from({ length }, (_, i) => {
        const on = i < filled
        const tone = state === 'wrong' ? 'border-wall-rust bg-wall-rust' : state === 'right' ? 'border-wall-brass bg-wall-brass' : on ? 'border-wall-ink bg-wall-ink' : 'border-wall-brass bg-transparent'
        return <span key={i} className={`h-[14px] w-[14px] rounded-full border-[1.5px] border-solid transition-colors duration-150 ${state === 'typing' && !on ? 'border-wall-brass bg-transparent' : tone}`} />
      })}
    </div>
  )
}

/** The keypad, iPhone's shape in the wall's serif; a keyboard's digits and Backspace work too. */
export function PinKeypad({ value, onPress, onDelete, disabled = false }: { value: string; onPress: (digit: string) => void; onDelete: () => void; disabled?: boolean }) {
  useEffect(() => {
    if (disabled) return
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) onPress(e.key)
      else if (e.key === 'Backspace') onDelete()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [disabled, onPress, onDelete])
  const key = 'flex h-[78px] w-[78px] items-center justify-center justify-self-center rounded-full border-0 bg-phone-card p-0 font-display text-phone-title font-medium lining-nums text-wall-ink transition-transform duration-100 active:scale-[0.94] active:bg-wall-stone disabled:opacity-50'
  return (
    <div aria-label="PIN Keypad" className="grid grid-cols-[repeat(3,96px)] justify-center gap-y-[16px]">
      {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
        <button key={d} type="button" disabled={disabled} onClick={() => onPress(d)} className={key}>{d}</button>
      ))}
      <span aria-hidden="true" />
      <button type="button" disabled={disabled} onClick={() => onPress('0')} className={key}>0</button>
      <button type="button" aria-label="Delete PIN digit" disabled={disabled || value.length === 0} onClick={onDelete} className="flex h-[78px] w-[78px] items-center justify-center justify-self-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2 active:scale-[0.94] disabled:opacity-30">
        <Delete size={28} strokeWidth={1.6} />
      </button>
    </div>
  )
}

/** A quiet back link at the top left ("‹ Everyone"). */
export function BackLink({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="absolute left-[14px] top-[max(14px,calc(env(safe-area-inset-top)+6px))] flex min-h-[44px] items-center border-0 bg-transparent px-[8px] font-body text-phone-body text-wall-ink-2">
      ‹ {label}
    </button>
  )
}
