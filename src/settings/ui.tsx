import { type ReactNode } from 'react'
import { useSize, useType } from './sizing'
import { BarChart3, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, Gauge, ListChecks, MapPin, Mic, Monitor, Sparkles, Users, Wrench } from 'lucide-react'
import type { SettingsIcon } from './model'

// Settings V2's small parts (canvas 47): the phone's own look — warm paper, brass, serif titles — at two sizes: in
// the hand (phone and laptop) and across the kitchen (the wall, every row a finger wide).

const ICONS = { users: Users, pin: MapPin, cal: CalendarDays, wall: Monitor, spark: Sparkles, chores: ListChecks, chart: BarChart3, gauge: Gauge, check: ClipboardCheck, mic: Mic, wrench: Wrench }

export function PageIcon({ icon }: { icon: SettingsIcon }) {
  const t = useType()
  const Icon = ICONS[icon]
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-[9px] bg-phone-card text-wall-brass-ink ${t.chip === 44 ? 'h-[44px] w-[44px]' : 'h-[30px] w-[30px]'}`}>
      <Icon size={t.icon} strokeWidth={1.8} />
    </span>
  )
}

/** A page's top: back (on the phone), the title, and what the page is for. */
export function PageHead({ title, about, back, onBack }: { title: string; about?: string; back?: string; onBack?: () => void }) {
  const t = useType()
  return (
    <header className="flex flex-col gap-[6px]">
      {onBack && (
        <button type="button" onClick={onBack} className={`-ml-[4px] flex min-h-[44px] w-fit items-center gap-[2px] border-0 bg-transparent p-0 font-semibold text-wall-brass-ink ${t.body}`}>
          <ChevronLeft size={20} aria-hidden="true" /> {back ?? 'Settings'}
        </button>
      )}
      <h1 className={`m-0 font-display font-semibold leading-none text-wall-ink ${t.title}`}>{title}</h1>
      {about && <p className={`m-0 text-wall-ink-2 ${t.detail}`}>{about}</p>}
    </header>
  )
}

export function Label({ children }: { children: ReactNode }) {
  const t = useType()
  return <h2 className={`m-0 mb-[8px] mt-[22px] px-[4px] font-body font-semibold uppercase tracking-[0.18em] text-wall-ink-2 ${t.label}`}>{children}</h2>
}

/** Rows in one card, a rule between them. */
export function Group({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <section aria-label={label}>
      {label && <Label>{label}</Label>}
      <div className="overflow-hidden rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment [&>*+*]:border-0 [&>*+*]:border-t [&>*+*]:border-solid [&>*+*]:border-wall-stone">{children}</div>
    </section>
  )
}

/** One row: what it is, its state in words, and what's on the right (a chevron when it opens something). */
export function Row({ lead, name, state, tone = 'quiet', right, onClick, label }: {
  lead?: ReactNode
  name: ReactNode
  state?: ReactNode
  tone?: 'quiet' | 'brass' | 'rust' | 'good'
  right?: ReactNode
  onClick?: () => void
  label?: string
}) {
  const t = useType()
  const toneClass = { quiet: 'text-wall-ink-2', brass: 'text-wall-brass-ink', rust: 'text-wall-rust', good: 'text-wall-pigment-6' }[tone]
  const inner = (
    <>
      {lead}
      <span className="flex min-w-0 flex-1 flex-col gap-[2px] text-left">
        <span className={`font-semibold text-wall-ink ${t.body}`}>{name}</span>
        {state != null && state !== '' && <span className={`${toneClass} ${t.detail}`}>{state}</span>}
      </span>
      {right ?? (onClick ? <ChevronRight size={18} aria-hidden="true" className="shrink-0 text-wall-ink-2" /> : null)}
    </>
  )
  const cls = `flex w-full items-center gap-[14px] ${t.row}`
  return onClick
    ? <button type="button" aria-label={label} onClick={onClick} className={`${cls} border-0 bg-transparent text-wall-ink`}>{inner}</button>
    : <div className={cls}>{inner}</div>
}

/** On or off, saved as it's flipped. */
export function Toggle({ on, onChange, label, disabled }: { on: boolean; onChange: (on: boolean) => void; label: string; disabled?: boolean }) {
  const wall = useSize() === 'wall'
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative shrink-0 rounded-full border-0 p-0 transition-colors ${wall ? 'h-[44px] w-[76px]' : 'h-[30px] w-[50px]'} ${on ? 'bg-wall-brass' : 'bg-wall-stone'} disabled:opacity-50`}
    >
      <span aria-hidden="true" className={`absolute rounded-full bg-wall-on-pigment shadow-[0_1px_3px_rgba(38,34,29,0.25)] transition-[left] ${wall ? `top-[4px] h-[36px] w-[36px] ${on ? 'left-[36px]' : 'left-[4px]'}` : `top-[3px] h-[24px] w-[24px] ${on ? 'left-[23px]' : 'left-[3px]'}`}`} />
    </button>
  )
}

