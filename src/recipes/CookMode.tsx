import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, ListOrdered, Pause, Play, Timer, X } from 'lucide-react'
import { useRecipesSource, type CookPlace, type CookTimer, type Recipe } from './data'
import { useLayout, useT } from './layout'
import { linesFor, servingChoices, splitAmount, stepTimers, stepUses } from './model'
import { Label, Pill, Sheet } from './ui'
import { formatRecipeTitle } from '../pages/CookPage.helpers'

// Cooking (canvas 49c/49f; Jake: "a cooking experience on both the wall and more importantly my phone/tablet"): one
// step at a time, big; a step's own times as timers; what the step uses, ticked as you go. Your place — the step, who
// it serves, the ticks and the timers — is kept for every device, so a phone and the wall show the same recipe.

const SAVE_AFTER_MS = 400

function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const r = s % 60
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}` : `${m}:${String(r).padStart(2, '0')}`
}

const leftOf = (timer: CookTimer, nowMs: number) => (timer.ends_at ? (new Date(timer.ends_at).getTime() - nowMs) / 1000 : timer.left)

/** Three short tones and a buzz: a timer is done. */
function ring() {
  try { navigator.vibrate?.([300, 150, 300, 150, 300]) } catch { /* no buzz here */ }
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    for (let i = 0; i < 3; i++) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.45)
      gain.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + i * 0.45 + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.45 + 0.3)
      osc.connect(gain).connect(ctx.destination)
      osc.start(ctx.currentTime + i * 0.45)
      osc.stop(ctx.currentTime + i * 0.45 + 0.32)
    }
    window.setTimeout(() => void ctx.close(), 1800)
  } catch { /* no sound here */ }
}

/** The screen stays on while you cook (where the browser allows it). */
function useAwake() {
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } }
    const ask = () => { if (document.visibilityState === 'visible') nav.wakeLock?.request('screen').then((l) => { lock = l }).catch(() => {}) }
    ask()
    document.addEventListener('visibilitychange', ask)
    return () => { document.removeEventListener('visibilitychange', ask); void lock?.release().catch(() => {}) }
  }, [])
}

export default function CookMode({ recipe, place, startServings, onClose, onFinished }: {
  recipe: Recipe
  place: CookPlace | null
  startServings: number
  onClose: () => void
  onFinished: (timesMade: number) => void
}) {
  const src = useRecipesSource()
  const layout = useLayout()
  const t = useT()
  const total = Math.max(1, recipe.steps.length)
  const [step, setStep] = useState(() => Math.min(place?.step ?? 0, total - 1))
  const [servings] = useState(() => place?.servings_index ?? startServings)
  const [ticked, setTicked] = useState<number[]>(() => place?.ticked ?? [])
  const [timers, setTimers] = useState<CookTimer[]>(() => place?.timers ?? [])
  const [nowMs, setNowMs] = useState(() => src.now().getTime())
  const [sheet, setSheet] = useState<'steps' | 'ingredients' | null>(null)
  const [finishing, setFinishing] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const rung = useRef(new Set<string>())
  const savedAt = useRef(0)
  useAwake()

  // The clock for the timers, and a ring for each that runs out.
  useEffect(() => {
    const tick = window.setInterval(() => setNowMs(src.now().getTime()), 1000)
    return () => window.clearInterval(tick)
  }, [src])
  useEffect(() => {
    for (const timer of timers) {
      if (timer.ends_at && leftOf(timer, nowMs) <= 0 && !rung.current.has(timer.id)) { rung.current.add(timer.id); ring() }
    }
  }, [nowMs, timers])

  // Keep your place: saved a moment after each change.
  const first = useRef(true)
  useEffect(() => {
    if (first.current) { first.current = false; if (place) return }
    const timer = window.setTimeout(() => {
      savedAt.current = Date.now()
      void src.saveCooking({ recipe_id: recipe.id, step, servings_index: servings, ticked, timers })
    }, SAVE_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [step, servings, ticked, timers]) // eslint-disable-line react-hooks/exhaustive-deps
  // Moved along on another device: follow it.
  useEffect(() => {
    if (!place || place.device === src.deviceName || new Date(place.updated_at).getTime() <= savedAt.current) return
    savedAt.current = new Date(place.updated_at).getTime()
    setStep(Math.min(place.step, total - 1))
    setTicked(place.ticked)
    setTimers(place.timers)
  }, [place?.updated_at]) // eslint-disable-line react-hooks/exhaustive-deps

  const lines = useMemo(() => linesFor(recipe, servings), [recipe, servings])
  const text = recipe.steps[step] ?? 'No steps written down for this one.'
  const uses = useMemo(() => stepUses(text, recipe.ingredients), [text, recipe.ingredients])
  const offers = stepTimers(text).filter((o) => !timers.some((tm) => tm.step === step && tm.label === o.label))
  const servingLabel = servingChoices(recipe.servings)[servings]?.label
  const name = formatRecipeTitle(recipe.name)
  const last = step >= total - 1
  const wall = layout === 'wall'

  const go = (to: number) => setStep(Math.max(0, Math.min(total - 1, to)))
  const tick = (i: number) => setTicked((s) => (s.includes(i) ? s.filter((x) => x !== i) : [...s, i]))
  const startTimer = (label: string, seconds: number) => { const at = src.now().getTime(); setTimers((ts) => [...ts, { id: `${at}-${ts.length}`, label, ends_at: new Date(at + seconds * 1000).toISOString(), left: seconds, step }]) }
  const toggleTimer = (id: string) => setTimers((ts) => ts.map((tm) => (tm.id !== id ? tm : tm.ends_at
    ? { ...tm, ends_at: null, left: Math.max(0, leftOf(tm, src.now().getTime())) }
    : { ...tm, ends_at: new Date(src.now().getTime() + tm.left * 1000).toISOString() })))
  const dropTimer = (id: string) => setTimers((ts) => ts.filter((tm) => tm.id !== id))
  const finish = async () => {
    setFinishing(true)
    const r = await src.finishCooking(recipe.id)
    setFinishing(false)
    if (r.ok) onFinished(recipe.cooked_count + 1)
  }

  // A swipe across the step moves it (phone and tablet), as a page turns.
  const swipe = useRef<{ x: number; y: number } | null>(null)
  const swipeProps = layout === 'wall' ? {} : {
    onPointerDown: (e: React.PointerEvent) => { swipe.current = { x: e.clientX, y: e.clientY } },
    onPointerUp: (e: React.PointerEvent) => {
      const s = swipe.current
      swipe.current = null
      if (!s) return
      const dx = e.clientX - s.x
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) go(step + (dx < 0 ? 1 : -1))
    },
  }

  const timerBar = timers.length > 0 && (
    <div className="flex flex-col gap-[8px]" aria-label="Timers">
      {timers.map((tm) => {
        const left = leftOf(tm, nowMs)
        const done = Boolean(tm.ends_at) && left <= 0
        return (
          <div key={tm.id} className={`flex items-center gap-[12px] rounded-[16px] px-[14px] ${layout === 'wall' ? 'min-h-[76px]' : 'min-h-[60px]'} ${done ? 'bg-wall-brass text-wall-ink' : 'bg-wall-ink text-wall-on-pigment'}`}>
            <Timer size={t.icon} aria-hidden="true" className={done ? 'text-wall-ink' : 'text-wall-night-brass'} />
            <div className="min-w-0 flex-1">
              <div className={`truncate font-semibold ${t.detail}`}>{done ? 'Time’s up' : `Step ${tm.step + 1} · ${tm.label}`}</div>
              <div className={`opacity-80 ${t.label}`}>{done ? `Step ${tm.step + 1} · ${tm.label}` : tm.ends_at ? 'Running' : 'Paused'}</div>
            </div>
            <span className={`font-display font-bold lining-nums ${layout === 'wall' ? 'text-wall-countdown-long' : 'text-phone-move'}`} aria-live="polite">{done ? '0:00' : clock(left)}</span>
            {!done && (
              <button type="button" aria-label={tm.ends_at ? 'Pause the timer' : 'Start the timer again'} onClick={() => toggleTimer(tm.id)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-wall-on-pigment/15 p-0 text-current">
                {tm.ends_at ? <Pause size={20} /> : <Play size={20} />}
              </button>
            )}
            <button type="button" aria-label="Remove the timer" onClick={() => dropTimer(tm.id)} className="flex h-[44px] w-[44px] items-center justify-center rounded-full border-0 bg-transparent p-0 text-current"><X size={20} /></button>
          </div>
        )
      })}
    </div>
  )

  // The step's own ingredients, always highlighted (Jake, Oct 6: "make sure it keeps the ingredient highlights for the
  // steps function, thats a cool feature that i want to keep no matter what"): the "For this step" card, and a mark in
  // the whole list.
  const row = (i: number, size: 'big' | 'small', marked = false) => {
    const [amount, rest] = splitAmount(lines[i])
    const on = ticked.includes(i)
    const big = size === 'big'
    return (
      <li key={i}>
        <button type="button" aria-pressed={on} onClick={() => tick(i)}
          className={`flex w-full items-center gap-[14px] border-0 border-t border-solid border-wall-stone bg-transparent p-0 text-left font-body ${big ? (wall ? 'min-h-[64px]' : 'min-h-[54px]') : 'min-h-[46px]'} ${big ? t.body : t.detail} ${on ? 'text-wall-ink-2 line-through' : 'text-wall-ink'}`}>
          <span className={`flex shrink-0 items-center justify-center rounded-full ${big ? (wall ? 'h-[34px] w-[34px]' : 'h-[28px] w-[28px]') : 'h-[24px] w-[24px]'} ${on ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>{on && <Check size={big ? 18 : 15} strokeWidth={2.6} />}</span>
          <span className={`shrink-0 font-bold ${on ? 'text-wall-ink-2' : 'text-wall-brass-ink'} ${wall ? 'w-[120px]' : layout === 'tablet' ? 'w-[92px]' : 'w-[84px]'}`}>{amount}</span>{' '}
          <span className="min-w-0 flex-1">{rest}</span>
          {marked && <span className={`shrink-0 font-bold uppercase tracking-[0.16em] text-wall-brass-ink no-underline ${t.label}`}>This step</span>}
        </button>
      </li>
    )
  }
  const others = lines.map((_, i) => i).filter((i) => !uses.includes(i))
  const [allOthers, setAllOthers] = [showAll, setShowAll]
  const thisStep = (
    <section aria-label="For this step" className={`rounded-[24px] bg-wall-on-pigment ${wall ? 'px-[30px] pb-[20px] pt-[26px]' : layout === 'tablet' ? 'px-[26px] pb-[16px] pt-[22px]' : 'px-[16px] pb-[8px] pt-[14px]'}`}>
      <h2 className={`m-0 font-body font-bold uppercase tracking-[0.22em] text-wall-brass-ink ${t.label}`}>For this step</h2>
      {uses.length
        ? <ul className="m-0 mt-[8px] list-none p-0">{uses.map((i) => row(i, 'big'))}</ul>
        : <p className={`m-0 py-[12px] text-wall-ink-2 ${t.detail}`}>Nothing to measure for this one.</p>}
      {layout !== 'phone' && others.length > 0 && (
        <>
          <div className={`mt-[20px] flex items-baseline justify-between font-bold uppercase tracking-[0.22em] text-wall-ink-2 ${t.label}`}>
            <span>Everything else</span><span className="font-medium normal-case tracking-normal">{others.filter((i) => ticked.includes(i)).length} of {others.length} ready</span>
          </div>
          <ul className="m-0 mt-[6px] list-none p-0">{(allOthers ? others : others.slice(0, 4)).map((i) => row(i, 'small'))}</ul>
          {others.length > 4 && (
            <button type="button" onClick={() => setAllOthers(!allOthers)} className={`flex min-h-[44px] items-center border-0 bg-transparent p-0 font-body font-semibold text-wall-brass-ink ${t.detail}`}>
              {allOthers ? 'Fewer' : `And ${others.length - 4} more`}
            </button>
          )}
        </>
      )}
    </section>
  )

  const numeral = (
    <div className="flex items-baseline gap-[12px]">
      <span className={`font-display font-semibold text-wall-brass lining-nums ${layout === 'phone' ? 'text-phone-numeral' : 'text-wall-numeral'}`}>{step + 1}</span>
      <span className={`font-bold tracking-[0.24em] text-wall-ink-2 ${t.label}`}>OF {total}</span>
    </div>
  )
  // A long step steps down a size, so it stays above Back and Next.
  const long = text.length > 150
  const stepSize = layout === 'phone' ? (text.length > 220 ? 'text-phone-heading' : 'text-phone-move') : wall ? (long ? 'text-wall-move' : 'text-wall-title') : (long ? 'text-phone-magnified' : 'text-wall-move')
  const stepBlock = (
    <section aria-label={`Step ${step + 1} of ${total}`} {...swipeProps} className="flex touch-pan-y select-none flex-col gap-[22px]">
      {numeral}
      <p className={`m-0 font-display font-semibold leading-[1.12] text-wall-ink ${stepSize}`}>{text}</p>
      {offers.length > 0 && (
        <div className="flex flex-wrap gap-[10px]">
          {offers.map((o) => <Pill key={o.label} tone="brass" onClick={() => startTimer(o.label, o.seconds)}><Timer size={t.icon - 2} />Start a {o.label} timer</Pill>)}
        </div>
      )}
    </section>
  )
  const nextText = recipe.steps[step + 1]
  const nextButton = last ? (
    <button type="button" disabled={finishing} onClick={() => void finish()}
      className={`flex flex-1 items-center justify-center rounded-full border-0 bg-wall-ink font-body font-bold text-wall-on-pigment disabled:opacity-50 ${wall ? 'h-[92px] text-wall-heading' : layout === 'tablet' ? 'h-[84px] text-phone-heading' : 'h-[72px] text-phone-body'}`}>
      {finishing ? 'Saving…' : 'Done cooking'}
    </button>
  ) : (
    <button type="button" aria-label="Next step" onClick={() => go(step + 1)}
      className={`flex min-w-0 flex-1 items-center justify-between gap-[16px] rounded-full border-0 bg-wall-ink text-left font-body text-wall-on-pigment ${wall ? 'h-[92px] px-[40px]' : layout === 'tablet' ? 'h-[84px] px-[34px]' : 'h-[72px] px-[22px]'}`}>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className={`font-bold tracking-[0.22em] text-wall-night-brass ${t.label}`}>NEXT · STEP {step + 2}</span>
        <span className={`truncate ${layout === 'phone' ? 'text-phone-detail' : t.body}`}>{nextText}</span>
      </span>
      <ChevronRight size={wall ? 34 : 28} aria-hidden="true" className="shrink-0" />
    </button>
  )
  const backButton = (
    <button type="button" onClick={() => go(step - 1)} disabled={step === 0}
      className={`shrink-0 rounded-full border border-solid border-wall-stone bg-transparent font-body font-semibold text-wall-ink disabled:opacity-35 ${wall ? 'h-[80px] w-[170px] text-wall-body' : layout === 'tablet' ? 'h-[72px] w-[150px] text-phone-heading' : 'h-[72px] w-[72px] text-phone-detail'}`}>
      Back
    </button>
  )
  const dots = (
    <div aria-hidden="true" className="flex items-center gap-[6px]">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-[10px] rounded-full ${i === step ? 'w-[28px] bg-wall-ink' : `w-[10px] ${i < step ? 'bg-wall-ink-2' : 'bg-wall-stone'}`}`} />)}
    </div>
  )
  const allSteps = (
    <button type="button" aria-label="All steps" onClick={() => setSheet('steps')}
      className={`flex shrink-0 items-center justify-center gap-[8px] rounded-full border border-solid border-wall-stone bg-transparent font-body font-semibold text-wall-ink ${layout === 'phone' ? 'h-[44px] w-[44px] p-0' : `${t.pill} px-[20px] ${t.body}`}`}>
      <ListOrdered size={t.icon - 2} />{layout !== 'phone' && 'All steps'}
    </button>
  )
  const close = (
    <button type="button" aria-label="Close — your place is kept" onClick={onClose}
      className={`flex shrink-0 items-center justify-center gap-[6px] rounded-full border border-solid border-wall-stone bg-transparent font-body font-semibold text-wall-ink ${layout === 'phone' ? 'h-[44px] w-[44px] p-0' : `${t.pill} pl-[14px] pr-[20px] ${t.body}`}`}>
      <X size={t.icon - 2} />{layout !== 'phone' && 'Close'}
    </button>
  )
  const sheets = (
    <>
      {sheet === 'ingredients' && (
        <Sheet label="All ingredients" onClose={() => setSheet(null)}>
          <Label right={`${ticked.length} of ${lines.length} ready`}>All ingredients</Label>
          <ul className="m-0 list-none p-0">{lines.map((_, i) => row(i, 'small', uses.includes(i)))}</ul>
          <div className="mt-[14px] flex justify-end"><Pill onClick={() => setSheet(null)}>Done</Pill></div>
        </Sheet>
      )}
      {sheet === 'steps' && (
        <Sheet label="All steps" onClose={() => setSheet(null)}>
          <Label>All steps</Label>
          <ol className="m-0 list-none p-0">
            {recipe.steps.map((s, i) => (
              <li key={i}>
                <button type="button" aria-current={i === step ? 'step' : undefined} onClick={() => { go(i); setSheet(null) }}
                  className={`flex w-full gap-[12px] border-0 border-b border-solid border-wall-stone bg-transparent py-[12px] text-left font-body ${t.body} ${i === step ? 'font-semibold text-wall-ink' : 'text-wall-ink-2'}`}>
                  <span className="w-[26px] shrink-0 font-display font-bold text-wall-brass-ink">{i + 1}</span><span>{s}</span>
                </button>
              </li>
            ))}
          </ol>
          <div className="mt-[14px] flex justify-between gap-[10px]">
            <Pill tone="rust" onClick={() => { void src.dropCooking(recipe.id); setStep(0); setTicked([]); setTimers([]); setSheet(null) }}>Start over</Pill>
            <Pill onClick={() => setSheet(null)}>Done</Pill>
          </div>
        </Sheet>
      )}
    </>
  )

  if (layout === 'phone') {
    // 51b: the number, the step, its ingredients in a card; Back and Next (with the next step) at your thumb.
    return (
      <section aria-label={`Cooking ${name}`} className="flex flex-col gap-[18px] pb-[110px] text-wall-ink">
        <header className="flex items-center gap-[10px]">
          {close}
          <div className="min-w-0 flex-1">
            <div className="truncate font-display text-phone-heading font-bold leading-none">{name}</div>
            {servingLabel && /\d/.test(servingLabel) && <div className="mt-[3px] text-phone-label text-wall-ink-2">Serves {servingLabel}</div>}
          </div>
          {allSteps}
        </header>
        {stepBlock}
        {timerBar}
        {thisStep}
        <button type="button" onClick={() => setSheet('ingredients')} className="flex min-h-[44px] items-center border-0 bg-transparent p-0 font-body text-phone-detail font-semibold text-wall-brass-ink">All ingredients · {ticked.length} of {lines.length} ready</button>
        <div className="fixed bottom-[max(18px,calc(env(safe-area-inset-bottom)+8px))] left-[12px] right-[12px] z-30 flex gap-[8px]">{backButton}{nextButton}</div>
        {sheets}
      </section>
    )
  }

  // 51a: the number big in brass, the step beside its ingredients; Back, the dots and Next along the bottom.
  return (
    <section aria-label={`Cooking ${name}`} className="flex min-h-[100dvh] flex-col text-wall-ink">
      <header className={`flex items-center gap-[16px] border-0 border-b border-solid border-wall-stone ${wall ? 'px-[64px] py-[20px]' : 'px-[48px] py-[16px]'}`}>
        {close}
        {recipe.image_url && <img src={recipe.image_url} alt="" className={`shrink-0 rounded-full object-cover ${wall ? 'h-[56px] w-[56px]' : 'h-[44px] w-[44px]'}`} />}
        <div className="min-w-0 flex-1">
          <div className={`truncate font-display font-bold leading-none ${wall ? 'text-wall-date' : 'text-phone-heading'}`}>{name}</div>
          <div className={`mt-[3px] text-wall-ink-2 ${t.label}`}>{servingLabel && /\d/.test(servingLabel) ? `Serves ${servingLabel} · ` : ''}your place is kept on every screen</div>
        </div>
        {allSteps}
      </header>
      <div className={`flex flex-1 gap-[56px] ${wall ? 'px-[64px] pb-[150px] pt-[40px]' : 'px-[64px] pb-[150px] pt-[36px]'}`}>
        <div className="flex min-w-0 flex-1 flex-col gap-[24px]">{stepBlock}{timerBar}</div>
        <div className={`shrink-0 ${wall ? 'w-[580px]' : 'w-[40%] max-w-[480px]'}`}>{thisStep}</div>
      </div>
      <div className={`fixed bottom-0 left-0 right-0 z-30 flex items-center gap-[20px] border-0 border-t border-solid border-wall-stone bg-phone-ground ${wall ? 'h-[140px] px-[64px]' : 'h-[124px] px-[48px]'}`}>
        {backButton}{dots}<div className="flex min-w-0 flex-1 justify-end">{nextButton}</div>
      </div>
      {sheets}
    </section>
  )
}
