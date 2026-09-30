import { useState } from 'react'
import { comingUpSections, comingUpTile, planByLine, type ComingUpAction, type ComingUpItem, type GiftIdea } from '../wall/comingUp'

// Coming up on the phone (board 07b, approved by Jake 2026-09-27): Week › Coming up. The same list
// as the wall's, one column that scrolls; each item's next step, plan-by line, gift ideas (never the
// ones meant for whoever holds the phone — the caller filters them) and three answers.

export interface PhoneComingUpProps {
  items: ComingUpItem[]
  today: string
  onAct: (key: string, action: ComingUpAction) => Promise<void>
  /** Gift ideas (not the viewer's own), each correctable by hand (Jake, 2026-09-29). */
  ideas?: GiftIdea[]
  onEditIdea?: (id: string, idea: string | null) => Promise<void>
}

function Answer({ label, primary = false, onClick }: { label: string; primary?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-[44px] rounded-full px-[14px] text-phone-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-stone bg-transparent text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

export default function PhoneComingUp({ items, today, onAct, ideas = [], onEditIdea }: PhoneComingUpProps) {
  const sections = comingUpSections(items, today)
  const [ideasOpen, setIdeasOpen] = useState(false)
  const ideasButton = ideas.length > 0 && onEditIdea ? <Answer label={`Gift ideas · ${ideas.length}`} onClick={() => setIdeasOpen(true)} /> : null
  const ideasSheet = ideasOpen && onEditIdea ? <PhoneIdeas ideas={ideas} onEdit={onEditIdea} onClose={() => setIdeasOpen(false)} /> : null
  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-[10px]">
        <p className="m-0 font-display text-phone-heading italic text-wall-ink-2">Nothing needs getting ready for now. Say “any spirit day, give me 5 days” to teach Casa what to watch for.</p>
        {ideasButton && <div>{ideasButton}</div>}
        {ideasSheet}
      </div>
    )
  }
  return (
    <div className="flex flex-col">
      {ideasButton && <div className="flex pb-[8px]">{ideasButton}</div>}
      {ideasSheet}
      {sections.map((s) => (
        <section key={s.heading} aria-label={s.heading} className="flex flex-col">
          <h2 className="m-0 mt-[8px] pb-[6px] font-body text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">{s.heading}</h2>
          {s.items.map((item) => {
            const day = new Date(`${item.date}T12:00:00Z`)
            return (
              <div key={item.key} className="flex gap-[12px] border-0 border-t border-solid border-wall-stone py-[10px]">
                <span className="flex w-[40px] shrink-0 flex-col items-center">
                  <span className="text-phone-label font-bold tracking-[0.12em] text-wall-ink-2">{day.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' }).toUpperCase()}</span>
                  <span className="font-display text-phone-heading font-bold leading-none">{day.getUTCDate()}</span>
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="text-phone-body font-semibold text-wall-ink">{item.title}</span>
                  <span className="text-phone-detail font-bold text-wall-brass-ink">{item.nextStep}</span>
                  <span className={`text-phone-label ${item.late ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{planByLine(item, today)}</span>
                  {item.ideas && item.ideas.length > 0 && <span className="text-phone-label text-wall-ink-2">Gift ideas: {item.ideas.join('; ')}</span>}
                  <span className="mt-[4px] flex gap-[6px]">
                    <Answer label="Done" primary onClick={() => void onAct(item.key, 'done')} />
                    <Answer label="Snooze" onClick={() => void onAct(item.key, 'snooze')} />
                    <Answer label="Not needed" onClick={() => void onAct(item.key, 'dismiss')} />
                  </span>
                </span>
              </div>
            )
          })}
        </section>
      ))}
    </div>
  )
}

/** Gift ideas on the phone, each correctable by typing (Jake, 2026-09-29: voice mishears brand names). */
function PhoneIdeas({ ideas, onEdit, onClose }: { ideas: GiftIdea[]; onEdit: (id: string, idea: string | null) => Promise<void>; onClose: () => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const field = 'h-[44px] min-w-0 flex-1 rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] text-phone-body text-wall-ink'
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onClose}>
      <section aria-label="Gift ideas" onClick={(e) => e.stopPropagation()} className="flex max-h-[90%] w-full flex-col gap-[10px] overflow-y-auto rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(24px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px] text-wall-ink">
        <div className="flex items-center justify-between">
          <span className="font-display text-phone-heading font-bold">Gift ideas</span>
          <Answer label="Close" onClick={onClose} />
        </div>
        <span className="text-phone-detail text-wall-ink-2">Fix any words that came out wrong.</span>
        {ideas.filter((g) => g.id).map((g) => {
          const text = drafts[g.id!] ?? g.idea
          return (
            <div key={g.id} className="flex flex-col gap-[6px] border-0 border-t border-solid border-wall-stone pt-[8px]">
              <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">{g.for_name.toUpperCase()}</span>
              <div className="flex items-center gap-[8px]">
                <input aria-label={`Gift idea for ${g.for_name}`} value={text} onChange={(e) => setDrafts((d) => ({ ...d, [g.id!]: e.target.value }))} className={field} />
                {text.trim() && text.trim() !== g.idea
                  ? <Answer label="Save" primary onClick={() => void onEdit(g.id!, text.trim())} />
                  : <Answer label="Remove" onClick={() => void onEdit(g.id!, null)} />}
              </div>
            </div>
          )
        })}
      </section>
    </div>
  )
}

/** "9 to plan · 2 to start now" above the title. */
export function comingUpSummary(items: ComingUpItem[], today: string) {
  const { count, startNow } = comingUpTile(items, today)
  return `${count} to plan${startNow ? ` · ${startNow} to start now` : ''}`
}
