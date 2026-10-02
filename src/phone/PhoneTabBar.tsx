import type { ReactNode } from 'react'
import { motion } from 'framer-motion'

// The glass tab bar (premium plan, Phase A; Jake, Oct 2: "the glass navigation bar on bottom"): a floating pill of
// frosted glass lifted off the bottom edge, the list blurred through it; the selected tab in a lighter capsule that
// springs from tab to tab. Casa is its own dark round button to the right of the pill (canvas 32j, Jake: "I like this
// AI to the right idea"), as iOS 26 does with Search — for three tabs or four. Scrolling down it settles smaller
// (labels tucked away), scrolling up it comes back — as Safari's bar does.

export interface TabItem<T extends string> { id: T; label: string; icon: ReactNode }

const SPRING = { type: 'spring', stiffness: 520, damping: 38, mass: 0.9 } as const

export default function PhoneTabBar<T extends string>({ tabs, current, onTab, action, compact }: {
  tabs: TabItem<T>[]
  current: T
  onTab: (id: T) => void
  /** The round button on its own to the right of the pill (canvas 32j/33a): Casa, or + on Groceries. */
  action: { label: string; icon: ReactNode; onClick: () => void; disabled?: boolean }
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
        className={`relative flex min-w-0 flex-1 flex-col items-center justify-center gap-[2px] border-0 bg-transparent p-0 text-phone-label transition-[height] duration-300 ${compact ? 'h-[44px]' : 'h-[56px]'} ${on ? 'font-bold text-wall-ink' : 'font-medium text-wall-ink-2'}`}
      >
        {on && <motion.span layoutId="phone-tab-capsule" transition={SPRING} aria-hidden="true" className="absolute inset-x-[2px] inset-y-[4px] rounded-full bg-wall-on-pigment/85 shadow-[0_1px_2px_rgba(38,34,29,0.10),inset_0_1px_0_rgba(255,255,255,0.9)]" />}
        <span className="relative">{t.icon}</span>
        <span className={`relative max-w-full overflow-hidden whitespace-nowrap leading-none transition-[max-height,opacity] duration-300 ${compact ? 'max-h-0 opacity-0' : 'max-h-[16px] opacity-100'}`}>{t.label}</span>
      </button>
    )
  }
  const bottom = 'bottom-[max(8px,calc(env(safe-area-inset-bottom)+6px-var(--phone-dead,0px)))]'
  return (
    <>
      <nav
        aria-label="Sections"
        className={`absolute left-[12px] right-[84px] ${bottom} z-20 flex items-center gap-[2px] rounded-full border border-solid border-white/60 bg-wall-on-pigment/55 px-[5px] shadow-[0_10px_30px_rgba(38,34,29,0.16),inset_0_1px_0_rgba(255,255,255,0.75)] backdrop-blur-2xl backdrop-saturate-[1.8] transition-transform duration-300 ${compact ? 'scale-[0.94]' : ''}`}
      >
        {tabs.map(tabButton)}
      </nav>
      <button
        type="button"
        aria-label={action.label}
        onClick={action.onClick}
        disabled={action.disabled}
        data-phone-action
        className={`absolute right-[12px] ${bottom} z-20 flex items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment shadow-[0_6px_18px_rgba(38,34,29,0.30)] transition-[width,height,transform] duration-300 ${compact ? 'h-[56px] w-[56px]' : 'h-[64px] w-[64px]'}`}
      >
        {action.icon}
      </button>
    </>
  )
}
