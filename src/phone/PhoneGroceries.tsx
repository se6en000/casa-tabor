import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Check, ChevronLeft, Mic, Plus } from 'lucide-react'
import { useFieldDictation } from '../hooks/useFieldDictation'
import { aisles, amountOf, planAdds, type ShopItem } from './groceries'
import { haptic } from './haptic'
import { primeKeyboard, useSheetSwipe } from './phoneShell'

// Groceries on the phone (canvas 33d/33e, Jake, Oct 2: "click it, see groceries, shop in store, add shit, tick stuff off.
// should be dead simple and easy"). What's left by aisle, the amount by the name, big rows; a tick stays put until a pause
// after the last one ("the check stays for a moment like it does on reminders on the iphone"), then the ticked ones leave
// together. Adding is at the bottom, by the thumb: type or say a few at once, or tap a usual item.

export interface PhoneGroceriesData {
  items: ShopItem[]
  /** The usual items, most bought first (not what's on the list now). */
  usual: string[]
  loading: boolean
  tick: (id: string, checked: boolean) => Promise<void> | void
  add: (item: { name: string; quantity: string | null; unit: string | null; category: string }) => Promise<void> | void
  clearDone: () => Promise<void> | void
}

/** How long ticked items stay in place after the last tick. */
export const HOLD_MS = 2500

export default function PhoneGroceries({ data, onBack, adding, setAdding, corner }: {
  data: PhoneGroceriesData
  /** Top right of the title: your initial, on the tab. */
  corner?: ReactNode
  /** Opened as a page (from More): a back button, and its own + in the corner. */
  onBack?: () => void
  adding: boolean
  setAdding: (open: boolean) => void
}) {
  const [held, setHeld] = useState<Set<string>>(() => new Set())
  const [showDone, setShowDone] = useState(false)
  const timer = useRef<number | null>(null)
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  const { groups, done } = useMemo(() => aisles(data.items, held), [data.items, held])
  const left = data.items.filter((i) => !i.checked).length

  const tap = (item: ShopItem) => {
    haptic()
    if (item.checked) {
      void data.tick(item.id, false)
      setHeld((was) => { const next = new Set(was); next.delete(item.id); return next })
      return
    }
    void data.tick(item.id, true)
    setHeld((was) => new Set(was).add(item.id))
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => { timer.current = null; setHeld(new Set()) }, HOLD_MS)
  }
  const ticking = groups.reduce((n, g) => n + g.items.filter((i) => i.checked).length, 0)

  const row = (item: ShopItem, quiet = false) => {
    const amount = amountOf(item)
    return (
      <button
        key={item.id}
        type="button"
        aria-pressed={item.checked}
        aria-label={`${item.name}${amount ? `, ${amount}` : ''}${item.checked ? ', got it' : ''}`}
        onClick={() => tap(item)}
        className={`flex min-h-[56px] w-full items-center gap-[14px] border-0 border-t border-solid border-wall-stone bg-transparent px-0 py-[8px] text-left text-wall-ink ${quiet ? 'opacity-50' : ''}`}
      >
        <span className={`flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full ${item.checked ? 'bg-wall-ink text-wall-on-pigment' : 'border-[1.75px] border-solid border-wall-ink-2'}`}>
          {item.checked && <Check size={16} strokeWidth={3} />}
        </span>
        <span className={`flex-1 text-phone-body font-medium ${item.checked ? 'text-wall-ink-2' : ''}`}>
          {item.name}
          {amount && <span className="font-bold text-wall-brass-ink"> · {amount}</span>}
        </span>
      </button>
    )
  }

  // As a tab it makes no layer of its own, so the add sheet rises over the tab bar's round button too.
  return (
    <section aria-label="Groceries" className={`absolute inset-0 flex flex-col bg-phone-ground font-body text-wall-ink ${onBack ? 'z-20' : ''}`}>
      {onBack && (
        <div className="flex shrink-0 items-center gap-[12px] px-[20px] pt-[max(14px,calc(env(safe-area-inset-top)+6px))]">
          <button type="button" aria-label="Back" onClick={onBack} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border border-solid border-wall-stone bg-transparent p-0 text-wall-ink"><ChevronLeft size={20} /></button>
        </div>
      )}
      <div data-phone-scroll className="flex-1 overflow-y-auto overscroll-y-contain px-[20px] pb-[140px] pt-[14px]">
        <div className="flex items-start justify-between gap-[12px]">
          <div className="min-w-0">
            <div className="text-phone-detail text-wall-ink-2">{data.loading ? 'Loading…' : left === 0 ? 'Nothing to get' : `${left} to get`}</div>
            <h1 className="m-0 font-display text-phone-title font-bold text-wall-ink">Groceries</h1>
          </div>
          {corner}
        </div>
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col">
            <h2 className="m-0 pb-[4px] pt-[16px] font-body text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">{g.label}</h2>
            {g.items.map((i) => row(i))}
          </div>
        ))}
        {!data.loading && left === 0 && groups.length === 0 && (
          <p className="mt-[24px] text-phone-body text-wall-ink-2">Nothing on the list. Tap + to add what you need.</p>
        )}
        {done.length > 0 && (
          <div className="mt-[18px] flex flex-col">
            <button type="button" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)} className="flex min-h-[48px] items-center justify-between rounded-[16px] border-0 bg-phone-card px-[14px] text-left text-phone-body font-semibold text-wall-ink">
              <span>Got · {done.length}</span>
              <span className="text-phone-detail font-medium text-wall-ink-2">{showDone ? 'Hide' : 'Show'}</span>
            </button>
            {showDone && (
              <>
                {done.map((i) => row(i, true))}
                <button type="button" onClick={() => { void data.clearDone(); setShowDone(false) }} className="mt-[10px] flex h-[44px] items-center justify-center self-start rounded-full border border-solid border-wall-ink-2 bg-transparent px-[18px] text-phone-detail font-semibold text-wall-ink">
                  Clear them
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {ticking > 0 && (
        <div role="status" className="pointer-events-none absolute bottom-[104px] left-1/2 flex h-[34px] -translate-x-1/2 items-center whitespace-nowrap rounded-full bg-wall-ink px-[14px] text-phone-detail font-semibold text-wall-on-pigment shadow-[0_4px_12px_rgba(38,34,29,0.25)]">
          {ticking} ticked · they’ll clear in a moment
        </div>
      )}
      {onBack && (
        <button
          type="button"
          aria-label="Add to groceries"
          onClick={() => { primeKeyboard(); setAdding(true) }}
          className="absolute bottom-[max(18px,calc(env(safe-area-inset-bottom)+8px))] right-[16px] flex h-[60px] w-[60px] items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment shadow-[0_6px_16px_rgba(38,34,29,0.3)]"
        >
          <Plus size={26} strokeWidth={2.2} />
        </button>
      )}
      {adding && <GroceryAdd data={data} onClose={() => setAdding(false)} />}
    </section>
  )
}

