import { useState, type ReactNode } from 'react'
import { Star } from 'lucide-react'
import { useLayout, useT } from './layout'

// Recipes V2's small parts, in the family's V2 look (the wall's colours, the serif for names). Sized by layout:
// phone, tablet (a laptop too) and the wall (touch, across the kitchen).

export function Pill({ children, onClick, tone = 'quiet', label, disabled, wide, type = 'button' }: {
  children: ReactNode
  onClick?: () => void
  tone?: 'ink' | 'quiet' | 'brass' | 'rust'
  label?: string
  disabled?: boolean
  wide?: boolean
  type?: 'button' | 'submit'
}) {
  const t = useT()
  const tones = {
    ink: 'border-0 bg-wall-ink text-wall-on-pigment',
    quiet: 'border border-solid border-wall-stone bg-transparent text-wall-ink',
    brass: 'border-[1.5px] border-solid border-wall-brass bg-transparent text-wall-brass-ink',
    rust: 'border border-solid border-wall-rust bg-transparent text-wall-rust',
  }
  return (
    <button type={type} aria-label={label} disabled={disabled} onClick={onClick}
      className={`flex shrink-0 items-center justify-center gap-[8px] rounded-full px-[20px] font-body font-semibold disabled:opacity-40 ${t.pill} ${t.body} ${tones[tone]} ${wide ? 'flex-1' : ''}`}>
      {children}
    </button>
  )
}

/** A round button with an icon (back, close, star, add). */
export function Round({ children, onClick, label, over, pressed }: { children: ReactNode; onClick: () => void; label: string; over?: boolean; pressed?: boolean }) {
  const wall = useLayout() === 'wall'
  return (
    <button type="button" aria-label={label} aria-pressed={pressed} onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`flex shrink-0 items-center justify-center rounded-full p-0 text-wall-ink ${wall ? 'h-[60px] w-[60px]' : 'h-[44px] w-[44px]'} ${over ? 'border-0 bg-wall-on-pigment/90' : 'border border-solid border-wall-stone bg-wall-paper'}`}>
      {children}
    </button>
  )
}

export function StarIcon({ on, size }: { on: boolean; size: number }) {
  return <Star size={size} strokeWidth={1.8} aria-hidden="true" className={on ? 'fill-wall-brass text-wall-brass' : 'fill-transparent text-wall-ink'} />
}

export function Chip({ children, on, onClick }: { children: ReactNode; on: boolean; onClick: () => void }) {
  const t = useT()
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-full px-[16px] font-body font-semibold ${t.chip} ${t.detail} ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-wall-paper text-wall-ink'}`}>
      {children}
    </button>
  )
}

export function Label({ children, right }: { children: ReactNode; right?: ReactNode }) {
  const t = useT()
  return (
    <div className="mb-[6px] flex items-baseline justify-between">
      <h2 className={`m-0 text-wall-ink font-body font-bold uppercase tracking-[0.2em] text-wall-ink-2 ${t.label}`}>{children}</h2>
      {right && <span className={`text-wall-ink-2 ${t.detail}`}>{right}</span>}
    </div>
  )
}

/** A sheet from the bottom on a phone; a card in the middle on a tablet or the wall. */
export function Sheet({ children, onClose, label }: { children: ReactNode; onClose: () => void; label: string }) {
  const layout = useLayout()
  const card = layout !== 'phone'
  return (
    <div className={`fixed inset-0 z-50 flex justify-center bg-wall-ink/35 ${card ? 'items-center p-[32px]' : 'items-end'}`} onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}
        className={`w-full overflow-y-auto bg-phone-ground font-body text-wall-ink ${card ? `max-h-[88vh] rounded-[26px] px-[32px] py-[28px] ${layout === 'wall' ? 'max-w-[880px]' : 'max-w-[600px]'}` : 'max-h-[92dvh] rounded-t-[26px] px-[20px] pb-[max(28px,calc(env(safe-area-inset-bottom)+12px))] pt-[10px]'}`}>
        {!card && <div aria-hidden="true" className="mx-auto mb-[12px] h-[5px] w-[44px] rounded-full bg-wall-stone" />}
        {children}
      </section>
    </div>
  )
}

/** A recipe's photo, or its first letter on the ground when it has none (or it won't load). */
export function RecipePhoto({ src, name, className }: { src: string | null; name: string; className: string }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  if (!src || brokenSrc === src) {
    return <div aria-hidden="true" className={`flex items-center justify-center bg-phone-card font-display font-semibold text-wall-ink-2 ${className}`}><span className="text-wall-title">{name.charAt(0)}</span></div>
  }
  return <img src={src} alt="" loading="lazy" onError={() => setBrokenSrc(src)} className={`block object-cover ${className}`} />
}
