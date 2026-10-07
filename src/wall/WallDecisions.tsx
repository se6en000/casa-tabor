import { useState } from 'react'
import { X } from 'lucide-react'
import type { Decision, DecisionAction } from './decisions'

// "Needs a decision" (P3.4): one row per question, two answers that save.

export interface DatedDecision extends Decision {
  /** The day it belongs to (its answers and "keep" are saved on that day). */
  date: Date
}

const dayWord = (date: Date, now: Date) => {
  const a = new Date(date); a.setHours(0, 0, 0, 0)
  const b = new Date(now); b.setHours(0, 0, 0, 0)
  const days = Math.round((a.getTime() - b.getTime()) / 86_400_000)
  return days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : date.toLocaleDateString('en-US', { weekday: 'long' })
}

export function DecisionRow({ decision, now, onAnswer, compact = false, showDay = true, inline = false }: {
  decision: DatedDecision
  now: Date
  onAnswer: (decision: DatedDecision, action: DecisionAction) => Promise<void>
  compact?: boolean
  /** "Today ·" / "Tomorrow ·" — left off where the face already says which day it is. */
  showDay?: boolean
  /** One line, the answers at its end (the evening stage's TO DECIDE banner, canvas 56A). */
  inline?: boolean
}) {
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  return (
    // Compact (under the lanes): its first line level with the get & pack headings beside it (measured), and tight
    // enough that its buttons keep the usual room above the week strip.
    <div className={inline ? 'flex min-w-0 flex-1 items-center gap-[24px]' : `flex flex-col border-t border-wall-rule ${compact ? 'gap-[6px] pt-[10px]' : 'gap-[8px] py-[14px]'}`}>
      {/* Balanced lines: never a lone "12:30." on a line of its own. */}
      <div className={inline ? 'flex min-w-0 flex-1 flex-col' : 'contents'}>
        <div className={`text-balance font-display text-wall-heading font-bold ${inline ? 'line-clamp-2' : ''}`}>
          {showDay ? `${dayWord(decision.date, now)} · ` : ''}{decision.text}
        </div>
        {decision.detail && <div className={`text-wall-detail text-wall-ink-2 ${inline ? 'truncate' : ''}`}>{decision.detail}</div>}
        {inline && error && <div className="text-wall-detail font-semibold text-wall-rust">{error}</div>}
      </div>
      <div className={`${compact || inline ? '' : 'mt-[4px] '}flex ${inline ? 'shrink-0' : 'flex-wrap'} gap-[10px]`}>
        {decision.answers.map((answer, i) => (
          <button
            key={answer.label}
            type="button"
            disabled={busy !== null}
            onClick={async (e) => {
              e.stopPropagation()
              setBusy(answer.label)
              setError(null)
              try {
                await onAnswer(decision, answer.action)
              } catch (err) {
                setError(err instanceof Error ? err.message : 'That didn’t save. Nothing changed.')
              }
              setBusy(null)
            }}
            className={`${compact ? 'h-[48px] px-[20px]' : 'h-[56px] px-[24px]'} rounded-full text-wall-detail font-semibold ${i === 0 ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-wall-paper text-wall-ink'}`}
          >
            {busy === answer.label ? 'Saving…' : answer.label}
          </button>
        ))}
      </div>
      {!inline && error && <div className="text-wall-detail font-semibold text-wall-rust">{error}</div>}
    </div>
  )
}

export default function WallDecisionsSheet({ decisions, now, onAnswer, onClose }: {
  decisions: DatedDecision[]
  now: Date
  onAnswer: (decision: DatedDecision, action: DecisionAction) => Promise<void>
  onClose: () => void
}) {
  const shown = decisions.slice(0, 3)
  return (
    <div className="absolute inset-0 z-10" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <div className="pointer-events-none absolute inset-0 bg-wall-ink/20" />
      <section
        aria-label="Needs a decision"
        className="absolute right-0 top-0 flex h-[1080px] w-[780px] flex-col gap-[16px] rounded-l-[28px] bg-wall-on-pigment px-[56px] py-[40px] font-body text-wall-ink"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <div className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">NEEDS A DECISION · {decisions.length}</div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-[56px] w-[56px] items-center justify-center rounded-full border border-wall-rule bg-wall-paper p-0 text-wall-ink">
            <X size={22} />
          </button>
        </div>
        {shown.length === 0 && <div className="font-display text-wall-date italic text-wall-ink-2">Nothing to decide. All settled.</div>}
        {shown.map((d) => <DecisionRow key={d.key} decision={d} now={now} onAnswer={onAnswer} />)}
        {decisions.length > shown.length && (
          <div className="text-wall-detail text-wall-ink-2">
            {decisions.length - shown.length} more later this week — they'll come up here as these are settled.
          </div>
        )}
      </section>
    </div>
  )
}

/** The "2 to decide" count; hidden when there's nothing. */
export function DecisionCount({ count, onOpen, className = '' }: { count: number; onOpen: () => void; className?: string }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      className={`flex h-[44px] shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full border border-solid border-wall-brass bg-wall-paper px-[16px] text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink ${className}`}
    >
      <span aria-hidden="true" className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-wall-brass-ink text-wall-on-pigment">{count}</span>
      TO DECIDE
    </button>
  )
}

/** "3 FROM EMAIL" (canvas 14d): what came in by email and waits for him; hidden when there's nothing. */
export function EmailCount({ count, onOpen, className = '' }: { count: number; onOpen: () => void; className?: string }) {
  if (count === 0) return null
  return (
    <button
      type="button"
      aria-label={`${count} from email`}
      onClick={(e) => { e.stopPropagation(); onOpen() }}
      className={`flex h-[44px] shrink-0 items-center gap-[10px] whitespace-nowrap rounded-full border border-solid border-wall-brass bg-wall-brass/10 px-[16px] text-wall-label font-bold tracking-[0.15em] text-wall-brass-ink ${className}`}
    >
      <span aria-hidden="true" className="flex h-[24px] w-[24px] items-center justify-center rounded-full bg-wall-brass-ink text-wall-on-pigment">{count}</span>
      FROM EMAIL
    </button>
  )
}
