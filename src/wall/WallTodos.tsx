import { useState, type ReactNode } from 'react'
import { formatWallClock, formatWallDate } from './clock'
import { GROUPS, nextUpRoom, sizeLine, type TodoAction, type TodoItem, type TodoList, type TodoProjectDetail, type TodoSuggestion } from './todos'
import { useTodoProject } from './useTodos'
import WallProject from './WallProject'
import WallProjectShelf from './WallProjectShelf'
import WallTodoSheet from './WallTodoSheet'

// To do (P3.22, board 09b, approved by Jake 2026-09-28): what needs doing, from his Reminders list,
// sorted by Casa. Next up is a handful worth doing now; everything else stays folded by kind, one
// group open at a time, so the screen never becomes the pile. "Not now" is a quiet link, not a
// button. The wall and the desktop show the same screen; Back, or 2 idle minutes, returns to today.

export interface WallTodosProps {
  now: Date
  list: TodoList
  onAct: (request: TodoAction) => Promise<void>
  onOpen?: (id: string) => void
  canOpen?: (id: string) => boolean
  onBack: () => void
  /** Any touch on the screen: keeps it up. */
  onActivity?: () => void
  week: ReactNode
  /** Loads a project with its steps (the fixture passes its own). */
  useProject?: (id: string | null) => { data?: TodoProjectDetail | null }
}

const SNOOZES = [{ label: 'Tomorrow', days: 1 }, { label: '3 days', days: 3 }, { label: 'A week', days: 7 }, { label: '2 weeks', days: 14 }]
const PAGE = 4

function Pill({ label, primary = false, onClick, small = false }: { label: string; primary?: boolean; onClick: () => void; small?: boolean }) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
      className={`${small ? 'h-[44px] px-[16px]' : 'h-[52px] px-[20px]'} shrink-0 whitespace-nowrap rounded-full text-wall-detail font-semibold ${primary ? 'border-0 bg-wall-ink text-wall-on-pigment' : 'border border-solid border-wall-ink-2 bg-transparent text-wall-ink'}`}
    >
      {label}
    </button>
  )
}

function NextRow({ item, snoozing, onSnoozeToggle, onAct, onOpen, onEdit }: { item: TodoItem; snoozing: boolean; onSnoozeToggle: () => void; onAct: WallTodosProps['onAct']; onOpen?: () => void; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-[24px] border-0 border-t border-solid border-wall-rule py-[14px]">
      <div className="flex min-w-0 flex-1 flex-col gap-[4px]">
        <button type="button" aria-label={`Edit ${item.title}`} onClick={(e) => { e.stopPropagation(); onEdit() }} className="min-w-0 truncate border-0 bg-transparent p-0 text-left font-display text-wall-date font-semibold leading-tight text-wall-ink">{item.title}</button>
        {item.nextStep && <span className="truncate text-wall-body font-bold text-wall-brass-ink">Next: {item.nextStep}</span>}
        {snoozing ? (
          <span className="flex items-center gap-[8px] pt-[2px]">
            <span className="text-wall-label text-wall-ink-2">Not now — back in</span>
            {SNOOZES.map((s) => <Pill key={s.days} small label={s.label} onClick={() => void onAct({ action: 'snooze', id: item.id, days: s.days })} />)}
          </span>
        ) : (
          <span className={`truncate text-wall-detail ${item.overdue ? 'font-semibold text-wall-rust' : 'text-wall-ink-2'}`}>{sizeLine(item)}</span>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-[6px]">
        <div className="flex gap-[8px]">
          {onOpen && <Pill label="Open" onClick={onOpen} />}
          <Pill label="Done" primary onClick={() => void onAct({ action: 'done', id: item.id })} />
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            onSnoozeToggle()
          }}
          className="h-[36px] border-0 bg-transparent p-0 text-wall-label text-wall-ink-2 underline underline-offset-4"
        >
          {snoozing ? 'Keep it' : 'Not now'}
        </button>
      </div>
    </div>
  )
}

const suggestionLine = (s: TodoSuggestion) =>
  s.kind === 'merge' ? `Same as “${s.withTitle ?? 'another one'}” — merge?` : s.kind === 'done' ? 'Looks over — close it?' : 'Just a buy — move it to Shopping?'

