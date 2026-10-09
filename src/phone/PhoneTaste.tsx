import { useState } from 'react'
import { ChevronLeft, Plus, X } from 'lucide-react'
import { REACH_CHOICES, type GuideTaste } from '../../supabase/functions/_shared/guide.mjs'
import { useGuideTaste } from '../wall/useGuideTaste'

// Settings › Your taste (canvas 85D; Jake, Oct 9 — approved): what the local guide reads to pick for the two of them —
// what you love, what to try once first, places you love, game days, and how far for a night out. It starts from what
// Jake told it; every change is saved at once. The ratings after each outing teach it the rest.

const label = 'text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink'
const card = 'flex flex-col gap-[10px] rounded-[20px] bg-phone-card p-[16px]'
const pill = 'flex h-[40px] items-center gap-[6px] whitespace-nowrap rounded-full px-[14px] text-phone-detail font-bold'

/** A list of chips: × takes one off; + Add types a new one. */
function Chips({ name, items, onChange, dark = true }: { name: string; items: string[]; onChange: (next: string[]) => void; dark?: boolean }) {
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (t && !items.some((i) => i.toLowerCase() === t.toLowerCase())) onChange([...items, t])
    setText('')
    setAdding(false)
  }
  return (
    <div className="flex flex-wrap gap-[7px]">
      {items.map((item) => (
        <span key={item} className={`${pill} pr-[4px] ${dark ? 'bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 text-wall-ink'}`}>
          {item}
          <button type="button" aria-label={`Take off ${item}`} onClick={() => onChange(items.filter((i) => i !== item))} className={`flex h-[32px] w-[32px] items-center justify-center rounded-full border-0 bg-transparent p-0 ${dark ? 'text-wall-stone' : 'text-wall-ink-2'}`}><X size={14} /></button>
        </span>
      ))}
      {adding ? (
        <form onSubmit={(e) => { e.preventDefault(); add() }} className="flex items-center gap-[6px]">
          <input autoFocus aria-label={`Add to ${name}`} value={text} onChange={(e) => setText(e.target.value)} onBlur={add} className="h-[40px] w-[170px] rounded-full border border-solid border-wall-ink-2 bg-wall-on-pigment px-[14px] text-phone-detail text-wall-ink outline-none" />
        </form>
      ) : (
        <button type="button" aria-label={`Add to ${name}`} onClick={() => setAdding(true)} className={`${pill} border border-dashed border-wall-ink-2 bg-transparent text-wall-ink-2`}><Plus size={14} /> Add</button>
      )}
    </div>
  )
}

export default function PhoneTaste({ onClose, useTaste = useGuideTaste }: { onClose: () => void; useTaste?: typeof useGuideTaste }) {
  const { taste, save } = useTaste()
  const [error, setError] = useState<string | null>(null)
  const [place, setPlace] = useState('')
  const change = (patch: Partial<GuideTaste>) => {
    setError(null)
    save({ ...taste, ...patch }).catch((e) => setError(e instanceof Error ? e.message : 'That didn’t save.'))
  }
  const addPlace = () => {
    const name = place.trim()
    if (name && !taste.places.some((p) => p.name.toLowerCase() === name.toLowerCase())) change({ places: [...taste.places, { name }] })
    setPlace('')
  }
  return (
    <section aria-label="Your taste" className="absolute inset-0 z-20 flex flex-col bg-phone-ground font-body text-wall-ink">
      <div className="flex shrink-0 items-center gap-[12px] border-0 border-b border-solid border-wall-stone px-[20px] pb-[12px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
        <button type="button" aria-label="Back" onClick={onClose} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-wall-paper p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        <span className="flex flex-col"><span className="text-phone-detail text-wall-ink-2">Settings</span><h1 className="m-0 font-display text-phone-title font-bold leading-none text-wall-ink">Your taste</h1></span>
      </div>
      <div className="flex flex-1 flex-col gap-[14px] overflow-y-auto overscroll-contain px-[16px] py-[14px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] text-phone-body">
        <div className="px-[4px] text-phone-detail text-wall-ink-2">Mostly date nights. Out &amp; about’s guide picks from this, and from how you rate the places you go.</div>
        {error && <div role="alert" className="text-phone-detail font-semibold text-wall-rust">{error}</div>}
        <div className={card}>
          <div className={label}>WHAT YOU LOVE</div>
          <Chips name="what you love" items={taste.loves} onChange={(loves) => change({ loves })} />
        </div>
        <div className={card}>
          <div className={label}>TRY ONE FIRST</div>
          <Chips name="try one first" items={taste.tryFirst} onChange={(tryFirst) => change({ tryFirst })} dark={false} />
          <div className="text-phone-detail text-wall-ink-2">After you try one, rate it — the guide takes it from there.</div>
        </div>
        <div className={card}>
          <div className={label}>PLACES YOU LOVE</div>
          <div className="flex flex-col">
            {taste.places.map((p) => (
              <div key={p.name} className="flex min-h-[52px] items-center gap-[10px] border-0 border-t border-solid border-wall-stone py-[4px] first:border-t-0">
                <span className="flex min-w-0 flex-1 flex-col"><span className="font-semibold">{p.name}</span>{p.note && <span className="text-phone-detail text-wall-ink-2">{p.note}</span>}</span>
                <button type="button" aria-label={`Take off ${p.name}`} onClick={() => change({ places: taste.places.filter((x) => x.name !== p.name) })} className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 text-wall-ink-2"><X size={16} /></button>
              </div>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); addPlace() }} className="flex items-center gap-[8px]">
            <input aria-label="Add a place you love" value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Add a place…" className="h-[44px] min-w-0 flex-1 rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[14px] text-phone-body text-wall-ink outline-none" />
            {place.trim() && <button type="submit" className="h-[44px] rounded-full border-0 bg-wall-brass px-[16px] text-phone-body font-bold text-wall-on-pigment">Add</button>}
          </form>
        </div>
        <div className={card}>
          <div className={label}>MUSIC YOU’D GO SEE · EVEN NOT KNOWING THE BAND</div>
          <Chips name="music you’d go see" items={taste.genres} onChange={(genres) => change({ genres })} dark={false} />
          <div className="text-phone-detail text-wall-ink-2">Names you’d know and tributes always show; a few local bands in these, nearest first.</div>
        </div>
        <div className={card}>
          <div className={label}>GAME DAYS · A BAR WITH THE GAME ON</div>
          <Chips name="game days" items={taste.teams} onChange={(teams) => change({ teams })} dark={false} />
        </div>
        <div className={card}>
          <div className={label}>HOW FAR FOR A NIGHT OUT</div>
          <div role="radiogroup" aria-label="How far" className="flex gap-[6px]">
            {REACH_CHOICES.map(([min, word]) => (
              <button key={min} type="button" role="radio" aria-checked={taste.reachMin === min} onClick={() => change({ reachMin: min })} className={`${pill} h-[44px] ${taste.reachMin === min ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink'}`}>{word}</button>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
