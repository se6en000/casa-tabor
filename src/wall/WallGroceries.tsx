import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Check, House, Mic } from 'lucide-react'
import { Link } from 'react-router-dom'
import { ALL_AISLES, aisles, amountOf, type ShopItem } from '../phone/groceries'
import type { PhoneGroceriesData } from '../phone/PhoneGroceries'
import { addSaid, useLiftToMove, useTickHold } from '../phone/useGroceryGestures'
import { voiceFinal } from './assistant'
import { WallSpeechContext } from './speechContext'
import WallKeyboard from './WallKeyboard'

// The Wall's Grocery page, v2 (canvas 35a–35d; Jake, Oct 2: "build it, looks beautiful"). The same list as the phone, made
// for the wide screen: what's left by aisle in three columns, big rows, the amount in brass; adding on the right — type
// on the Wall's keyboard, or hold the mic and say a few at once (straight on the list, no card), or tap a usual item; a
// tick waits a moment before the ticked ones leave together; hold an item to move it to its aisle. The old page stays
// behind "Classic page" for recipe import and pantry restock.

/** How far a held mic slides before letting go cancels. */
const CANCEL_PX = 90
/** After letting go: how long to wait for the last words before adding what was heard. */
const LAST_WORDS_MS = 1500
/** How long something just added is marked NEW. */
const NEW_MS = 4000

const key = (name: string) => name.trim().toLowerCase()

