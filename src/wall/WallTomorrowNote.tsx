import { ChevronRight } from 'lucide-react'

// Tomorrow speaking up in the afternoon (board 04a/04c): one line, from 1 PM, when
// tomorrow still has things to get or pack, or a question. A tap opens tomorrow.

export interface TomorrowNote {
  text: string
  onOpen: () => void
}

export default function WallTomorrowNote({ note, quiet = false }: { note: TomorrowNote; quiet?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        note.onOpen()
      }}
      className={`flex h-[56px] w-full shrink-0 items-center gap-[16px] rounded-full text-left text-wall-ink ${
        quiet ? 'border-0 bg-transparent px-0' : 'border border-solid border-wall-brass bg-wall-brass/10 px-[26px]'
      }`}
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
