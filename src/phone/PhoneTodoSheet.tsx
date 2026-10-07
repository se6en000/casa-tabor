import { useSheetSwipe } from './phoneShell'
import { useState } from 'react'
import { timeOf, type TodoAction, type TodoItem } from '../wall/todos'
import { Answer } from './PhoneTodo'

// A to-do on the phone (P3.22 step 7; the wall's to-do sheet): its title, a date with or without a
// time, or no date; Done; Delete. Saves through the `todos` function, so his iOS list follows.

export interface PhoneTodoSheetProps {
  item: TodoItem
  onAct: (request: TodoAction) => Promise<void>
  onClose: () => void
  /** Its notes (canvas 65), as typed here; absent = not shown for editing. */
  onSaveNotes?: (id: string, notes: string) => Promise<void>
}

const field = 'h-[44px] rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] text-phone-body text-wall-ink'

export default function PhoneTodoSheet({ item, onAct, onClose, onSaveNotes }: PhoneTodoSheetProps) {
  const [title, setTitle] = useState(item.title)
  const [due, setDue] = useState(item.due ?? '')
  const [time, setTime] = useState(timeOf(item) ?? '')
  const [confirm, setConfirm] = useState(false)
  // Notes (canvas 65): saved with Save, with the rest.
  const [notes, setNotes] = useState(item.notes ?? '')
  const run = async (request: TodoAction) => { await onAct(request); onClose() }
  const swipe = useSheetSwipe(onClose)
  return (
    <div className="phone-scrim absolute inset-0 z-40 flex items-end bg-wall-ink/30" onClick={onClose}>
      <section {...swipe} aria-label={`${item.title} — edit`} className="phone-sheet flex w-full flex-col gap-[12px] rounded-t-[26px] bg-phone-ground px-[20px] pb-[max(30px,calc(env(safe-area-inset-bottom)+12px))] pt-[18px]" onClick={(e) => e.stopPropagation()}>
        <span className="text-phone-label font-bold tracking-[0.16em] text-wall-brass-ink">TO-DO</span>
        <input aria-label="The to-do" value={title} onChange={(e) => setTitle(e.target.value)} className={`${field} font-display text-phone-heading font-semibold`} />
        <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">WHEN</span>
        <div className="flex flex-wrap items-center gap-[8px]">
          <input aria-label="Date" type="date" value={due} onChange={(e) => setDue(e.target.value)} className={field} />
          {due && <input aria-label="Time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} />}
          {due && <Answer label="No date" onClick={() => { setDue(''); setTime('') }} />}
        </div>
        {(onSaveNotes || item.notes) && (
          <>
            <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">NOTES</span>
            <textarea aria-label="Notes" rows={4} value={notes} readOnly={!onSaveNotes} onChange={(e) => setNotes(e.target.value)} placeholder="Add a note"
              className="min-h-[96px] w-full resize-y rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment p-[12px] text-phone-body leading-snug text-wall-ink" />
          </>
        )}
        {/* Not now (also a swipe left on its card, 34c): */}
        <div className="flex flex-wrap items-center gap-[6px]">
          <span className="text-phone-label font-bold tracking-[0.16em] text-wall-ink-2">NOT NOW</span>
          <Answer label="Tomorrow" onClick={() => void run({ action: 'snooze', id: item.id, days: 1 })} />
          <Answer label="A week" onClick={() => void run({ action: 'snooze', id: item.id, days: 7 })} />
        </div>
        <div className="flex flex-wrap gap-[6px] pt-[4px]">
          <Answer label="Save" primary onClick={() => void (async () => { if (onSaveNotes && notes.trim() !== (item.notes ?? '')) await onSaveNotes(item.id, notes.trim()); await run({ action: 'update', id: item.id, patch: { ...(title.trim() && title.trim() !== item.title ? { title: title.trim() } : {}), due: due || null, time: due && time ? time : null } }) })()} />
          <Answer label="Done — tick it off" onClick={() => void run({ action: 'done', id: item.id })} />
          {confirm ? <Answer label="Yes, delete" onClick={() => void run({ action: 'delete', id: item.id })} /> : <Answer label="Delete…" onClick={() => setConfirm(true)} />}
          <Answer label="Close" onClick={onClose} />
        </div>
      </section>
    </div>
  )
}
