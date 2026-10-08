import { ChevronRight } from 'lucide-react'
import type { TomorrowParts } from './posture'

// Tomorrow speaking up in the afternoon (board 04a/04c): one line, from 1 PM, when
// tomorrow still has things to get or pack, or a question. A tap opens tomorrow.

export interface TomorrowNote {
  text: string
  /** The same, in pieces, for the calm face's card (canvas 78C). */
  parts?: TomorrowParts | null
  onOpen: () => void
}

/** Tomorrow on the calm face (canvas 78C): a card beside Meanwhile — when the day starts, then the line in full. */
export function TomorrowCard({ note }: { note: TomorrowNote }) {
  const t = note.parts
  const lead = !t ? note.text : t.what ? `${t.what}${t.at ? ` at ${t.at}` : ''} — ${t.items} still to do` : `${t.decide} to decide`
  const foot = [t && t.more > 0 ? `${t.more} more` : null, t?.what && t.decide > 0 ? `${t.decide} to decide` : null].filter(Boolean).join(' · ')
  return (
    <button
      type="button"
      aria-label={`Tomorrow: ${note.text}`}
      onClick={(event) => {
        event.stopPropagation()
        note.onOpen()
      }}
      className="flex min-w-0 flex-1 flex-col items-start justify-center gap-[4px] rounded-[20px] border-[1.5px] border-solid border-wall-rust bg-transparent px-[30px] py-[22px] text-left text-wall-ink"
    >
      <span className="text-wall-label font-bold tracking-[0.22em] text-wall-rust">TOMORROW{t?.firstOut ? ` · FIRST OUT ${t.firstOut}` : ''}</span>
      <span className="line-clamp-2 font-display text-wall-heading">{lead}</span>
      <span className="flex items-center gap-[4px] text-wall-detail text-wall-ink-2">
        {foot && `${foot} · `}Open tomorrow
        <ChevronRight size={18} aria-hidden="true" />
      </span>
    </button>
  )
}

export default function WallTomorrowNote({ note }: { note: TomorrowNote }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        note.onOpen()
      }}
      className="flex h-[56px] w-full shrink-0 items-center gap-[16px] rounded-full border border-solid border-wall-brass bg-wall-paper px-[26px] text-left text-wall-ink shadow-[0_1px_0_rgba(38,34,29,0.06),0_6px_18px_rgba(38,34,29,0.06)]"
    >
      <span className="shrink-0 text-wall-label font-bold tracking-[0.2em] text-wall-rust">TOMORROW</span>
      <span className="min-w-0 truncate text-wall-body">{note.text}</span>
      <span className="ml-auto flex shrink-0 items-center gap-[4px] text-wall-detail text-wall-ink-2">
        Open tomorrow
        <ChevronRight size={20} aria-hidden="true" />
      </span>
    </button>
  )
}