/** Adding at the bottom (33e): a few at once, typed or said; each lands in its aisle; usual items one tap. */
function GroceryAdd({ data, onClose }: { data: PhoneGroceriesData; onClose: () => void }) {
  const [text, setText] = useState('')
  const [said, setSaid] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])
  const swipe = useSheetSwipe(onClose)
  const submit = async (value: string, spoken = false) => {
    const plan = planAdds(value, data.items, { spoken })
    if (plan.length === 0) return
    setText('')
    const added: string[] = []
    const already: string[] = []
    for (const p of plan) {
      if (p.kind === 'new') { await data.add(p); added.push(p.name) }
      else if (p.kind === 'again') { await data.tick(p.id, false); added.push(p.name) }
      else already.push(p.name)
    }
    haptic()
    setSaid([added.length ? `Added ${added.join(', ')}` : '', already.length ? `${already.join(', ')} ${already.length > 1 ? 'were' : 'was'} on already` : ''].filter(Boolean).join(' · '))
  }
  const dictation = useFieldDictation({ onText: setText, onComplete: (full) => void submit(full, true) })
  const chips = data.usual.filter((n) => !planAdds(n, data.items).every((p) => p.kind === 'already')).slice(0, 8)
  return (
    <div className="phone-scrim absolute inset-0 z-30 bg-wall-ink/30" onClick={onClose}>
      <section
        {...swipe}
        aria-label="Add to groceries"
        onClick={(e) => e.stopPropagation()}
        className="phone-sheet absolute bottom-0 left-0 flex w-full flex-col gap-[10px] rounded-t-[22px] bg-phone-ground px-[14px] phone-kb-tight pb-[max(12px,env(safe-area-inset-bottom))] pt-[12px]"
      >
        {chips.length > 0 && (
          <div className="-mx-[14px] flex gap-[8px] overflow-x-auto px-[14px]">
            {chips.map((n) => (
              <button key={n} type="button" onClick={() => void submit(n)} className="flex h-[36px] shrink-0 items-center rounded-full border border-solid border-wall-stone bg-transparent px-[13px] text-phone-detail font-semibold text-wall-ink">+ {n}</button>
            ))}
          </div>
        )}
        <form className="flex items-center gap-[8px]" onSubmit={(e) => { e.preventDefault(); void submit(text) }}>
          <input
            ref={input}
            aria-label="What to add"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={dictation.listening ? 'Listening…' : 'Milk, eggs, the good coffee'}
            enterKeyHint="done"
            autoCapitalize="none"
            className="h-[48px] min-w-0 flex-1 rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[16px] text-phone-body text-wall-ink outline-none"
          />
          {dictation.supported && (
            <button type="button" aria-label={dictation.listening ? 'Stop listening' : 'Say it'} onClick={() => { dictation.toggle() }} className={`flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-2 border-solid p-0 ${dictation.listening ? 'border-wall-brass bg-wall-brass text-wall-on-pigment' : 'border-wall-ink bg-transparent text-wall-ink'}`}>
              <Mic size={20} />
            </button>
          )}
          <button type="submit" aria-label="Add" disabled={!text.trim()} className="flex h-[48px] w-[48px] shrink-0 items-center justify-center rounded-full border-0 bg-wall-ink p-0 text-wall-on-pigment disabled:opacity-40">
            <ArrowUp size={20} />
          </button>
        </form>
        <div role="status" className="min-h-[18px] text-phone-detail text-wall-ink-2">{said || 'Type or say a few at once; each lands in its aisle.'}</div>
      </section>
    </div>
  )
}
