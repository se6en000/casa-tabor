import { useState } from 'react'
import WallDatePicker from './WallDatePicker'
import WallKeyboard from './WallKeyboard'
import { timeOf, type TodoAction, type TodoItem } from './todos'

// Editing one to-do by touch (P3.22 step 5; Jake 2026-09-28: "small reminders I should be able to
// modify, remove a time/date, add a time/date, change the title"). Saves through the `todos` function,
// so the change reaches his iOS list too.

const HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22]
const MINUTES = [0, 15, 30, 45]
const pad = (n: number) => String(n).padStart(2, '0')
const localYmd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const clock12 = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`
}

export interface WallTodoSheetProps {
  item: TodoItem
  now: Date
  onAct: (request: TodoAction) => Promise<void>
  onClose: () => void
  /** Its notes (canvas 65), as typed here; absent = shown, not edited. */
  onSaveNotes?: (id: string, notes: string) => Promise<void>
}

export default function WallTodoSheet({ item, now, onAct, onClose, onSaveNotes }: WallTodoSheetProps) {
  const [title, setTitle] = useState(item.title)
  const [due, setDue] = useState<string | null>(item.due)
  const [time, setTime] = useState<string | null>(timeOf(item))
  const [typing, setTyping] = useState(false)
  const [picking, setPicking] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  // Notes (canvas 65): what's typed, and what was saved until the list catches up.
  const [notesTyping, setNotesTyping] = useState(false)
  const [notesText, setNotesText] = useState('')
  const [notesKept, setNotesKept] = useState<string | null>(null)
  const notes = notesKept ?? item.notes ?? ''
  const saveNotes = async () => {
    const text = notesText.trim()
    setNotesTyping(false)
    if (!onSaveNotes || text === notes) return
    setNotesKept(text)
    try { await onSaveNotes(item.id, text) } catch { setNotesKept(null) }
  }
  const changed = title.trim() !== item.title || due !== item.due || (due !== null && time !== timeOf(item))

  const run = async (request: TodoAction) => {
    setBusy(true)
    try {
      await onAct(request)
      onClose()
    } finally {
      setBusy(false)
    }
  }
  const save = () => run({ action: 'update', id: item.id, patch: { ...(title.trim() !== item.title ? { title: title.trim() } : {}), due, time: due ? time : null } })
  const hour = time ? Number(time.split(':')[0]) : null
  const minute = time ? Number(time.split(':')[1]) : 0
  const pill = (on: boolean) => `h-[52px] shrink-0 rounded-full px-[18px] text-wall-detail font-semibold ${on ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-rule bg-transparent text-wall-ink'}`
  const whenLine = due
    ? `${new Date(`${due}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${time ? ` · ${clock12(time)}` : ' · no time'}`
    : 'No date'

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-wall-ink/30" onClick={(e) => { e.stopPropagation(); onClose() }}>
      <section aria-label={`${item.title} — edit`} className="flex h-full w-[980px] flex-col gap-[22px] overflow-hidden bg-wall-ground p-[44px] text-wall-ink" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-[24px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">TO-DO</span>
            <button type="button" aria-label="Edit the title" onClick={() => { setTyping(true); setPicking(false) }} className={`min-h-[64px] min-w-0 rounded-[14px] bg-transparent px-[14px] py-[6px] text-left font-display text-wall-move font-semibold leading-tight text-wall-ink ${typing ? 'border-2 border-solid border-wall-brass' : 'border border-dashed border-wall-rule'}`}>
              {title || 'Untitled'}
            </button>
          </div>
          <button type="button" onClick={onClose} className={pill(false)}>Close</button>
        </div>

        <div className="flex flex-col gap-[12px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">WHEN</span>
          <div className="flex items-center gap-[12px]">
            <span className="font-display text-wall-date font-semibold">{whenLine}</span>
          </div>
          <div className="flex flex-wrap gap-[10px]">
            <button type="button" aria-pressed={!due} onClick={() => { setDue(null); setTime(null); setPicking(false) }} className={pill(!due)}>No date</button>
            <button type="button" aria-pressed={Boolean(due)} onClick={() => { setPicking((p) => !p); setTyping(false); if (!due) setDue(localYmd(now)) }} className={pill(Boolean(due))}>{due ? 'Change the date' : 'Add a date'}</button>
          </div>
          {picking && <WallDatePicker value={due} now={now} clearLabel="No date" onPick={(d) => { setDue(d); if (!d) setTime(null); setPicking(false) }} />}
          {due && !picking && (
            <div className="flex flex-col gap-[10px]">
              <div className="flex flex-wrap gap-[8px]">
                <button type="button" aria-pressed={!time} onClick={() => setTime(null)} className={pill(!time)}>No time</button>
                {HOURS.map((h) => (
                  <button key={h} type="button" aria-pressed={hour === h} onClick={() => setTime(`${pad(h)}:${pad(minute)}`)} className={pill(hour === h)}>
                    {h % 12 || 12}{h < 12 ? 'a' : 'p'}
                  </button>
                ))}
              </div>
              {time && (
                <div className="flex gap-[8px]">
                  {MINUTES.map((m) => (
                    <button key={m} type="button" aria-pressed={minute === m} onClick={() => setTime(`${pad(hour ?? 20)}:${pad(m)}`)} className={pill(minute === m)}>:{pad(m)}</button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {(notes || onSaveNotes) && (
          <div className="flex min-h-0 shrink flex-col overflow-hidden">
            <span className="mb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NOTES</span>
            {notesTyping ? (
              <div className="flex max-h-[300px] flex-col justify-end overflow-hidden rounded-[14px] border-[3px] border-solid border-wall-brass-ink bg-wall-on-pigment px-[20px] py-[14px]">
                <div className="whitespace-pre-wrap break-words text-wall-body leading-snug">
                  {notesText}
                  <span aria-hidden="true" className="ml-[2px] inline-block h-[28px] w-[3px] translate-y-[5px] bg-wall-ink" />
                </div>
              </div>
            ) : (
              <button type="button" aria-label={notes ? `Notes: ${notes}` : 'Add a note'} disabled={!onSaveNotes}
                onClick={() => { setNotesText(notes); setNotesTyping(true); setTyping(false); setPicking(false) }}
                className="min-h-[56px] min-w-0 border-0 border-t border-solid border-wall-rule bg-transparent p-0 pt-[12px] text-left">
                {notes
                  ? <span className="line-clamp-6 whitespace-pre-wrap break-words text-wall-body leading-snug text-wall-ink">{notes}</span>
                  : <span className="text-wall-body font-semibold text-wall-brass-ink">+ Add a note</span>}
              </button>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center gap-[12px]">
          <button type="button" disabled={busy || !changed || !title.trim()} onClick={() => void save()} className={`${pill(true)} disabled:opacity-40`}>{busy ? 'Saving…' : 'Save'}</button>
          <button type="button" disabled={busy} onClick={() => void run({ action: 'done', id: item.id })} className={pill(false)}>Done — tick it off</button>
          <span className="flex-1" />
          {confirmDelete ? (
            <>
              <span className="text-wall-detail text-wall-rust">Delete it? It leaves your phone too.</span>
              <button type="button" disabled={busy} onClick={() => void run({ action: 'delete', id: item.id })} className="h-[52px] rounded-full border-0 bg-wall-rust px-[20px] text-wall-detail font-semibold text-wall-on-pigment">Delete</button>
              <button type="button" onClick={() => setConfirmDelete(false)} className={pill(false)}>Keep</button>
            </>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={pill(false)}>Delete…</button>
          )}
        </div>
      </section>
      {typing && <WallKeyboard value={title} onChange={setTitle} onDone={() => setTyping(false)} />}
      {notesTyping && <WallKeyboard value={notesText} onChange={setNotesText} onDone={() => void saveNotes()} showsValue multiline />}
    </div>
  )
}
