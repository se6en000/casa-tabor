import { useState } from 'react'
import { Mic } from 'lucide-react'
import type { TidyData, TidySuggestion } from './useTidy'

// Alexa tidies up (canvas 75B; Jake, Oct 8: "have alexa … say 'i got something for you' for me to talk and see whats
// up and merge, dedupe, delete, whatever she recommends would be the best for the family so the calendar is clean and also
// gets stuff done" → approved, the pill only — "she does not know when theres a walk up"). The band: today to a few days
// out, what she found and what she'd do, one line each with its answers; Do all; or talk it through. Every answer can be
// undone while the band is open.

const SHOWN = 5
const weekday = (ymd: string) => (ymd ? new Date(`${ymd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' }) : '')
const COUNT = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight']

type Result = { label: string; undoable: boolean; undone?: boolean }

export default function WallTidy({ tidy, onTalk, onClose }: { tidy: TidyData; onTalk: () => void; onClose: () => void }) {
  // What's been answered here stays on its line (with Undo) until the band closes.
  const [rows] = useState<TidySuggestion[]>(() => tidy.open.slice(0, SHOWN))
  const [results, setResults] = useState<Record<string, Result>>({})
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const waiting = rows.filter((r) => !results[r.id] || results[r.id].undone)

  const answer = async (row: TidySuggestion, key: string) => {
    const choice = row.choices.find((c) => c.key === key)
    if (!choice) return
    setBusy(row.id)
    setError(null)
    try {
      await tidy.answer(row.id, key)
      setResults((r) => ({ ...r, [row.id]: { label: key === 'no' ? choice.label : `Done — ${choice.label.toLowerCase()}`, undoable: key !== 'no' } }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    }
    setBusy(null)
  }
  const undo = async (row: TidySuggestion) => {
    setBusy(row.id)
    try {
      await tidy.undo(row.id)
      setResults((r) => ({ ...r, [row.id]: { label: 'Put back as it was', undoable: false, undone: true } }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t undo. Try again.')
    }
    setBusy(null)
  }
  // Undone ones are waiting again: they're in "all" too.
  const doAll = async () => { for (const row of waiting) await answer(row, row.choices[0].key) }
  const n = rows.length

  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
      <section
        aria-label="I have something for you"
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-0 left-0 z-30 flex h-[640px] w-[1920px] gap-[44px] rounded-t-[32px] bg-wall-band px-[56px] py-[40px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60"
      >
        <div className="flex w-[180px] shrink-0 flex-col items-center gap-[14px]">
          <button type="button" aria-label="Talk it through" onClick={onTalk} className="flex h-[118px] w-[118px] items-center justify-center rounded-full border-2 border-solid border-wall-night-brass bg-transparent p-0 text-wall-night-brass">
            <Mic size={38} strokeWidth={1.8} />
          </button>
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">ALEXA</div>
          <div className="text-center text-wall-detail text-wall-night-ink-2">Talk it through — “merge the box ones, keep the rest” — or tap</div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-baseline gap-[24px]">
            <span className="text-wall-label font-bold tracking-[0.22em] text-wall-night-brass">TIDYING UP · TODAY TO {weekday(tidy.through).toUpperCase()} · {n}</span>
            <span className="text-wall-detail text-wall-night-ink-2">so the calendar is clean and the late ones get a time</span>
          </div>
          <div className="mb-[10px] mt-[10px] font-display text-wall-quote font-medium">
            {n === 1 ? 'One thing I’d clean up.' : `${COUNT[n] ?? n} things I’d clean up. Say “do them all,” or one at a time.`}
          </div>
          {rows.map((row, i) => {
            const done = results[row.id]
            return (
              <div key={row.id} aria-label={row.says} className={`flex items-center gap-[24px] py-[10px] ${i ? 'border-0 border-t border-solid border-wall-on-pigment/15' : ''}`}>
                <span className="w-[30px] shrink-0 font-display text-wall-date text-wall-night-brass">{i + 1}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <span className="truncate text-wall-body text-wall-night-ink-2">{row.says}</span>
                  <span className={`font-display text-wall-date font-semibold ${done && !done.undone ? 'text-wall-night-ink-2' : ''}`}>{row.fix}</span>
                </div>
                {done && !done.undone
                  ? (
                    <div className="flex shrink-0 items-center gap-[14px]">
                      <span className="text-wall-body font-semibold text-wall-night-brass">{done.label}</span>
                      {done.undoable && (
                        <button type="button" disabled={busy !== null} onClick={() => void undo(row)} className="h-[48px] rounded-full border border-solid border-wall-on-pigment/35 bg-transparent px-[20px] text-wall-detail font-semibold text-wall-on-pigment disabled:opacity-60">Undo</button>
                      )}
                    </div>
                  )
                  : (
                    <div className="flex shrink-0 gap-[10px]">
                      {row.choices.map((c, k) => (
                        <button
                          key={c.key}
                          type="button"
                          disabled={busy !== null}
                          onClick={() => void answer(row, c.key)}
                          className={`h-[48px] rounded-full px-[20px] text-wall-detail font-semibold disabled:opacity-60 ${k === 0 ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-on-pigment/35 bg-transparent text-wall-on-pigment'}`}
                        >
                          {busy === row.id ? 'Saving…' : c.label}
                        </button>
                      ))}
                    </div>
                  )}
              </div>
            )
          })}
          {error && <div role="alert" className="text-wall-body text-wall-night-rust">{error}</div>}
          <div className="mt-auto flex justify-end gap-[14px]">
            {waiting.length > 1 && (
              <button type="button" disabled={busy !== null} onClick={() => void doAll()} className="h-[58px] rounded-full border-0 bg-wall-on-pigment px-[28px] text-wall-body font-bold text-wall-ink disabled:opacity-60">Do all {waiting.length}</button>
            )}
            <button type="button" onClick={onClose} className="h-[58px] rounded-full border border-solid border-wall-on-pigment/35 bg-transparent px-[28px] text-wall-body font-bold text-wall-on-pigment">{waiting.length ? 'Not now' : 'Done'}</button>
          </div>
        </div>
      </section>
    </>
  )
}
