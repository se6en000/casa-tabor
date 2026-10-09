import { useState } from 'react'
import { Mic, Star } from 'lucide-react'
import { GO_BACK, STAND_OUT, whenItWas, type OutingRating } from '../../supabase/functions/_shared/guide.mjs'
import type { HowWasItData, RatingAnswer } from './useHowWasIt'

// "How was it?" in Something for you (canvas 85C; Jake, Oct 9 — approved): the morning after an outing on the
// calendar, one person at a time — stars, go back?, and what stood out (tapped; the wall has no keyboard to hand).
// The guide learns from it. Done saves; We didn't go clears it for everyone; Not now asks again tomorrow.

const chip = (on: boolean) => `h-[56px] rounded-full px-[24px] text-wall-body font-semibold ${on ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-on-pigment'}`

export default function WallHowWasIt({ data, nameOf, now, onTalk, onClose }: {
  data: HowWasItData
  nameOf: (memberId: string) => string
  now: Date
  onTalk: () => void
  onClose: () => void
}) {
  const row = data.open[0] as OutingRating | undefined
  const [answer, setAnswer] = useState<RatingAnswer>({ stars: null, go_back: null, stood_out: [] })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!row) return null
  const name = nameOf(row.member_id)
  const others = data.open.filter((r) => r.event_id === row.event_id && r.member_id !== row.member_id).map((r) => nameOf(r.member_id))
  const when = whenItWas(row.visited_at, now)
  const at = new Date(row.visited_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const act = async (fn: () => Promise<void>, closeAfter: boolean) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setAnswer({ stars: null, go_back: null, stood_out: [] })
      if (closeAfter || data.open.length <= 1) onClose()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    }
    setBusy(false)
  }
  const toggle = (key: string) => setAnswer((a) => ({ ...a, stood_out: a.stood_out.includes(key) ? a.stood_out.filter((k) => k !== key) : [...a.stood_out, key] }))
  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
      <section
        aria-label="How was it"
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-0 left-0 z-30 flex h-[640px] w-[1920px] gap-[40px] rounded-t-[32px] bg-wall-band px-[56px] py-[40px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60"
      >
        <div className="flex w-[170px] shrink-0 flex-col items-center gap-[14px]">
          <button
            type="button"
            aria-label="Talk it through"
            onClick={onTalk}
            className="flex h-[120px] w-[120px] items-center justify-center rounded-full border-2 border-solid border-wall-night-brass bg-transparent p-0 text-wall-night-brass"
          >
            <Mic size={40} strokeWidth={1.8} />
          </button>
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">ALEXA</div>
          <div className="text-center text-wall-detail text-wall-night-ink-2">Tap your answers — the guide learns what you two like</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">HOW WAS IT · {when.toUpperCase()}</div>
          <div className="mt-[10px] font-display text-wall-quote font-medium">How was {row.place} {when}, {name}?</div>
          <div className="mt-[4px] text-wall-detail text-wall-night-ink-2">{row.title} · {at}, on the calendar</div>
          <div className="mt-[18px] flex items-center gap-[30px] border-0 border-t border-solid border-wall-night-ink-2/25 py-[16px]">
            <div className="w-[260px] shrink-0 font-display text-wall-date">How was it?</div>
            <div role="group" aria-label="Stars" className="flex gap-[10px]">
              {[1, 2, 3, 4, 5].map((n) => {
                const on = (answer.stars ?? 0) >= n
                return (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    aria-pressed={answer.stars === n}
                    onClick={() => setAnswer((a) => ({ ...a, stars: n }))}
                    className={`flex h-[60px] w-[60px] items-center justify-center rounded-full p-0 ${on ? 'border-0 bg-wall-night-brass text-wall-ink' : 'border border-solid border-wall-night-ink-2 bg-transparent text-wall-night-ink-2'}`}
                  >
                    <Star size={28} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
                  </button>
                )
              })}
            </div>
          </div>
          <div className="flex items-center gap-[30px] border-0 border-t border-solid border-wall-night-ink-2/25 py-[16px]">
            <div className="w-[260px] shrink-0 font-display text-wall-date">Go back?</div>
            <div className="flex gap-[12px]">
              {GO_BACK.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={answer.go_back === key} onClick={() => setAnswer((a) => ({ ...a, go_back: a.go_back === key ? null : key }))} className={chip(answer.go_back === key)}>{label}</button>
              ))}
            </div>
          </div>
          <div className="flex items-start gap-[30px] border-0 border-t border-solid border-wall-night-ink-2/25 py-[16px]">
            <div className="w-[260px] shrink-0 pt-[10px] font-display text-wall-date">What stood out?</div>
            <div className="flex flex-wrap gap-[10px]">
              {STAND_OUT.map(([key, label]) => (
                <button key={key} type="button" aria-pressed={answer.stood_out.includes(key)} onClick={() => toggle(key)} className={chip(answer.stood_out.includes(key))}>{label}</button>
              ))}
            </div>
          </div>
          {error && <div role="alert" className="text-wall-body text-wall-night-rust">{error}</div>}
          <div className="mt-auto flex items-center justify-end gap-[14px]">
            {others.length > 0 && <div className="mr-[14px] text-wall-detail text-wall-night-ink-2">{others.join(' and ')}’s next — here or on the phone</div>}
            <button type="button" disabled={busy || !answer.stars} onClick={() => void act(() => data.answer(row, answer), false)} className="h-[64px] rounded-full border-0 bg-wall-on-pigment px-[34px] text-wall-body font-bold text-wall-ink disabled:opacity-40">{busy ? 'Saving…' : 'Done'}</button>
            <button type="button" disabled={busy} onClick={() => void act(() => data.didntGo(row), false)} className="h-[64px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[30px] text-wall-body font-bold text-wall-on-pigment disabled:opacity-60">We didn’t go</button>
            <button type="button" disabled={busy} onClick={() => void act(() => data.later(row), true)} className="h-[64px] rounded-full border border-solid border-wall-ink-2 bg-transparent px-[30px] text-wall-body font-bold text-wall-on-pigment disabled:opacity-60">Not now</button>
          </div>
        </div>
      </section>
    </>
  )
}