/** A number you step: − 2 min + (touch-friendly on the wall, no slider to miss). */
export function Stepper({ value, unit, onChange, min, max, step, label, format }: { value: number; unit?: string; onChange: (v: number) => void; min: number; max: number; step: number; label: string; format?: (v: number) => string }) {
  const t = useType()
  const wall = useSize() === 'wall'
  const btn = `flex shrink-0 items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 font-semibold text-wall-ink disabled:opacity-40 ${wall ? 'h-[56px] w-[56px]' : 'h-[40px] w-[40px]'} ${t.heading}`
  return (
    <div className="flex items-center gap-[10px]" role="group" aria-label={label}>
      <button type="button" aria-label={`Less: ${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, value - step))} className={btn}>−</button>
      <span className={`min-w-[72px] text-center font-semibold text-wall-brass-ink ${t.body}`}>{format ? format(value) : `${value} ${unit ?? ''}`.trim()}</span>
      <button type="button" aria-label={`More: ${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, value + step))} className={btn}>+</button>
    </div>
  )
}

/** Two or three choices in one brass-and-ink switch (General | Advanced; Places | People). */
export function Seg<T extends string>({ options, value, onChange, label }: { options: Array<{ value: T; label: ReactNode }>; value: T; onChange: (v: T) => void; label: string }) {
  const t = useType()
  const wall = useSize() === 'wall'
  return (
    <div role="tablist" aria-label={label} className="flex rounded-full border border-solid border-wall-stone bg-phone-card p-[3px]">
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={`flex flex-1 items-center justify-center gap-[6px] rounded-full border-0 font-semibold ${wall ? 'h-[54px]' : 'h-[38px]'} ${t.detail} ${value === o.value ? 'bg-wall-ink text-wall-on-pigment' : 'bg-transparent text-wall-ink-2'}`}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** A brass link-button ("Add someone", "Run"). */
export function Action({ children, onClick, tone = 'brass', label, disabled }: { children: ReactNode; onClick: () => void; tone?: 'brass' | 'quiet' | 'rust'; label?: string; disabled?: boolean }) {
  const t = useType()
  const color = { brass: 'text-wall-brass-ink', quiet: 'text-wall-ink-2', rust: 'text-wall-rust' }[tone]
  return <button type="button" aria-label={label} disabled={disabled} onClick={onClick} className={`flex min-h-[44px] shrink-0 items-center gap-[8px] border-0 bg-transparent p-0 font-semibold disabled:opacity-40 ${color} ${t.body}`}>{children}</button>
}

/** Nothing to show yet, or still loading. */
export function Quiet({ children }: { children: ReactNode }) {
  const t = useType()
  return <p className={`m-0 px-[14px] py-[14px] text-wall-ink-2 ${t.detail}`}>{children}</p>
}

/** A person's color disc with their initial (the wall's pigments). */
export function PersonDisc({ name, className }: { name: string; className: string }) {
  const wall = useSize() === 'wall'
  return <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${wall ? 'h-[44px] w-[44px] text-wall-heading' : 'h-[32px] w-[32px] text-phone-body'} ${className}`}>{name.charAt(0)}</span>
}
