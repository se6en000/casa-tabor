import { comingUpSections, comingUpTile, planByLine, type ComingUpAction, type ComingUpItem } from '../wall/comingUp'

// Coming up on the phone (board 07b, approved by Jake 2026-09-27): Week › Coming up. The same list
// as the wall's, one column that scrolls; each item's next step, plan-by line, gift ideas (never the
// ones meant for whoever holds the phone — the caller filters them) and three answers.

export interface PhoneComingUpProps {
  items: ComingUpItem[]
  today: string
  onAct: (key: string, action: ComingUpAction) => Promise<void>
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

export default function PhoneComingUp({ items, today, onAct }: PhoneComingUpProps) {
  const sections = comingUpSections(items, today)
  if (items.length === 0) {
    return <p className="m-0 font-display text-phone-heading italic text-wall-ink-2">Nothing needs getting ready for now. Say “any spirit day, give me 5 days” to teach Casa what to watch for.</p>
  }
  return (
    <div className="flex flex-col">
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

/** "9 to plan · 2 to start now" above the title. */
export function comingUpSummary(items: ComingUpItem[], today: string) {
  const { count, startNow } = comingUpTile(items, today)
  return `${count} to plan${startNow ? ` · ${startNow} to start now` : ''}`
}
