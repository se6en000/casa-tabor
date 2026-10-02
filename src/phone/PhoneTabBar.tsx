import type { ReactNode } from 'react'
import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'

// The glass tab bar (premium plan, Phase A; Jake, Oct 2: "the glass navigation bar on bottom"): a floating pill of
// frosted glass lifted off the bottom edge, the list blurred through it; the selected tab in a lighter capsule that
// springs from tab to tab; the + the dark round action in the middle. Scrolling down it settles smaller (labels
// tucked away), scrolling up it comes back — as Safari's bar does.

export interface TabItem<T extends string> { id: T; label: string; icon: ReactNode }

const SPRING = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 } as const

export default function PhoneTabBar<T extends string>({ tabs, current, onTab, onAdd, addDisabled, compact }: {
  tabs: TabItem<T>[]
  current: T
  onTab: (id: T) => void
  onAdd: () => void
  addDisabled?: boolean
  /** Scrolling down: smaller, labels tucked away. */
  compact: boolean
}) {
  const tabButton = (t: TabItem<T>) => {
    const on = t.id === current
    return (
      <button
        key={t.id}
        type="button"
        aria-current={on ? 'page' : undefined}
        aria-label={t.label}
        onClick={() => onTab(t.id)}
        className={`relative flex flex-1 flex-col items-center justify-center gap-[2px] border-0 bg-transparent p-0 text-phone-label transition-[height] duration-300 ${compact ? 'h-[44px]' : 'h-[56px]'} ${on ? 'font-bold text-wall-ink' : 'font-medium text-wall-ink-2'}`}
      >
        {on && <motion.span layoutId="phone-tab-capsule" transition={SPRING} aria-hidden="true" className="absolute inset-x-[2px] inset-y-[4px] rounded-full bg-wall-on-pigment/85 shadow-[0_1px_2px_rgba(38,34,29,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]" />}
        <span className="relative">{t.icon}</span>
        <span className={`relative overflow-hidden leading-none transition-[max-height,opacity] duration-300 ${compact ? 'max-h-0 opacity-0' : 'max-h-[16px] opacity-100'}`}>{t.label}</span>
      </button>
    )
  }
  return (
    <nav
      aria-label="Sections"
      className={`absolute inset-x-[14px] bottom-[max(8px,calc(env(safe-area-inset-bottom)+6px-var(--phone-dead,0px)))] z-20 flex items-center gap-[4px] rounded-full border border-solid border-white/60 bg-wall-on-pigment/55 px-[6px] shadow-[0_10px_30px_rgba(38,34,29,0.16),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl backdrop-saturate-[1.8] transition-transform duration-300 ${compact ? 'scale-[0.94]' : ''}`}
    >
      {tabButton(tabs[0])}
      {tabButton(tabs[1])}
      <button type="button" aria-label="Add something" onClick={onAdd} disabled={addDisabled} className={`mx-[4px] flex shrink-0 items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment shadow-[0_4px_12px_rgba(38,34,29,0.28)] transition-[width,height] duration-300 ${compact ? 'h-[40px] w-[40px]' : 'h-[48px] w-[48px]'}`}>
        <Plus size={24} strokeWidth={2.2} />
      </button>
      {tabButton(tabs[2])}
      {tabButton(tabs[3])}
    </nav>
  )
}