export default function WallTodos({ now, list, onAct, onOpen, canOpen = () => false, onBack, onActivity, week, useProject = useTodoProject }: WallTodosProps) {
  const [snoozingId, setSnoozingId] = useState<string | null>(null)
  const [openGroup, setOpenGroup] = useState<string | null>(null)
  const [page, setPage] = useState(0)
  // Tapping in (step 5): a to-do opens its sheet; a project (or one of its steps) opens the project.
  const [editing, setEditing] = useState<TodoItem | null>(null)
  const [projectId, setProjectId] = useState<string | null>(null)
  const project = useProject(projectId)
  const openItem = (item: TodoItem) => (item.projectId ? setProjectId(item.projectId) : setEditing(item))
  const clock = formatWallClock(now)
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  // The shelf steps aside while a folded group is open, so the group has the room.
  const showShelf = list.projects.some((p) => p.detail) && openGroup === null
  const act = async (request: TodoAction) => {
    setSnoozingId(null)
    await onAct(request)
  }

  // The folded groups on the right: Casa's suggestions first (they wait for a yes), then by kind;
  // an empty group isn't shown.
  const groups = [
    ...(list.suggestions.length ? [{ key: 'noticed', label: 'Casa noticed', count: list.suggestions.length, summary: `${list.suggestions.length} for a yes` }] : []),
    // Projects have their own shelf above (P3.23, canvas 10a), not a folded group.
    ...GROUPS.filter((g) => g.key !== 'projects').map((g) => {
      const count = list.groups[g.key].length
      const names = list.groups[g.key].map((i) => i.title)
      return { key: g.key, label: g.label, count, summary: names.slice(0, 2).join(' · ') + (names.length > 2 ? ' · …' : '') }
    }).filter((g) => g.count > 0),
  ]
  const toggle = (key: string) => {
    setPage(0)
    setOpenGroup((open) => (open === key ? null : key))
  }
  const rowsOf = (key: string): ReactNode[] => {
    if (key === 'noticed') {
      return list.suggestions.map((s) => (
        <div key={s.id} className="flex items-center gap-[12px] border-0 border-t border-solid border-wall-stone py-[8px]">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-wall-detail font-semibold">{s.title}</span>
            <span className="truncate text-wall-label text-wall-ink-2">{suggestionLine(s)}</span>
          </span>
          <Pill small label="Keep" onClick={() => void act({ action: 'dismiss', id: s.id })} />
          <Pill small primary label="Yes" onClick={() => void act({ action: 'accept', id: s.id })} />
        </div>
      ))
    }
    if (key === 'projects') {
      return list.projects.map((p) => (
        <div key={p.id} className="flex items-center gap-[12px] border-0 border-t border-solid border-wall-stone py-[8px]">
          <button type="button" aria-label={`Open ${p.title}`} onClick={(e) => { e.stopPropagation(); setProjectId(p.id) }} className="flex min-w-0 flex-1 flex-col border-0 bg-transparent p-0 text-left text-wall-ink">
            <span className="truncate text-wall-detail font-semibold">{p.title}</span>
            <span className="truncate text-wall-label text-wall-ink-2">{p.done} of {p.total}{p.next ? ` · next: ${p.next}` : ''}{p.aimDate ? ` · target ${new Date(`${p.aimDate}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</span>
          </button>
          <span aria-hidden="true" className="text-wall-heading text-wall-ink-2">›</span>
        </div>
      ))
    }
    return list.groups[key as keyof TodoList['groups']].map((i) => (
      <div key={i.id} className="flex items-center gap-[12px] border-0 border-t border-solid border-wall-stone py-[8px]">
        <button type="button" aria-label={`Edit ${i.title}`} onClick={(e) => { e.stopPropagation(); openItem(i) }} className="flex min-w-0 flex-1 flex-col border-0 bg-transparent p-0 text-left text-wall-ink">
          <span className="truncate text-wall-detail font-semibold">{i.title}</span>
          <span className="truncate text-wall-label text-wall-ink-2">{sizeLine(i)}{i.snoozedUntil ? ' · snoozed' : ''}</span>
        </button>
        <Pill small primary label="Done" onClick={() => void act({ action: 'done', id: i.id })} />
      </div>
    ))
  }

  return (
    <div className="relative flex h-full w-full flex-col gap-[18px] bg-wall-ground p-[44px] font-body text-wall-ink" onPointerDown={onActivity}>
      <header className="flex h-[130px] shrink-0 items-center gap-[48px]">
        <div className="flex w-[420px] shrink-0 flex-col justify-center gap-[6px]">
          <div className="flex items-baseline gap-[10px]">
            <span className="font-display text-wall-clock font-medium lining-nums">{clock.time}</span>
            <span className="text-wall-heading font-semibold text-wall-ink-2">{clock.meridiem}</span>
          </div>
          <div className="font-display text-wall-date italic text-wall-ink-2">{formatWallDate(now)}</div>
        </div>
        <div className="h-[110px] w-px shrink-0 bg-wall-rule" />
        <div className="flex min-w-0 flex-1 items-center justify-between gap-[32px]">
          <div className="flex min-w-0 flex-col gap-[8px]">
            <div className="text-wall-label font-bold tracking-[0.25em] text-wall-brass-ink">TO DO · WHAT NEEDS DOING</div>
            <div className="font-display text-wall-move font-semibold">{list.nextUp.length ? `${Math.min(list.nextUp.length, nextUpRoom(list))} ready now` : 'All clear for now'}</div>
            <div className="truncate text-wall-body text-wall-ink-2">
              {list.sorting ? 'Casa is sorting what’s new from your Reminders. ' : ''}The rest stays folded — open a group to see it.
            </div>
          </div>
          <Pill label="Back to today" onClick={onBack} />
        </div>
      </header>

      {showShelf && <WallProjectShelf projects={list.projects} today={today} onOpen={setProjectId} />}

      <div className="flex min-h-0 flex-1 gap-[44px] overflow-hidden">
        <div className="flex min-w-0 flex-[1.35] flex-col overflow-hidden">
          <div className="pb-[6px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">NEXT UP</div>
          {list.nextUp.length === 0 && (
            <div className="font-display text-wall-date italic text-wall-ink-2">Nothing waiting right now. Anything you add to Reminders shows up here, sorted.</div>
          )}
          {list.nextUp.slice(0, showShelf ? nextUpRoom(list) : 4).map((item) => (
            <NextRow
              key={item.id}
              item={item}
              snoozing={snoozingId === item.id}
              onSnoozeToggle={() => setSnoozingId((id) => (id === item.id ? null : item.id))}
              onAct={act}
              onOpen={onOpen && canOpen(item.id) ? () => onOpen(item.id) : undefined}
              onEdit={() => openItem(item)}
            />
          ))}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-[8px] overflow-hidden">
          <div className="pb-[2px] text-wall-label font-bold tracking-[0.2em] text-wall-ink-2">EVERYTHING ELSE, FOLDED</div>
          {groups.map((g) => {
            const open = openGroup === g.key
            const rows = open ? rowsOf(g.key) : []
            const pages = Math.max(1, Math.ceil(rows.length / PAGE))
            return (
              <div key={g.key} className={`flex shrink-0 flex-col rounded-[18px] bg-wall-on-pigment/50 px-[20px] ${open ? 'border-2 border-solid border-wall-ink pb-[8px]' : 'border border-solid border-wall-stone'}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={(event) => {
                    event.stopPropagation()
                    toggle(g.key)
                  }}
                  className="flex h-[60px] items-center justify-between gap-[16px] border-0 bg-transparent p-0 text-left text-wall-ink"
                >
                  <span className="flex min-w-0 items-baseline gap-[12px]">
                    <span className={`shrink-0 font-display text-wall-date font-bold ${g.key === 'noticed' ? 'text-wall-brass-ink' : ''}`}>{g.label}</span>
                    <span className="shrink-0 text-wall-detail text-wall-ink-2">{g.count}</span>
                    {!open && <span className="truncate text-wall-label text-wall-ink-2">{g.summary}</span>}
                  </span>
                  <span aria-hidden="true" className="text-wall-heading text-wall-ink-2">{open ? '⌄' : '›'}</span>
                </button>
                {open && rows.slice(page * PAGE, page * PAGE + PAGE)}
                {open && pages > 1 && (
                  <div className="flex justify-end pt-[6px]">
                    <Pill small label={page + 1 < pages ? `Next ${Math.min(PAGE, rows.length - (page + 1) * PAGE)}` : 'From the top'} onClick={() => setPage((p) => (p + 1 < pages ? p + 1 : 0))} />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {week}
      {editing && <WallTodoSheet item={editing} now={now} onAct={onAct} onClose={() => setEditing(null)} />}
      {/* A project opens full screen (canvas 10b), over the list. */}
      {projectId && project.data && (
        <WallProject
          detail={project.data}
          now={now}
          onEdit={(op, args) => onAct({ action: 'project_edit', id: projectId, op, args })}
          onBack={() => setProjectId(null)}
          onOpenProject={setProjectId}
        />
      )}
    </div>
  )
}
