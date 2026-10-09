import { useState } from 'react'
import { Star } from 'lucide-react'
import { GO_BACK, STAND_OUT, whenItWas, type OutingRating } from '../../supabase/functions/_shared/guide.mjs'
import type { HowWasItData, RatingAnswer } from '../wall/useHowWasIt'

// "How was it?" on the phone (canvas 85D; Jake, Oct 9 — approved): Something for you on Me, the same question as the
// wall's, yours alone — stars, go back?, what stood out, and a line of your own if you like.

const chip = (on: boolean) => `h-[44px] rounded-full px-[14px] text-phone-detail font-bold ${on ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-on-pigment'}`

export default function PhoneHowWasIt({ data, name, now }: { data: HowWasItData; name: string | null; now: Date }) {
  const row = data.open[0] as OutingRating | undefined
  const [answer, setAnswer] = useState<RatingAnswer>({ stars: null, go_back: null, stood_out: [], note: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (!row) return null
  const when = whenItWas(row.visited_at, now)
  const at = new Date(row.visited_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const act = async (fn: () => Promise<void>) => {
    setBusy(true)
    setError(null)
    try {
      await fn()
      setAnswer({ stars: null, go_back: null, stood_out: [], note: '' })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    }
    setBusy(false)
  }
  const toggle = (key: string) => setAnswer((a) => ({ ...a, stood_out: a.stood_out.includes(key) ? a.stood_out.filter((k) => k !== key) : [...a.stood_out, key] }))
  return (
    <section aria-label="How was it" className="flex flex-col gap-[12px] rounded-[20px] bg-wall-band p-[18px] text-wall-on-pigment">
      <div className="text-phone-label font-bold tracking-[0.16em] text-wall-night-brass">SOMETHING FOR YOU · HOW WAS IT</div>
      <div className="font-display text-phone-heading font-semibold">How was {row.place} {when}{name ? `, ${name}` : ''}?</div>
      <div className="-mt-[6px] text-phone-detail text-wall-night-ink-2">{row.title} · {at}. Your answer is yours alone.</div>
      <div role="group" aria-label="Stars" className="flex gap-[8px]">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = (answer.stars ?? 0) >= n
          return (
            <button
              key={n}
              type="button"
              aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={answer.stars === n}
              onClick={() => setAnswer((a) => ({ ...a, stars: n }))}
              className={`flex h-[48px] w-[48px] items-center justify-center rounded-full p-0 ${on ? 'border-0 bg-wall-night-brass text-wall-ink' : 'border border-solid border-wall-night-ink-2 bg-transparent text-wall-night-ink-2'}`}
            >
              <Star size={22} strokeWidth={2} fill={on ? 'currentColor' : 'none'} />
            </button>
          )
        })}
      </div>
      <div className="text-phone-detail text-wall-night-ink-2">Go back?</div>
      <div className="-mt-[6px] flex flex-wrap gap-[6px]">
        {GO_BACK.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={answer.go_back === key} onClick={() => setAnswer((a) => ({ ...a, go_back: a.go_back === key ? null : key }))} className={chip(answer.go_back === key)}>{label}</button>
        ))}
      </div>
      <div className="text-phone-detail text-wall-night-ink-2">What stood out?</div>
      <div className="-mt-[6px] flex flex-wrap gap-[6px]">
        {STAND_OUT.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={answer.stood_out.includes(key)} onClick={() => toggle(key)} className={chip(answer.stood_out.includes(key))}>{label}</button>
        ))}
      </div>
      <input
        aria-label="Anything else"
        value={answer.note ?? ''}
        onChange={(event) => setAnswer((a) => ({ ...a, note: event.target.value }))}
        placeholder="Anything else? (optional)"
        className="h-[44px] rounded-[14px] border-0 bg-wall-on-pigment/10 px-[12px] text-phone-body text-wall-on-pigment placeholder:text-wall-night-ink-2"
      />
      {error && <div role="alert" className="text-phone-detail text-wall-night-rust">{error}</div>}
      <div className="flex flex-wrap items-center gap-[8px]">
        <button type="button" disabled={busy || !answer.stars} onClick={() => void act(() => data.answer(row, answer))} className="h-[44px] rounded-full border-0 bg-wall-night-brass px-[20px] text-phone-body font-bold text-wall-ink disabled:opacity-40">{busy ? 'Saving…' : 'Done'}</button>
        <button type="button" disabled={busy} onClick={() => void act(() => data.didntGo(row))} className="h-[44px] rounded-full border-0 bg-transparent px-[12px] text-phone-body font-semibold text-wall-night-brass">We didn’t go</button>
        <button type="button" disabled={busy} onClick={() => void act(() => data.later(row))} className="h-[44px] rounded-full border-0 bg-transparent px-[12px] text-phone-body font-semibold text-wall-night-ink-2">Not now</button>
      </div>
    </section>
  )
}
