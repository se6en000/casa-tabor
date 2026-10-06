import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, ListOrdered, Pause, Play, Timer, X } from 'lucide-react'
import { useRecipesSource, type CookPlace, type CookTimer, type Recipe } from './data'
import { useLayout, useT } from './layout'
import { linesFor, servingChoices, stepTimers, stepUses } from './model'
import { Label, Pill, Round, Sheet } from './ui'
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

  const usesList = (which: number[], title: string, mark: number[] = []) => (
    <section aria-label={title}>
      <Label right={layout !== 'phone' ? `${ticked.length} of ${lines.length} ready` : undefined}>{title}</Label>
      <ul className="m-0 list-none p-0">
        {which.map((i) => (
          <li key={i}>
            <button type="button" aria-pressed={ticked.includes(i)} onClick={() => tick(i)} className={`flex w-full items-center gap-[14px] border-0 border-b border-solid border-wall-stone px-[10px] py-0 text-left font-body ${mark.includes(i) ? 'rounded-[12px] bg-phone-card' : 'bg-transparent'} ${layout === 'wall' ? 'min-h-[60px]' : 'min-h-[50px]'} ${t.body} ${ticked.includes(i) ? 'text-wall-ink-2 line-through' : 'text-wall-ink'}`}>
              <span className={`flex shrink-0 items-center justify-center rounded-full ${layout === 'wall' ? 'h-[34px] w-[34px]' : 'h-[28px] w-[28px]'} ${ticked.includes(i) ? 'bg-wall-ink text-wall-on-pigment' : 'border-2 border-solid border-wall-ink-2'}`}>{ticked.includes(i) && <Check size={18} strokeWidth={2.6} />}</span>
              <span className="min-w-0 flex-1">{lines[i]}</span>
              {mark.includes(i) && <span className={`shrink-0 font-bold uppercase tracking-[0.16em] text-wall-brass-ink ${t.label}`}>This step</span>}
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  const progress = (
    <div className="flex gap-[3px]" aria-hidden="true">
      {Array.from({ length: total }, (_, i) => <span key={i} className={`h-[5px] flex-1 rounded-full ${i <= step ? 'bg-wall-ink' : 'bg-wall-stone'}`} />)}
    </div>
  )
  const nav = (
    <div className="flex items-center gap-[10px]">
      <Pill onClick={() => go(step - 1)} disabled={step === 0}>Back</Pill>
      {last
        ? <Pill tone="ink" wide disabled={finishing} onClick={() => void finish()}>{finishing ? 'Saving…' : 'Done cooking'}</Pill>
        : <Pill tone="ink" wide onClick={() => go(step + 1)}>Next step</Pill>}
    </div>
  )

  const stepBlock = (
    <div {...swipeProps} className="flex touch-pan-y select-none flex-col gap-[18px]">
      <p className={`m-0 font-display font-semibold leading-[1.15] text-wall-ink ${t.step}`}>{text}</p>
      {offers.length > 0 && (
        <div className="flex flex-wrap gap-[10px]">
          {offers.map((o) => <Pill key={o.label} tone="brass" onClick={() => startTimer(o.label, o.seconds)}><Timer size={t.icon - 2} />Start a {o.label} timer</Pill>)}
        </div>
      )}
    </div>
  )

  return (
    <section aria-label={`Cooking ${name}`} className={`flex flex-col text-wall-ink ${layout === 'phone' ? 'min-h-[calc(100dvh-max(20px,calc(env(safe-area-inset-top)+10px))-48px)] gap-[16px]' : 'gap-[22px]'}`}>
      <header className="flex items-center gap-[12px]">
        <Round label="Close — your place is kept" onClick={onClose}><X size={20} /></Round>
        <div className="min-w-0 flex-1">
          <div className={`font-bold tracking-[0.2em] text-wall-brass-ink ${t.label}`}>STEP {step + 1} OF {total}</div>
          <div className={`truncate text-wall-ink-2 ${t.detail}`}>{name}{servingLabel && /\d/.test(servingLabel) ? ` · serves ${servingLabel}` : ''}</div>
        </div>
        <Pill onClick={() => setSheet('steps')} label="All steps"><ListOrdered size={t.icon - 2} />{layout === 'phone' ? '' : 'All steps'}</Pill>
      </header>
      {progress}
      {layout === 'phone' ? (
        <>
          {timerBar}
          {stepBlock}
          {uses.length > 0 && usesList(uses, 'For this step')}
          <button type="button" onClick={() => setSheet('ingredients')} className={`flex min-h-[44px] items-center border-0 bg-transparent p-0 font-body font-semibold text-wall-brass-ink ${t.detail}`}>All ingredients · {ticked.length} of {lines.length} ready</button>
          <div className="flex-1" />
          <p className={`m-0 text-center text-wall-ink-2 ${t.label}`}>Swipe the step for the next one</p>
          {nav}
        </>
      ) : (
        <div className="flex gap-[56px]">
          <div className="flex min-w-0 flex-1 flex-col gap-[22px]">{stepBlock}{timerBar}<div className="pt-[10px]">{nav}</div></div>
          <div className={`flex shrink-0 flex-col gap-[18px] ${layout === 'wall' ? 'w-[560px]' : 'w-[38%]'}`}>
            {layout === 'wall' && recipe.image_url && <img src={recipe.image_url} alt="" className="block h-[260px] w-full rounded-[22px] object-cover" />}
            {usesList(lines.map((_, i) => i), 'Ingredients', uses)}
          </div>
        </div>
      )}
      {sheet === 'ingredients' && <Sheet label="All ingredients" onClose={() => setSheet(null)}>{usesList(lines.map((_, i) => i), 'All ingredients')}<div className="mt-[14px] flex justify-end"><Pill onClick={() => setSheet(null)}>Done</Pill></div></Sheet>}
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
    </section>
  )
}
