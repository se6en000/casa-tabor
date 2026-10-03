import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ArrowUp, Check, ChevronLeft, Mic, Plus, ZoomIn, ZoomOut } from 'lucide-react'
import { useFieldDictation } from '../hooks/useFieldDictation'
import { ALL_AISLES, aisles, amountOf, planAdds, type ShopItem } from './groceries'
import { addSaid, useLiftToMove, useTickHold } from './useGroceryGestures'
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
  /** Into the right aisle (hold and drag): saved as a correction, so it's filed there next time. */
  move?: (id: string, category: string) => Promise<void> | void
}

/** The + held on Groceries: listening while held; let go adds what was said, slid off cancels. */
export interface GroceryVoice {
  holding: boolean
  cancelled: boolean
}

/** A moment after letting go for the last word to land before what was heard is added. */
export const SETTLE_MS = 350

export { HOLD_MS, LIFT_MS } from './useGroceryGestures'


export default function PhoneGroceries({ data, onBack, adding, setAdding, corner, voice = null, onVoiceDone }: {
  data: PhoneGroceriesData
  /** Top right of the title: your initial, on the tab. */
  corner?: ReactNode
  /** Opened as a page (from More): a back button, and its own + in the corner. */
  onBack?: () => void
  adding: boolean
  setAdding: (open: boolean) => void
  /** Hold + to say it (the tab bar's button): listening while held. */
  voice?: GroceryVoice | null
  onVoiceDone?: () => void
}) {
  const [voiceSaid, setVoiceSaid] = useState<string | null>(null)
  const voiceTimer = useRef<number | null>(null)
  useEffect(() => () => { if (voiceTimer.current) window.clearTimeout(voiceTimer.current) }, [])
  const showVoiceSaid = (text: string) => {
    setVoiceSaid(text)
    if (voiceTimer.current) window.clearTimeout(voiceTimer.current)
    voiceTimer.current = window.setTimeout(() => setVoiceSaid(null), 3500)
  }
  const [showDone, setShowDone] = useState(false)
  // Bigger text (Jake, Oct 2: "a magnifier button which will temporarily boost up the font 2-3X on all items so i can see
  // without my glasses. till I go to another page or switch out of the app"): this screen only, and off again when the
  // app goes to the background.
  const [big, setBig] = useState(false)
  useEffect(() => {
    const off = () => { if (document.visibilityState === 'hidden') setBig(false) }
    document.addEventListener('visibilitychange', off)
    return () => document.removeEventListener('visibilitychange', off)
  }, [])
  const { held, tap: tick } = useTickHold(data, haptic)
  const { groups, done } = useMemo(() => aisles(data.items, held), [data.items, held])
  const left = data.items.filter((i) => !i.checked).length
  const { lifted, over, cancel: cancelLift, moveTo, pressHandlers, swallowed } = useLiftToMove(data, haptic)
  const tap = (item: ShopItem) => { if (!swallowed()) tick(item) }
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
        {...pressHandlers(item)}
        className={`flex ${big ? 'min-h-[84px] gap-[16px] py-[12px]' : 'min-h-[56px] gap-[14px] py-[8px]'} w-full select-none items-center border-0 border-t border-solid border-wall-stone bg-transparent px-0 text-left text-wall-ink ${quiet ? 'opacity-50' : ''} ${lifted?.id === item.id ? 'rounded-[12px] bg-wall-brass/15 px-[8px] shadow-[0_6px_18px_rgba(38,34,29,0.2)]' : ''}`}
      >
        <span className={`flex ${big ? 'h-[44px] w-[44px]' : 'h-[28px] w-[28px]'} shrink-0 items-center justify-center rounded-full ${item.checked ? 'bg-wall-ink text-wall-on-pigment' : 'border-[1.75px] border-solid border-wall-ink-2'}`}>
          {item.checked && <Check size={big ? 26 : 16} strokeWidth={3} />}
        </span>
        <span className={`flex-1 ${big ? 'text-phone-magnified' : 'text-phone-body'} font-medium ${item.checked ? 'text-wall-ink-2' : ''}`}>
          {item.name}
          {amount && (big ? <span className="block text-phone-move font-bold text-wall-brass-ink">{amount}</span> : <span className="font-bold text-wall-brass-ink"> · {amount}</span>)}
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
          <div className="flex shrink-0 items-center gap-[10px]">
            <button type="button" aria-label="Bigger text" aria-pressed={big} onClick={() => { haptic(); setBig((b) => !b) }}
              className={`flex h-[44px] w-[44px] items-center justify-center rounded-full p-0 ${big ? 'border-0 bg-wall-brass text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}>
              {big ? <ZoomOut size={22} /> : <ZoomIn size={22} />}
            </button>
            {corner}
          </div>
        </div>
        {groups.map((g) => (
          <div key={g.key} className="flex flex-col">
            <h2 className={`m-0 pb-[4px] pt-[16px] font-body ${big ? 'text-phone-heading' : 'text-phone-label'} font-bold tracking-[0.16em] text-wall-brass-ink`}>{g.label}</h2>
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
      {voice && (
        <VoiceAdd
          voice={voice}
          onHeard={(text) => {
            const done = text.trim() ? addSaid(data, text, true) : null
            if (done) haptic()
            showVoiceSaid(done ? done.said : 'Didn’t catch that. Hold + and say it again.')
            void done?.saving.catch(() => showVoiceSaid('Some of that didn’t save. Try adding it again.'))
            onVoiceDone?.()
          }}
          onCancelled={() => onVoiceDone?.()}
          onCantListen={() => { onVoiceDone?.(); setAdding(true) }}
        />
      )}
      {voiceSaid && !voice && (
        <div role="status" aria-label="Added by voice" className="pointer-events-none absolute bottom-[104px] left-[16px] right-[16px] z-30 rounded-[16px] bg-wall-ink px-[16px] py-[12px] text-center text-phone-body font-semibold text-wall-on-pigment shadow-[0_6px_18px_rgba(38,34,29,0.3)]">
          {voiceSaid}
        </div>
      )}
      {lifted && (
        <section aria-label={`Move ${lifted.name}`} className="phone-sheet absolute inset-x-0 bottom-0 z-40 flex flex-col gap-[10px] rounded-t-[22px] bg-phone-ground px-[16px] pb-[max(18px,calc(env(safe-area-inset-bottom)+8px))] pt-[12px] shadow-[0_-12px_40px_rgba(38,34,29,0.2)]">
          <div className="flex items-center justify-between gap-[10px]">
            <span className="font-display text-phone-heading font-semibold text-wall-ink">Move {lifted.name} to…</span>
            <button type="button" onClick={cancelLift} className="flex h-[44px] items-center rounded-full border border-solid border-wall-stone bg-transparent px-[14px] text-phone-detail font-semibold text-wall-ink">Cancel</button>
          </div>
          <div className="grid grid-cols-2 gap-[8px]">
            {ALL_AISLES.map((a) => {
              const here = a.key === lifted.category || (a.key === 'other' && !ALL_AISLES.some((x) => x.key === lifted.category))
              return (
                <button key={a.key} type="button" data-aisle-key={a.key} aria-label={`To ${a.label.toLowerCase()}`} disabled={here} onClick={() => moveTo(lifted, a.key)}
                  className={`flex h-[46px] items-center justify-center rounded-[12px] px-[8px] text-phone-label font-bold tracking-[0.1em] ${over === a.key ? 'border-2 border-solid border-wall-ink bg-wall-brass/20 text-wall-ink' : here ? 'border border-dashed border-wall-stone bg-transparent text-wall-ink-2' : 'border border-solid border-wall-stone bg-wall-on-pigment text-wall-ink'}`}>
                  {a.label}
                </button>
              )
            })}
          </div>
        </section>
      )}
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
    const done = addSaid(data, value, spoken)
    if (!done) return
    haptic()
    setText('')
    void done.saving.catch(() => setSaid('Some of that didn’t save. Try adding it again.'))
    setSaid(done.said)
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

/**
 * Hold + and say it (Jake, Oct 2: "a voice fast lane to add to the grocery list … via holding the + button down"):
 * listening from the moment the hold starts, the words as they come; let go and they're on the list, no Casa, no card.
 * Slide off to the left to cancel. Where the phone can't listen, the add sheet opens instead.
 */
const canListen = () => typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)

function VoiceAdd({ voice, onHeard, onCancelled, onCantListen }: {
  voice: GroceryVoice
  onHeard: (text: string) => void
  onCancelled: () => void
  onCantListen: () => void
}) {
  const [words, setWords] = useState('')
  const finished = useRef(false)
  const heardRef = useRef(onHeard)
  useEffect(() => { heardRef.current = onHeard })
  const dictation = useFieldDictation({
    onText: setWords,
    webSpeechFirst: true,
    onComplete: (full) => {
      if (finished.current) return
      finished.current = true
      heardRef.current(full)
    },
  })
  const { start, stop } = dictation
  useEffect(() => {
    if (!canListen()) { onCantListen(); return }
    finished.current = false
    start()
    // Gone before letting go (or React's double run in development): what was heard is dropped.
    return () => { finished.current = true; stop() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (voice.holding) return
    if (voice.cancelled) { const was = finished.current; finished.current = true; stop(); if (!was) onCancelled(); return }
    const t = window.setTimeout(() => stop(), SETTLE_MS)
    return () => window.clearTimeout(t)
  }, [voice.holding, voice.cancelled]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <section aria-label="Listening for groceries" className="phone-sheet absolute bottom-[100px] left-[12px] right-[12px] z-30 flex flex-col gap-[6px] rounded-[20px] bg-phone-ground px-[18px] py-[16px] shadow-[0_10px_34px_rgba(38,34,29,0.28)]">
      <div className="flex items-center gap-[8px] text-phone-label font-bold tracking-[0.12em] text-wall-brass-ink">
        <Mic size={16} aria-hidden="true" />
        {voice.holding ? 'LISTENING' : 'ADDING'}
      </div>
      <div className="min-h-[30px] font-display text-phone-heading font-semibold text-wall-ink">{words || 'Say what to add…'}</div>
      <div className="text-phone-detail text-wall-ink-2">Let go to add · slide left to cancel</div>
    </section>
  )
}