export default function WallGroceries({ data, syncStale = false }: { data: PhoneGroceriesData; syncStale?: boolean }) {
  const { held, tap: tick } = useTickHold(data)
  const { groups, done } = useMemo(() => aisles(data.items, held), [data.items, held])
  const left = data.items.filter((i) => !i.checked).length
  const ticking = groups.reduce((n, g) => n + g.items.filter((i) => i.checked).length, 0)
  const { lifted, over, cancel, moveTo, pressHandlers, swallowed } = useLiftToMove(data)
  const tap = (item: ShopItem) => { if (!swallowed()) tick(item) }
  const [showDone, setShowDone] = useState(false)

  // What was just added: marked NEW for a moment, and said in a line under the mic.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set())
  const [said, setSaid] = useState<string | null>(null)
  const freshTimer = useRef<number | null>(null)
  useEffect(() => () => { if (freshTimer.current) window.clearTimeout(freshTimer.current) }, [])
  const add = (text: string, spoken: boolean) => {
    const result = text.trim() ? addSaid(data, text, spoken) : null
    if (!result) { setSaid(spoken ? 'Didn’t catch that. Hold the mic and say it again.' : null); return }
    setSaid(result.said)
    setFresh(new Set(result.added.map(key)))
    if (freshTimer.current) window.clearTimeout(freshTimer.current)
    freshTimer.current = window.setTimeout(() => setFresh(new Set()), NEW_MS)
    void result.saving.catch(() => setSaid('Some of that didn’t save. Try adding it again.'))
  }

  const [typing, setTyping] = useState<string | null>(null)
  const voice = useHoldToSay((text) => add(text, true))
  const chips = data.usual.filter((n) => !data.items.some((i) => !i.checked && key(i.name) === key(n))).slice(0, 8)

  const row = (item: ShopItem, quiet = false) => {
    const amount = amountOf(item)
    const isNew = fresh.has(key(item.name))
    const isLifted = lifted?.id === item.id
    return (
      <button
        key={item.id}
        type="button"
        aria-pressed={item.checked}
        aria-label={`${item.name}${amount ? `, ${amount}` : ''}${item.checked ? ', got it' : ''}`}
        onClick={() => tap(item)}
        {...pressHandlers(item)}
        className={`flex min-h-[66px] w-full select-none items-center gap-[18px] border-0 border-t border-solid bg-transparent py-[8px] text-left font-body text-wall-ink ${quiet ? 'opacity-50' : ''} ${isLifted ? 'rounded-[14px] border-transparent bg-wall-on-pigment px-[14px] shadow-[0_10px_26px_rgba(38,34,29,0.22)]' : isNew ? 'rounded-[14px] border-transparent bg-wall-brass/15 px-[14px]' : 'border-wall-rule px-0'}`}
      >
        <span className={`flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-full ${item.checked ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>
          {item.checked && <Check size={20} strokeWidth={3} />}
        </span>
        <span className={`whitespace-nowrap text-wall-answer font-medium ${item.checked ? 'text-wall-ink-2 line-through decoration-2' : ''}`}>
          {item.name}
          {amount && <span className="font-bold text-wall-brass-ink"> · {amount}</span>}
        </span>
        {isNew && <span className="ml-auto text-wall-detail font-bold tracking-[0.12em] text-wall-brass-ink">NEW</span>}
        {isLifted && <span className="ml-auto text-wall-detail font-bold tracking-[0.12em] text-wall-brass-ink">MOVING</span>}
      </button>
    )
  }

  return (
    <section aria-label="Groceries" className="relative h-[1080px] w-[1920px] overflow-hidden bg-wall-ground px-[56px] pt-[40px] font-body text-wall-ink">
      <header className="flex h-[96px] items-center gap-[28px]">
        <Link to="/wall" className="flex h-[60px] items-center gap-[10px] rounded-full border-[1.5px] border-solid border-wall-rule pl-[18px] pr-[24px] text-wall-body font-semibold text-wall-ink no-underline">
          <House size={24} aria-hidden="true" /> Wall
        </Link>
        <div className="flex items-baseline gap-[22px]">
          <h1 className="m-0 font-display text-wall-title font-bold text-wall-ink">Groceries</h1>
          <span className="text-wall-answer text-wall-ink-2">{data.loading ? 'Loading…' : left === 0 ? 'Nothing to get' : `${left} to get`}</span>
        </div>
        <div className="ml-auto flex items-center gap-[28px] text-wall-detail text-wall-ink-2">
          {syncStale
            ? <span className="font-semibold text-wall-rust">Reminders hasn’t synced lately — is the Mac on?</span>
            : <span className="flex items-center gap-[8px]"><Check size={20} strokeWidth={2.4} aria-hidden="true" /> On everyone’s phone and Reminders</span>}
          <Link to="/grocery" className="text-wall-ink-2 underline underline-offset-4">Classic page</Link>
        </div>
      </header>

      <div className="mt-[26px] grid h-[900px] grid-cols-[1fr_520px] gap-[56px]">
        <div data-grocery-scroll className="h-[900px] overflow-y-auto overscroll-contain pb-[120px]">
          <div className="columns-3 gap-x-[56px]">
            {groups.map((g) => (
              <section key={g.key} aria-label={g.label} className="mb-[30px] break-inside-avoid">
                <h2 className="m-0 mb-[6px] font-body text-wall-detail font-bold uppercase tracking-[0.18em] text-wall-brass-ink">{g.label}</h2>
                {g.items.map((i) => row(i))}
              </section>
            ))}
            {!data.loading && groups.length === 0 && (
              <p className="m-0 break-inside-avoid text-wall-answer text-wall-ink-2">Nothing on the list. Add what you need on the right.</p>
            )}
            {done.length > 0 && (
              <section className="break-inside-avoid">
                <button type="button" aria-expanded={showDone} onClick={() => setShowDone((s) => !s)} className="flex h-[64px] w-full items-center justify-between rounded-[18px] border-0 bg-wall-on-pigment/60 px-[22px] text-left text-wall-heading font-semibold text-wall-ink">
                  <span>Got · {done.length}</span>
                  <span className="font-medium text-wall-ink-2">{showDone ? 'Hide' : 'Show'}</span>
                </button>
                {showDone && (
                  <>
                    {done.map((i) => row(i, true))}
                    <button type="button" onClick={() => { void data.clearDone(); setShowDone(false) }} className="mt-[12px] flex h-[56px] items-center rounded-full border-[1.5px] border-solid border-wall-ink-2 bg-transparent px-[24px] text-wall-body font-semibold text-wall-ink">
                      Clear them
                    </button>
                  </>
                )}
              </section>
            )}
          </div>
        </div>

        <aside className="h-[900px] pb-[40px]">
          {lifted ? (
            <div aria-label={`Move ${lifted.name}`} className="flex h-full flex-col gap-[20px] rounded-[28px] bg-wall-on-pigment/60 p-[34px]">
              <h2 className="m-0 font-display text-wall-date-calm font-bold text-wall-ink">Move {lifted.name} to…</h2>
              <p className="m-0 text-wall-body text-wall-ink-2">Let go on its aisle, or tap one. It goes there next time too.</p>
              <div className="grid grid-cols-2 gap-[12px]">
                {ALL_AISLES.filter((a) => a.key !== 'other' || lifted.category === 'other').map((a) => {
                  const here = a.key === lifted.category
                  return (
                    <button key={a.key} type="button" data-aisle-key={a.key} aria-label={`To ${a.label.toLowerCase()}`} disabled={here} onClick={() => moveTo(lifted, a.key)}
                      className={`flex h-[70px] items-center justify-center rounded-[16px] px-[8px] text-wall-detail font-bold tracking-[0.1em] ${over === a.key ? 'border-[2.5px] border-solid border-wall-ink bg-wall-brass/20 text-wall-ink' : here ? 'border-[1.5px] border-dashed border-wall-stone bg-transparent text-wall-ink-2' : 'border-[1.5px] border-solid border-wall-stone bg-wall-on-pigment text-wall-ink'}`}>
                      {a.label}
                    </button>
                  )
                })}
              </div>
              <button type="button" onClick={cancel} className="flex h-[60px] items-center self-start rounded-full border-[1.5px] border-solid border-wall-ink-2 bg-transparent px-[28px] text-wall-body font-semibold text-wall-ink">Cancel</button>
            </div>
          ) : (
            <div aria-label="Add to the list" className="flex h-full flex-col gap-[22px] rounded-[28px] bg-wall-on-pigment/60 p-[34px]">
              <h2 className="m-0 font-display text-wall-date-calm font-bold text-wall-ink">Add to the list</h2>
              {voice.listening ? (
                <div role="status" aria-label="Listening" className="flex flex-col gap-[12px] rounded-[22px] bg-wall-on-pigment px-[28px] py-[26px] shadow-[0_8px_24px_rgba(38,34,29,0.14)]">
                  <span className="flex items-center gap-[10px] text-wall-detail font-bold tracking-[0.14em] text-wall-brass-ink">
                    <Mic size={20} aria-hidden="true" /> {voice.cancelling ? 'LET GO TO CANCEL' : 'LISTENING · LET GO TO ADD'}
                  </span>
                  <span className="font-display text-wall-date-calm font-semibold">{voice.words || 'Say what to add…'}</span>
                </div>
              ) : (
                <button type="button" aria-label="Type what to add" onClick={() => setTyping('')} className="flex h-[76px] w-full items-center rounded-full border-[1.5px] border-solid border-wall-stone bg-wall-on-pigment px-[28px] text-left text-wall-heading text-wall-ink-2">
                  {typing || 'Milk, eggs, the good coffee'}
                </button>
              )}
              <div className="flex items-center gap-[20px]">
                <button
                  type="button"
                  aria-label="Hold to say what to add"
                  data-active={voice.listening || undefined}
                  {...voice.handlers}
                  className={`flex h-[96px] w-[96px] shrink-0 touch-none select-none items-center justify-center rounded-full border-0 text-wall-on-pigment ${voice.listening ? 'bg-wall-brass shadow-[0_0_0_12px_rgba(168,132,80,0.25)]' : 'bg-wall-ink'}`}
                >
                  <Mic size={40} strokeWidth={2} />
                </button>
                <span className="text-wall-body text-wall-ink-2">{voice.listening ? 'Slide away to cancel' : 'Hold the mic and say a few at once. Each goes in its aisle.'}</span>
              </div>
              {said && <p role="status" aria-label="What was added" className="m-0 text-wall-body text-wall-ink-2">{said}</p>}
              {chips.length > 0 && (
                <>
                  <span className="mt-[8px] text-wall-detail font-bold tracking-[0.16em] text-wall-ink-2">YOUR USUALS</span>
                  <div className="grid grid-cols-2 gap-[12px]">
                    {chips.map((n) => (
                      <button key={n} type="button" onClick={() => add(n, false)} className="flex h-[62px] items-center whitespace-nowrap rounded-full border-[1.5px] border-solid border-wall-stone bg-transparent px-[18px] text-left text-wall-body font-semibold text-wall-ink">
                        + {n}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </aside>
      </div>

      {ticking > 0 && (
        <div role="status" className="pointer-events-none absolute bottom-[40px] left-[56px] flex h-[64px] items-center gap-[12px] rounded-full bg-wall-ink px-[28px] text-wall-heading font-semibold text-wall-on-pigment shadow-[0_10px_30px_rgba(38,34,29,0.3)]">
          <Check size={22} strokeWidth={2.6} aria-hidden="true" /> {ticking} ticked · they’ll clear in a moment
        </div>
      )}
      {typing !== null && (
        <WallKeyboard showsValue value={typing} onChange={setTyping} onDone={() => { add(typing, false); setTyping(null) }} onCancel={() => setTyping(null)} />
      )}
    </section>
  )
}

/**
 * Hold the mic and say it (canvas 35b): listening from the press, the words as they come; let go and what was said is
 * added (the Wall's own speech-to-text, as its keyboard's mic); slide away and let go to cancel.
 */
function useHoldToSay(onHeard: (text: string) => void) {
  const useSpeech = useContext(WallSpeechContext)
  const [words, setWords] = useState('')
  const [cancelling, setCancelling] = useState(false)
  // idle → holding (pressed) → waiting (let go, the last words coming) → idle
  const [phase, setPhase] = useState<'idle' | 'holding' | 'waiting'>('idle')
  const heard = useRef<string[]>([])
  const captured = useRef('')
  const interim = useRef('')
  const released = useRef(false)
  const finished = useRef(true)
  const timer = useRef<number | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const heardRef = useRef(onHeard)
  useEffect(() => { heardRef.current = onHeard })
  const show = () => setWords([...heard.current, captured.current || interim.current].filter(Boolean).join(', '))
  const flush = () => {
    if (finished.current) return
    finished.current = true
    setPhase('idle')
    if (timer.current) window.clearTimeout(timer.current)
    const text = [...heard.current, captured.current || interim.current].filter(Boolean).join(', ')
    setWords('')
    heardRef.current(text)
  }
  // The callbacks read refs only when words arrive, never while rendering (the same hook as the band and the keyboard).
  // eslint-disable-next-line react-hooks/refs
  const speech = useSpeech({
    onInterim: (text) => { interim.current = text.trim(); show() },
    onFinalTranscript: (text) => {
      const step = voiceFinal(captured.current, text)
      captured.current = step.captured
      if (step.toSend) { heard.current.push(step.toSend); captured.current = ''; interim.current = '' }
      show()
      if (step.toSend && released.current) flush()
    },
    onDismiss: () => {},
    onConfirm: () => {},
    onCancel: () => {},
    hasPendingAction: false,
  })
  const stopRef = useRef(speech.stop)
  useEffect(() => { stopRef.current = speech.stop })
  useEffect(() => () => { void stopRef.current(); if (timer.current) window.clearTimeout(timer.current) }, [])
  const listening = phase !== 'idle'
  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
      start.current = { x: e.clientX, y: e.clientY }
      heard.current = []
      captured.current = ''
      interim.current = ''
      released.current = false
      finished.current = false
      setCancelling(false)
      setWords('')
      setPhase('holding')
      void speech.start()
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!start.current || finished.current) return
      // The stage is scaled; the distance is measured in screen pixels, which is near enough for a slide.
      setCancelling(Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > CANCEL_PX)
    },
    onPointerUp: () => {
      if (finished.current) return
      start.current = null
      released.current = true
      if (cancelling) {
        finished.current = true
        setCancelling(false)
        setWords('')
        setPhase('idle')
        void speech.stop()
        return
      }
      setPhase('waiting')
      speech.finish()
      // The last words usually land a moment after letting go; if not, what's on screen is what was said.
      timer.current = window.setTimeout(flush, LAST_WORDS_MS)
      if (heard.current.length && !captured.current && !interim.current) flush()
    },
    onPointerCancel: () => { finished.current = true; setWords(''); setPhase('idle'); void speech.stop() },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  }
  return { listening, words, cancelling, handlers }
}
