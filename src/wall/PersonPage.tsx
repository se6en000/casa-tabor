import { useState } from 'react'
import { Plus } from 'lucide-react'
import type { FamilyRoutine } from '../lib/familyRoutines'
import { ROUTINE_KINDS, routineDetail, routineHeadline, type RoutineKind } from './routines'
import { OUTLINE, QUIET, SIZES, type Surface } from './surface'
import type { WallChore } from './engine/chores'
import { choreDetail } from './choreText'

// A person's page (canvas 16c on the phone, 16e on the wall): their routines, with Edit and "+ Add a routine",
// then what Casa knows about them — sure first, each with where it came from, then "not sure yet". Wrong
// things are fixed by saying so; the page says how.

export interface KnownFact { id: string; text: string; from: string }
export interface Known { sure: KnownFact[]; notSure: KnownFact[] }

export interface PersonPageProps {
  surface: Surface
  name: string
  routines: FamilyRoutine[]
  /** null while it loads; 'error' when it couldn't be read. */
  known: Known | null | 'error'
  onEdit: (routine: FamilyRoutine) => void
  onAdd: (kind: RoutineKind) => void
  /** Only the parents change routines from a phone; everyone can on the wall. */
  canEdit?: boolean
  /** Their chores (canvas 20a): what they do, or what's done for them with nobody on it yet. */
  chores?: WallChore[]
  onEditChore?: (chore: WallChore) => void
  onAddChore?: () => void
  now?: Date
}

/** The example fits the person: a school's teacher, else their work, else their doctor. */
function hintFor(routines: FamilyRoutine[]): string {
  if (routines.some((r) => r.routineType === 'school')) return 'teacher'
  if (routines.some((r) => r.routineType === 'work')) return 'office'
  return 'doctor'
}

export default function PersonPage({ surface, name, routines, known, onEdit, onAdd, canEdit = true, chores, onEditChore, onAddChore, now = new Date() }: PersonPageProps) {
  const s = SIZES[surface]
  const [choosing, setChoosing] = useState(false)
  const rule = 'border-0 border-t border-solid border-wall-stone'
  const fact = (f: KnownFact) => (
    <div key={f.id} className={`flex flex-col gap-[2px] ${rule} ${s.row}`}>
      <span className={s.body}>{f.text}</span>
      <span className={s.small}>{f.from}</span>
    </div>
  )
  return (
    <div className="flex flex-col gap-[24px]">
      <section aria-label="Routines" className="flex flex-col">
        <div className={`${s.label} pb-[8px]`}>ROUTINES</div>
        {routines.length === 0 && <div className={`${rule} ${s.row} ${s.detail}`}>None yet.</div>}
        {routines.map((r) => (
          <div key={r.key ?? 'main'} className={`flex items-center gap-[14px] ${rule} ${s.row}`}>
            <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
              <span className={s.line}>{routineHeadline(r)}</span>
              <span className={s.detail}>{routineDetail(r)}</span>
            </span>
            {canEdit && <button type="button" aria-label={`Edit ${routineHeadline(r)}`} onClick={() => onEdit(r)} className={`${s.pill} ${OUTLINE}`}>Edit</button>}
          </div>
        ))}
        {!canEdit ? null : choosing ? (
          <div className={`flex flex-col gap-[10px] ${rule} ${s.row}`}>
            <span className={s.detail}>What kind?</span>
            <div className="flex flex-wrap gap-[8px]">
              {ROUTINE_KINDS.map((k) => (
                <button key={k.kind} type="button" onClick={() => { setChoosing(false); onAdd(k.kind) }} className={`${s.chip} ${QUIET}`}>{k.label}</button>
              ))}
              <button type="button" onClick={() => setChoosing(false)} className={`${s.chip} border-0 bg-transparent text-wall-ink-2`}>Never mind</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setChoosing(true)} className={`${s.pill} ${QUIET} mt-[8px] self-start`}>
            <Plus size={surface === 'wall' ? 20 : 16} aria-hidden="true" /> Add a routine
          </button>
        )}
      </section>

      {chores && (
        // Canvas 20a (Jake, 2026-10-01: "need to edit chores"): under the routines, each with Edit, and + Add a chore.
        <section aria-label="Chores" className="flex flex-col">
          <div className={`${s.label} pb-[8px]`}>CHORES</div>
          {chores.length === 0 && <div className={`${rule} ${s.row} ${s.detail}`}>None yet.</div>}
          {chores.map((c) => (
            <div key={c.id} className={`flex items-center gap-[14px] ${rule} ${s.row}`}>
              <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
                <span className={s.line}>{c.title}</span>
                <span className={s.detail}>{choreDetail(c, now)}</span>
              </span>
              {canEdit && onEditChore && <button type="button" aria-label={`Edit ${c.title}`} onClick={() => onEditChore(c)} className={`${s.pill} ${OUTLINE}`}>Edit</button>}
            </div>
          ))}
          {canEdit && onAddChore && (
            <button type="button" onClick={onAddChore} className={`${s.pill} ${QUIET} mt-[8px] self-start`}>
              <Plus size={surface === 'wall' ? 20 : 16} aria-hidden="true" /> Add a chore
            </button>
          )}
        </section>
      )}

      <section aria-label={`What Casa knows about ${name}`} className="flex flex-col">
        <div className={`${s.label} pb-[8px]`}>WHAT CASA KNOWS</div>
        {known === null && <div className={`${rule} ${s.row} ${s.detail}`}>Looking…</div>}
        {known === 'error' && <div className={`${rule} ${s.row} ${s.detail}`}>Casa’s memory couldn’t be read just now.</div>}
        {known && known !== 'error' && known.sure.length === 0 && <div className={`${rule} ${s.row} ${s.detail}`}>Nothing yet.</div>}
        {known && known !== 'error' && known.sure.map(fact)}
      </section>

      {known && known !== 'error' && known.notSure.length > 0 && (
        <section aria-label="Not sure yet" className="flex flex-col">
          <div className={`${s.label} pb-[8px]`}>NOT SURE YET</div>
          {known.notSure.map(fact)}
        </section>
      )}

      <div className={s.detail}>Something wrong? Just say what’s right: “{name}’s {hintFor(routines)} is…”, or “forget that.”</div>
    </div>
  )
}
