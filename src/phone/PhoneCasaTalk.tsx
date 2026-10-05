import { useState } from 'react'
import type { CasaTopic, TalkAnswer } from '../wall/casaTalk'

// "Casa wants to talk to you" on the phone (canvas 21c): the notice's "Talk it through" lands here, on top of Me —
// the same few sentences and answers as the wall's band.
export default function PhoneCasaTalk({ topic, onAnswer, onTalk }: { topic: CasaTopic; onAnswer: (answer: TalkAnswer) => Promise<void>; onTalk?: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answer = async (a: TalkAnswer) => {
    setBusy(a.label)
    setError(null)
    try {
      await onAnswer(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
    }
    setBusy(null)
  }
  return (
    <section aria-label="Something for you" className="flex flex-col gap-[10px] rounded-[20px] bg-wall-band p-[18px] text-wall-on-pigment">
      <div className="text-phone-label font-bold tracking-[0.16em] text-wall-night-brass">{topic.eyebrow}</div>
      <div className="font-display text-phone-heading font-semibold">{topic.said}</div>
      {topic.ask && <div className="text-phone-body text-wall-stone">{topic.ask}</div>}
      <div className="text-phone-detail text-wall-night-ink-2">{topic.why.join(' ')}</div>
      {error && <div role="alert" className="text-phone-detail text-wall-night-rust">{error}</div>}
      <div className="mt-[4px] flex flex-wrap gap-[8px]">
        {topic.answers.map((a, i) => (
          <button
            key={a.label}
            type="button"
            disabled={busy !== null}
            onClick={() => void answer(a)}
            className={`h-[44px] rounded-full px-[18px] text-phone-detail font-bold disabled:opacity-60 ${i === 0 ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-on-pigment'}`}
          >
            {busy === a.label ? 'Saving…' : a.label}
          </button>
        ))}
        {onTalk && <button type="button" onClick={onTalk} className="h-[44px] rounded-full border-0 bg-transparent px-[12px] text-phone-detail font-semibold text-wall-night-brass">Talk it through</button>}
      </div>
    </section>
  )
}
