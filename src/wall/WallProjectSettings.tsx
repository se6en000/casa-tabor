import { useState, type ReactNode } from 'react'
import WallChooser from './WallChooser'
import WallDatePicker from './WallDatePicker'
import WallKeyboard from './WallKeyboard'
import WallNumberPad from './WallNumberPad'
import { Field, Pill, Toggle } from './WallStepPanel'
import { moneyText, type ProjectDetail } from './projectModel'

// Project settings (FAMILY_WALL_PLAN.md P3.23, canvas 10d / 11b, approved by Jake 2026-09-29): "one
// 'Project settings' screen … reused across all projects". Project-wide only — the goal, who does what,
// what the phone shows, every year, part of, and how it's going. The steps and their order live on
// the project page.

export interface WallProjectSettingsProps {
  detail: ProjectDetail
  now: Date
  onEdit: (op: string, args?: Record<string, unknown>) => void
  onBack: () => void
  onDeleted: () => void
}

type Typing = { what: 'name' | 'role'; name?: string; value: string } | null

const Card = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex flex-col gap-[12px] rounded-[20px] border border-solid border-wall-stone bg-wall-on-pigment/50 px-[22px] py-[16px]">
    <span className="text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">{label}</span>
    {children}
  </div>
)

export default function WallProjectSettings({ detail, now, onEdit, onBack, onDeleted }: WallProjectSettingsProps) {
  const { project } = detail
  const [picking, setPicking] = useState<'target' | 'pause' | null>(null)
  const [budgetPad, setBudgetPad] = useState(false)
  const [typing, setTyping] = useState<Typing>(null)
  const [choosing, setChoosing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const target = project.aim_date ? new Date(`${project.aim_date}T12:00:00`) : null
  const daysLeft = target ? Math.round((target.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12).getTime()) / 86400e3) : null
  const counts = (name: string) => detail.steps.filter((s) => !s.done_at && s.who === name).length
  const setPeople = (people: ProjectDetail['project']['people']) => onEdit('settings', { people })

  const finishTyping = () => {
    const t = typing
    setTyping(null)
    if (!t || (t.what === 'name' && !t.value.trim())) return
    // Two steps: the name, then what they do ("Painter"; empty for family).
    if (t.what === 'name') setTyping({ what: 'role', name: t.value.trim(), value: '' })
    else setPeople([...project.people, { name: t.name!, role: t.value.trim() || null }])
  }

  return (
    <div data-no-swipe className="absolute inset-0 z-20 flex flex-col gap-[20px] bg-wall-ground px-[44px] py-[36px] font-body text-wall-ink" onClick={(e) => e.stopPropagation()}>
      <div className="flex shrink-0 items-end justify-between">
        <div className="flex flex-col gap-[6px]">
          <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{project.title.toUpperCase()} › SETTINGS</span>
          <span className="font-display text-wall-move font-semibold leading-none">Project settings</span>
          <span className="text-wall-detail text-wall-ink-2">The same screen for every project. The steps and their order live on the project page.</span>
        </div>
        <button type="button" onClick={onBack} className="h-[52px] rounded-full border-0 bg-wall-ink px-[26px] text-wall-detail font-semibold text-wall-on-pigment">Back to the plan</button>
      </div>

      <div className="flex min-h-0 flex-1 gap-[28px]">
        <div className="flex min-w-0 flex-[1.1] flex-col gap-[16px]">
          <Card label="THE GOAL">
            {picking === 'target' ? (
              <WallDatePicker value={project.aim_date} now={now} clearLabel="No target" onPick={(d) => { onEdit('settings', { aim_date: d ?? '' }); setPicking(null) }} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-[16px]">
                  <Field value={target ? target.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''} empty="Set a target date" aria="Change the target date" onClick={() => setPicking('target')} />
                  {daysLeft != null && <span className={`text-wall-detail ${daysLeft < 0 ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{daysLeft < 0 ? `${-daysLeft} days past` : daysLeft === 0 ? 'today' : `${daysLeft} days`}</span>}
                </div>
                <div className="flex flex-wrap gap-[8px]">
                  <Pill label="Firm: it has to be" on={project.aim_firm} onClick={() => onEdit('settings', { aim_firm: true })} />
                  <Pill label="An aim: nudge me, don’t nag" on={!project.aim_firm} onClick={() => onEdit('settings', { aim_firm: false })} />
                </div>
                <div className="flex items-center gap-[14px] border-0 border-t border-solid border-wall-stone pt-[12px]">
                  <span className="w-[110px] text-wall-label font-bold tracking-[0.15em] text-wall-ink-2">BUDGET</span>
                  <Field value={project.budget_cents ? moneyText(project.budget_cents) : ''} empty="Add a budget" aria="Change the budget" onClick={() => setBudgetPad(true)} />
                </div>
              </>
            )}
          </Card>
          <Card label="WHO DOES WHAT">
            <span className="text-wall-detail text-wall-ink-2">Set a name once here; each step’s “who” picks from this list.</span>
            <div className="flex flex-col">
              {project.people.map((p, i) => (
                <div key={`${p.name}-${i}`} className="flex min-h-[56px] items-center gap-[14px] border-0 border-t border-solid border-wall-stone">
                  <span className="w-[110px] truncate text-wall-label font-bold tracking-[0.1em] text-wall-ink-2">{(p.role ?? 'you').toUpperCase()}</span>
                  <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-wall-body font-bold">{p.name}</span>{p.contact && <span className="text-wall-label text-wall-ink-2">{p.contact}</span>}</span>
                  <span className="text-wall-label text-wall-ink-2">{counts(p.name) ? `${counts(p.name)} step${counts(p.name) === 1 ? '' : 's'}` : ''}</span>
                  {project.people.length > 1 && <Pill label="Remove" aria={`Remove ${p.name}`} onClick={() => setPeople(project.people.filter((_, j) => j !== i))} />}
                </div>
              ))}
            </div>
            <div className="flex gap-[10px]"><Pill label="+ Add someone" onClick={() => setTyping({ what: 'name', value: '' })} /></div>
          </Card>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[16px]">
          <Card label="ON YOUR PHONE">
            <div className="flex flex-wrap gap-[8px]">
              <Pill label="Just the next step" on={project.phone === 'next'} onClick={() => onEdit('settings', { phone: 'next' })} />
              <Pill label="Everything in “Now”" on={project.phone === 'now'} onClick={() => onEdit('settings', { phone: 'now' })} />
              <Pill label="Nothing" on={project.phone === 'none'} onClick={() => onEdit('settings', { phone: 'none' })} />
            </div>
            <span className="text-wall-detail text-wall-ink-2">{project.phone === 'none' ? 'Nothing from this project on your Reminders list.' : project.phone === 'now' ? 'Every step in Now is on your Reminders list; tick one and the rest stay.' : `Your Reminders list shows “${project.title}: …” — tick it there and the next one takes its place.`}</span>
          </Card>
          <Card label="COMES BACK EVERY YEAR">
            <div className="flex items-center gap-[14px]">
              <Toggle on={project.yearly} label="Comes back every year" onClick={() => onEdit('settings', { yearly: !project.yearly })} />
              <span className="text-wall-detail">{project.yearly ? 'On. Next year starts from this year’s steps, order and your own times.' : 'Off: a one-time job.'}</span>
            </div>
          </Card>
          <Card label="PART OF">
            <div className="flex items-center gap-[14px]">
              <span className="min-w-0 flex-1 truncate text-wall-detail">{detail.parent ? <>Inside <b>{detail.parent.title}</b></> : 'Nothing: it stands on its own.'}</span>
              {detail.parent
                ? <Pill label="Take it out" onClick={() => onEdit('part_of', { parent_id: '' })} />
                : <Pill label="Put it under a project…" onClick={() => setChoosing(true)} />}
            </div>
          </Card>
          <Card label="HOW IT’S GOING">
            {picking === 'pause' ? (
              <WallDatePicker value={null} now={now} clearLabel="Until I say" onPick={(d) => { onEdit('status', { status: 'paused', until: d ?? '' }); setPicking(null) }} />
            ) : (
              <div className="flex flex-wrap gap-[8px]">
                <Pill label="Going" on={project.status === 'active'} onClick={() => onEdit('status', { status: 'active' })} />
                <Pill label={project.status === 'paused' && project.paused_until ? `Paused until ${new Date(`${project.paused_until}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : 'Pause until…'} on={project.status === 'paused'} onClick={() => setPicking('pause')} />
                <Pill label="Done" on={project.status === 'done'} onClick={() => onEdit('status', { status: 'done' })} />
                <Pill label="Drop it" on={project.status === 'dropped'} onClick={() => onEdit('status', { status: 'dropped' })} />
              </div>
            )}
          </Card>
          <div className="mt-auto flex justify-end">
            <button type="button" onClick={() => setConfirmDelete(true)} className="h-[52px] rounded-full border border-solid border-wall-rust bg-transparent px-[22px] text-wall-detail font-semibold text-wall-rust">Delete the project…</button>
          </div>
        </div>
      </div>

      {budgetPad && (
        <WallNumberPad label="Budget" prefix="$" initial={project.budget_cents ? project.budget_cents / 100 : null}
          onDone={(v) => { setBudgetPad(false); onEdit('settings', { budget_cents: v == null ? '' : Math.round(v * 100) }) }} onCancel={() => setBudgetPad(false)} />
      )}
      {choosing && (
        <WallChooser title="Put it under…" options={(detail.others ?? []).map((o) => ({ key: o.id, label: o.title }))}
          onPick={(key) => { setChoosing(false); onEdit('part_of', { parent_id: key }) }} onCancel={() => setChoosing(false)} />
      )}
      {confirmDelete && (
        <WallChooser title={`Delete “${project.title}”? Its step leaves your phone too.`} options={[{ key: 'yes', label: 'Delete it' }]}
          onPick={() => { setConfirmDelete(false); onEdit('delete_project'); onDeleted() }} onCancel={() => setConfirmDelete(false)} />
      )}
      {typing && (
        <>
          <div className="absolute bottom-[430px] left-0 z-30 flex h-[84px] w-[1920px] items-center gap-[24px] bg-wall-on-pigment px-[44px]">
            <span className="text-wall-label font-bold tracking-[0.2em] text-wall-brass-ink">{typing.what === 'name' ? 'SOMEONE NEW · THEIR NAME' : `WHAT ${typing.name?.toUpperCase()} DOES · E.G. PAINTER (EMPTY FOR FAMILY)`}</span>
            <span className="font-display text-wall-date font-semibold">{typing.value}<span className="text-wall-brass">|</span></span>
          </div>
          <WallKeyboard value={typing.value} onChange={(value) => setTyping((t) => t && { ...t, value })} onDone={finishTyping} />
        </>
      )}
    </div>
  )
}
