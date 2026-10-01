import { useState } from 'react'
import { Minus, Plus } from 'lucide-react'
import type { WallMember } from './engine/types'
import type { WallChore } from './engine/chores'
import { choreTime, nextChoreDates } from './choreText'
import { pigmentStyleFor } from './lanes'
import { OUTLINE, SIZES, SOLID, type Surface } from './surface'
import WallKeyboard from './WallKeyboard'

// A chore's sheet (canvas 20b; Jake, 2026-10-01: "need to edit chores", and kids' chores like "change the cat litter
// every 4 weeks"): what it is, who does it, how often, which days, what time, and the dates it works out to. On the
// wall the name is typed on the wall keyboard. Never sent to Google.

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const OFTEN = [1, 2, 4] as const

function shiftTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number)
  const total = Math.min(23 * 60 + 45, Math.max(5 * 60, h * 60 + m + minutes))
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}:00`
}

export interface ChoreEditorProps {
  surface: Surface
  chore: WallChore
  isNew: boolean
  members: WallMember[]
  pigmentOf: (memberId: string) => number
  now: Date
  onSave: (chore: WallChore) => Promise<void>
  onRemove?: () => Promise<void>
  onCancel: () => void
}

export default function ChoreEditor({ surface, chore: initial, isNew, members, pigmentOf, now, onSave, onRemove, onCancel }: ChoreEditorProps) {
  const s = SIZES[surface]
  const [chore, setChore] = useState(initial)
  const [typing, setTyping] = useState(isNew && !initial.title)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const section = 'flex flex-col gap-[10px] border-0 border-t border-solid border-wall-stone py-[14px]'
  const pick = (on: boolean) => (on ? SOLID : OUTLINE)
  const next = nextChoreDates(chore, now, 4)
  // A new "how often" counts from this week (every 2 weeks from an old start could skip this one).
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const save = async () => {
    if (!chore.title.trim() || chore.days_of_week.length === 0) return
    setSaving(true)
    setError(null)
    try {
      await onSave({ ...chore, title: chore.title.trim() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'It didn’t save. Try again.')
      setSaving(false)
    }
  }

  return (
    <section aria-label={isNew ? 'New chore' : chore.title} className="flex flex-col">
      <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">CHORE</span>
      {typing ? (
        <div className="flex flex-col gap-[8px] py-[8px]">
          <div className={`${s.field} flex items-center border border-solid border-wall-ink-2 bg-wall-on-pigment font-display text-wall-heading`}>
            {chore.title || <span className="text-wall-ink-2">Trash to the street, feed the cat…</span>}
          </div>
          <button type="button" onClick={() => chore.title.trim() && setTyping(false)} className={`${s.pill} ${SOLID} self-start`}>Done</button>
          {surface === 'wall' && <WallKeyboard value={chore.title} onChange={(title) => setChore((c) => ({ ...c, title }))} onDone={() => chore.title.trim() && setTyping(false)} />}
        </div>
      ) : (
        <div className="flex items-center gap-[12px] py-[8px]">
          <span className="min-w-0 flex-1 font-display text-wall-move font-semibold leading-tight">{chore.title}</span>
          <button type="button" onClick={() => setTyping(true)} className={`${s.pill} ${OUTLINE}`}>Change</button>
        </div>
      )}

      <div className={section}>
        <span className={s.label}>WHO DOES IT</span>
        <div className="flex flex-wrap gap-[10px]">
          {/* People, as on the lanes (not the family-wide stand-in). */}
          {members.filter((m) => m.show_on_home_sidebar !== false).map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={chore.member_id === m.id}
              onClick={() => setChore((c) => ({ ...c, member_id: c.member_id === m.id ? null : m.id }))}
              className={`${s.pill} ${pick(chore.member_id === m.id)} pl-[6px]`}
            >
              <span aria-hidden="true" className={`flex h-[38px] w-[38px] items-center justify-center rounded-full font-display font-bold text-wall-on-pigment ${pigmentStyleFor(pigmentOf(m.id)).solid}`}>{m.name.charAt(0)}</span>
              {m.name}
            </button>
          ))}
        </div>
        <span className={s.small}>When they’re away on a trip, it goes on the trip’s list to hand off.</span>
      </div>

      <div className={section}>
        <span className={s.label}>HOW OFTEN</span>
        <div className="flex flex-wrap gap-[10px]">
          {OFTEN.map((n) => (
            <button key={n} type="button" aria-pressed={chore.every_weeks === n} onClick={() => setChore((c) => ({ ...c, every_weeks: n, starts_on: c.every_weeks === n ? c.starts_on : today }))} className={`${s.pill} ${pick(chore.every_weeks === n)}`}>
              {n === 1 ? 'Every week' : `Every ${n} weeks`}
            </button>
          ))}
        </div>
      </div>

      <div className={section}>
        <span className={s.label}>ON</span>
        <div className="flex gap-[10px]">
          {DAYS.map((d, i) => {
            const on = chore.days_of_week.includes(i)
            return (
              <button
                key={i}
                type="button"
                aria-pressed={on}
                aria-label={DAY_NAMES[i]}
                onClick={() => setChore((c) => ({ ...c, days_of_week: on ? c.days_of_week.filter((x) => x !== i) : [...c.days_of_week, i].sort() }))}
                className={`${s.chip} ${pick(on)}`}
              >
                {d}
              </button>
            )
          })}
        </div>
      </div>

      <div className={section}>
        <span className={s.label}>AT</span>
        <div className="flex items-center gap-[18px]">
          <button type="button" aria-label="Earlier" onClick={() => setChore((c) => ({ ...c, time_local: shiftTime(c.time_local, -15) }))} className={`${s.chip} ${OUTLINE}`}><Minus size={22} /></button>
          <span className="min-w-[150px] text-center font-display text-wall-heading font-semibold">{choreTime(chore.time_local)}</span>
          <button type="button" aria-label="Later" onClick={() => setChore((c) => ({ ...c, time_local: shiftTime(c.time_local, 15) }))} className={`${s.chip} ${OUTLINE}`}><Plus size={22} /></button>
        </div>
      </div>

      <div className={section}>
        <span className={s.label}>NEXT</span>
        <span className={s.body}>{next.length ? next.map((d) => d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })).join(' · ') : 'Pick a day'}</span>
      </div>

      {error && <div role="alert" className="text-wall-detail text-wall-rust">{error}</div>}
      <div className="flex items-center justify-between gap-[12px] border-0 border-t border-solid border-wall-stone pt-[16px]">
        <span className={s.small}>On the wall that day. Never sent to Google.</span>
        <div className="flex gap-[10px]">
          <button type="button" onClick={onCancel} className={`${s.pill} ${OUTLINE}`}>Cancel</button>
          {!isNew && onRemove && <button type="button" onClick={() => void onRemove()} className={`${s.pill} ${OUTLINE}`}>Delete</button>}
          <button type="button" disabled={saving || !chore.title.trim() || chore.days_of_week.length === 0} onClick={() => void save()} className={`${s.pill} ${SOLID} disabled:opacity-50`}>{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </div>
    </section>
  )
}
