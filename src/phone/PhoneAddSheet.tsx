import type { ReactNode } from 'react'
import { Camera, Mic, Type, X } from 'lucide-react'

// Board 05e: the + — the ways in. Everything comes back as a draft you check first.
export default function PhoneAddSheet({ onType, onSay, onScan, onClose }: { onType: () => void; onSay?: () => void; onScan?: () => void; onClose: () => void }) {
  const option = (icon: ReactNode, title: string, sub: string, onClick: () => void) => (
    <button type="button" onClick={onClick} className="flex min-h-[72px] w-full items-center gap-[14px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment px-[16px] py-[12px] text-left text-wall-ink">
      <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full bg-phone-card">{icon}</span>
      <span className="flex flex-col gap-[2px]">
        <span className="text-phone-body font-bold">{title}</span>
        <span className="text-phone-detail text-wall-ink-2">{sub}</span>
      </span>
    </button>
  )
  return (
    <div className="absolute inset-0 z-30 bg-wall-ink/35" onClick={onClose}>
      <section aria-label="Add something" className="absolute bottom-0 left-0 flex w-full flex-col gap-[12px] rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-display text-phone-title font-bold text-wall-ink">Add something</div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><X size={18} /></button>
        </div>
        {option(<Type size={22} />, 'Type it', 'An event or a reminder', onType)}
        {onSay && option(<Mic size={22} />, 'Say it', '“Add Jaida watching the kids Saturday 12 to 3”', onSay)}
        {onScan && option(<Camera size={22} />, 'Scan it', 'A flyer, an invite, a schedule, a card', onScan)}
        <div className="text-phone-detail text-wall-ink-2">Everything comes back as a draft you check first. Nothing is added from a guess.</div>
      </section>
    </div>
  )
}
