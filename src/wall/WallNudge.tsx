import type { TodoItem } from './todos'

// The surface of To do (P3.22, board 09a): tonight's nudge ("Trash out to the street") on the evening
// face, or one small job in a quiet stretch. One thing, with one big Done — never the list.

const clockOf = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(/\s?[AP]M$/, '')

function Button({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`h-[64px] shrink-0 whitespace-nowrap rounded-full px-[26px] text-wall-body font-semibold ${primary ? 'border-0 bg-wall-brass text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-wall-paper text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

/** Tonight's nudge, in the evening header — or, stacked, in the left panel (canvas 56A). */
export function WallNudge({ item, onDone, onLater, rail = false }: { item: TodoItem; onDone: () => void; onLater: () => void; rail?: boolean }) {
  if (rail) {
    return (
      <section aria-label="Tonight’s reminder" className="flex shrink-0 flex-col gap-[14px] rounded-[18px] border border-solid border-wall-brass/50 bg-wall-brass/10 px-[24px] py-[20px]">
        <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">TONIGHT{item.dueAt ? ` · ${clockOf(item.dueAt)}` : ''}</div>
        <div className="line-clamp-2 font-display text-wall-quote font-semibold">{item.title}</div>
        <div className="flex gap-[12px]">
          <Button label="Later tonight" onClick={onLater} />
          <Button label="Done" primary onClick={onDone} />
        </div>
      </section>
    )
  }
  return (
    <section aria-label="Tonight’s reminder" className="flex min-w-0 flex-1 items-center justify-between gap-[28px] rounded-[24px] border border-solid border-wall-brass/50 bg-wall-brass/10 px-[32px] py-[18px]">
      <div className="flex min-w-0 flex-col gap-[6px]">
        <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">TONIGHT{item.dueAt ? ` · ${clockOf(item.dueAt)}` : ''}</div>
        <div className="truncate font-display text-wall-move font-semibold leading-none">{item.title}</div>
      </div>
      <div className="flex shrink-0 gap-[12px]">
        <Button label="Later tonight" onClick={onLater} />
        <Button label="Done" primary onClick={onDone} />
      </div>
    </section>
  )
}

/** One small job in a quiet stretch, under "A quiet stretch until 1:50." */
export function WallQuietStep({ item, onDone }: { item: TodoItem; onDone: () => void }) {
  return (
    <section aria-label="Meanwhile" className="flex items-center gap-[20px]">
      <div className="flex min-w-0 flex-col gap-[2px]">
        <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">MEANWHILE · {item.minutes} MIN</span>
        <span className="truncate font-display text-wall-date font-semibold">{item.nextStep ?? item.title}</span>
        {item.nextStep && <span className="truncate text-wall-detail text-wall-ink-2">{item.title}</span>}
      </div>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onDone()
        }}
        className="h-[52px] shrink-0 rounded-full border-0 bg-wall-ink px-[22px] text-wall-detail font-semibold text-wall-on-pigment"
      >
        Done
      </button>
    </section>
  )
}
