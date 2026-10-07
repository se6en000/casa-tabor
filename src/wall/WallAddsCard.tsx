import { Plus } from 'lucide-react'
import type { AddsCard } from './addsCard'

// What a card adds to something already there, line by line (Jake, Oct 7: "i need to see on the card, what will
// actually be added for the get and prep, or notes … its a confidence thing"): the event, what's in its notes now
// (dim), and each new line with a +.

const label = 'text-wall-label font-bold tracking-[0.18em] text-wall-ink-2'

export default function WallAddsCard({ card, working, onYes, onChange, onNo }: { card: AddsCard; working: boolean; onYes: () => void; onChange: () => void; onNo: () => void }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-[18px] rounded-[24px] bg-wall-on-pigment px-[32px] py-[28px] text-wall-ink">
      <div className="flex items-baseline justify-between gap-[24px]">
        <div className="min-w-0 truncate font-display text-wall-quote font-semibold">{card.title}</div>
        <div className="shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{card.kind === 'prep' ? 'GET & PACK' : 'NOTES'} · NOT SAVED YET</div>
      </div>
      {card.when && <div className="-mt-[10px] text-wall-detail text-wall-ink-2">{card.when}</div>}
      {card.existing.length > 0 && (
        <div className="min-w-0">
          <div className={label}>IN ITS NOTES NOW</div>
          <div className="mt-[6px] line-clamp-3 whitespace-pre-line text-wall-detail text-wall-ink-2">{card.existing.join('\n')}</div>
        </div>
      )}
      <div className="min-w-0">
        <div className={label}>{card.kind === 'prep' ? `ADDS TO GET & PACK · ${card.adding.length}` : 'ADDS TO ITS NOTES'}</div>
        <ul className="m-0 mt-[8px] flex list-none flex-col gap-[8px] p-0">
          {card.adding.slice(0, 6).map((line) => (
            <li key={line} className="flex items-start gap-[12px] text-wall-body font-semibold">
              <Plus size={22} strokeWidth={2.5} aria-hidden="true" className="mt-[4px] shrink-0 text-wall-brass-ink" />
              <span className="min-w-0 break-words">{line}</span>
            </li>
          ))}
          {card.adding.length > 6 && <li className="text-wall-detail text-wall-ink-2">and {card.adding.length - 6} more</li>}
        </ul>
      </div>
      <div className="mt-auto flex items-center gap-[14px]">
        <button type="button" disabled={working} onClick={onYes} className="h-[60px] rounded-full border-0 bg-wall-ink px-[32px] text-wall-detail font-bold text-wall-on-pigment">
          {working ? 'Saving…' : card.yes}
        </button>
        <button type="button" disabled={working} onClick={onChange} className="h-[60px] rounded-full border border-solid border-wall-ink-2 bg-wall-paper px-[28px] text-wall-detail font-semibold text-wall-ink">
          Change something
        </button>
        <button type="button" disabled={working} onClick={onNo} className="h-[60px] rounded-full border border-solid border-wall-rule bg-wall-paper px-[28px] text-wall-detail font-semibold text-wall-ink">
          No
        </button>
      </div>
    </div>
  )
}
