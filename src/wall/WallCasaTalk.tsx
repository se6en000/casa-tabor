import { useState } from 'react'
import { ChevronRight, Mic } from 'lucide-react'
import type { CasaTopic, TalkAnswer } from './casaTalk'

// "Casa wants to talk to you" (canvas 21a–b): the quiet line beside the glowing mic, and the band it opens — what
// it's about in two sentences, why now, and the answers. The mic in the band talks it through instead.

/** 21a: the quiet line in the header, "Casa has something for you · Jake". */
export function CasaCalling({ topic, onOpen, className = '' }: { topic: CasaTopic; onOpen: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onOpen()
      }}
      className={`flex h-[44px] shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full border border-solid border-wall-brass bg-wall-brass/15 pl-[14px] pr-[12px] text-wall-detail font-bold text-wall-brass-ink ${className}`}
    >
      <span aria-hidden="true" className="h-[10px] w-[10px] rounded-full bg-wall-brass-ink" />
      Casa has something for you{topic.forName ? ` · ${topic.forName}` : ''}
      <ChevronRight size={20} aria-hidden="true" />
    </button>
  )
}

/** 21b: the band Casa opens with. */
export default function WallCasaTalk({ topic, onAnswer, onTalk, onClose }: {
  topic: CasaTopic
  onAnswer: (answer: TalkAnswer) => Promise<void>
  onTalk: () => void
  onClose: () => void
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const answer = async (a: TalkAnswer) => {
    setBusy(a.label)
    setError(null)
    try {
      await onAnswer(a)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That didn’t save. Try again.')
      setBusy(null)
    }
  }
  return (
    <>
      <button type="button" aria-label="Close" onClick={onClose} className="absolute left-0 top-0 z-10 h-[1080px] w-[1920px] cursor-default border-0 bg-transparent p-0" />
      <section
        aria-label="Casa has something for you"
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-0 left-0 z-30 flex h-[520px] w-[1920px] gap-[40px] rounded-t-[32px] bg-wall-band px-[56px] py-[40px] font-body text-wall-on-pigment shadow-[0_-18px_48px] shadow-wall-night-ground/60"
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
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">CASA</div>
          <div className="text-center text-wall-detail text-wall-night-ink-2">Talk it through,<br />or tap an answer</div>
        </div>
        <div className="flex w-[420px] shrink-0 flex-col gap-[12px] text-wall-body text-wall-night-ink-2">
          <div className="text-wall-label font-bold tracking-[0.2em]">WHY NOW</div>
          {topic.why.map((line) => <div key={line}>{line}</div>)}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[18px]">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-night-brass">{topic.eyebrow}</div>
          <div className="font-display text-wall-quote font-medium">{topic.said}</div>
          {topic.ask && <div className="text-wall-date">{topic.ask}</div>}
          {error && <div role="alert" className="text-wall-body text-wall-night-rust">{error}</div>}
          <div className="mt-auto flex flex-wrap gap-[14px]">
            {topic.answers.map((a, i) => (
              <button
                key={a.label}
                type="button"
                disabled={busy !== null}
                onClick={() => void answer(a)}
                className={`h-[64px] rounded-full px-[30px] text-wall-body font-bold disabled:opacity-60 ${i === 0 ? 'border-0 bg-wall-on-pigment text-wall-ink' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-on-pigment'}`}
              >
                {busy === a.label ? 'Saving…' : a.label}
              </button>
            ))}
          </div>
        </div>
      </section>
    </>
  )
}
