import { useEffect, useState, type ReactNode } from 'react'
import { useSource, type BugPatch, type NightlyCheck, type BugReport, type SaveResult } from './data'
import { ago, BUG_PRIORITIES, BUG_STATUSES, bugIsOpen, checkLine, money, nightStatus, screenFailures, type BugStatus } from './model'
import { Action, Group, Label, Quiet, Row, Seg, Sheet, Stepper, Toggle } from './ui'
import { useSize, useType } from './sizing'
import { useSaveNote } from './saveNote'

// Settings V2 › Advanced (canvas 47d–e; Jake: "I still want to geek out on the details especially around usage, ai
// throttling"). Numbers first, the detail under them. Only Jake sees these (the gate is in SettingsRoot).

const WHO = [
  { key: 'family', label: 'The family', color: 'bg-wall-ink' },
  { key: 'nightly', label: 'Nightly checks', color: 'bg-wall-brass' },
  { key: 'testing', label: 'Claude’s testing', color: 'bg-wall-stone' },
] as const

// ── Usage and cost ──────────────────────────────────────────────────────────────────────────────────────
export function UsagePage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const wall = useSize() === 'wall'
  const usage = src.useUsage()
  if (!usage) return <div>{head}<Group><Quiet>Loading…</Quiet></Group></div>
  const days = usage.days ?? []
  const top = Math.max(0.01, ...days.map((d) => d.family + d.nightly + d.testing))
  const featTop = Math.max(0.01, ...usage.features.map((f) => f.usd))
  const barH = wall ? 200 : 140
  return (
    <div>
      {head}
      <div className="mt-[14px] flex flex-wrap items-baseline gap-x-[12px]">
        <span className={`font-display font-semibold text-wall-ink [font-variant-numeric:lining-nums] ${wall ? 'text-wall-countdown-long' : 'text-phone-magnified'}`}>{money(usage.today.usd)}</span>
        <span className={`text-wall-ink-2 ${t.detail}`}>today · {money(usage.period_usd)} the last 7 days</span>
      </div>
      <p className={`m-0 text-wall-ink-2 ${t.detail}`}>The family {money(usage.today.family)}, nightly checks {money(usage.today.nightly)}, Claude’s testing {money(usage.today.testing)}.</p>
      <section aria-label="Spend by day" className="mt-[12px] rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment px-[12px] pb-[10px] pt-[14px]">
        <div className="flex items-end gap-[6px]">
          {days.map((d) => {
            const total = d.family + d.nightly + d.testing
            const day = new Date(`${d.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })
            return (
              <div key={d.date} className="flex flex-1 flex-col items-center gap-[6px]" aria-label={`${day}: ${money(total)}`}>
                <span className={`text-wall-ink-2 ${t.label}`}>{total >= 0.005 ? money(total) : ''}</span>
                <div className="flex w-[60%] flex-col justify-end overflow-hidden rounded-[6px]" style={{ height: barH }}>
                  {[...WHO].reverse().map((w) => <div key={w.key} className={w.color} style={{ height: Math.round(((d[w.key] ?? 0) / top) * barH) }} />)}
                </div>
                <span className={`font-semibold text-wall-ink-2 ${t.label}`}>{day}</span>
              </div>
            )
          })}
        </div>
        <div className={`mt-[10px] flex flex-wrap gap-x-[14px] gap-y-[4px] text-wall-ink-2 ${t.label}`}>
          {WHO.map((w) => <span key={w.key} className="flex items-center gap-[6px]"><span aria-hidden="true" className={`h-[10px] w-[10px] rounded-[3px] ${w.color}`} />{w.label}</span>)}
        </div>
      </section>
      <Label>The last 7 days by feature</Label>
      <div className="rounded-[18px] border border-solid border-wall-stone bg-wall-on-pigment py-[6px]">
        {usage.features.map((f) => (
          <div key={f.feature} className={`flex items-center gap-[12px] px-[16px] py-[9px] text-wall-ink ${t.detail}`}>
            <span className="w-[34%] shrink-0">{f.feature}</span>
            <div className="h-[8px] flex-1 rounded-full bg-phone-card"><div className="h-[8px] rounded-full bg-wall-brass" style={{ width: `${Math.max(2, (f.usd / featTop) * 100)}%` }} /></div>
            <span className="w-[56px] shrink-0 text-right text-wall-ink-2">{money(f.usd)}</span>
          </div>
        ))}
      </div>
      <Group label="One question">
        <Row name={`About ${money(usage.question.avg_usd)} a round`} state={`${Math.round(usage.question.avg_input / 1000)}k tokens sent each time; ${Math.round(usage.question.reused_share * 100)}% reused at the discount. A question takes one to three rounds.`} />
      </Group>
      <Group label="Also">
        <Row name="Google Maps" state={`${usage.maps.calls} place and route look-ups in the last 7 days`} />
        {usage.unpriced_calls > 0 && <Row name="Without a price" state={`${usage.unpriced_calls} calls used a model with no price on file, so they’re left out of the totals`} />}
        <Row name="Before Oct 6" state="Who caused a call was only labelled from tonight; earlier testing that didn’t name itself counts as the family." />
      </Group>
    </div>
  )
}

// ── Limits and health ───────────────────────────────────────────────────────────────────────────────────
const MODEL_NAMES: Record<string, string> = { 'gemini-2.5-flash': 'Gemini 2.5 Flash', 'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite', 'gemini-3.6-flash': 'Gemini 3.6 Flash', 'gemini-embedding-001': 'Gemini embeddings', 'gemini-2.5-pro': 'Gemini 2.5 Pro' }

function Meter({ name, spent, cap }: { name: string; spent: number; cap: number }) {
  const t = useType()
  const share = cap > 0 ? Math.min(1, spent / cap) : 0
  return (
    <div className="px-[16px] py-[12px]">
      <div className={`flex justify-between text-wall-ink ${t.body}`}><span>{name}</span><span className="text-wall-ink-2">{money(spent)} of {money(cap)}</span></div>
      <div className="mt-[8px] h-[8px] rounded-full bg-phone-card" role="meter" aria-label={name} aria-valuemin={0} aria-valuemax={cap} aria-valuenow={spent}>
        <div className={`h-[8px] rounded-full ${share > 0.8 ? 'bg-wall-rust' : 'bg-wall-brass'}`} style={{ width: `${Math.max(1, share * 100)}%` }} />
      </div>
    </div>
  )
}

export function LimitsPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const now = src.now()
  const { summary, setPaused, setCaps } = src.useHealth()
  const usage = src.useUsage()
  const connections = src.useConnections()
  const [caps, setCapsDraft] = useState<{ hourly: number; daily: number } | null>(null)
  const [note, show] = useSaveNote()
  if (!summary) return <div>{head}<Group><Quiet>Loading…</Quiet></Group></div>
  const b = summary.breaker
  const paused = Boolean(b.paused)
  const lastSync = (connections ?? []).map((m) => m.connection?.last_sync_at).filter(Boolean).sort().at(-1) ?? null
  const hw = src.useWallHardware()
  const jobs = summary.last_check?.background_calls
  return (
    <div>
      {head}
      <Group label="The breaker">
        <Row name={paused ? 'Paused' : 'Running'} tone={paused ? 'rust' : 'good'}
          state={paused ? (b.trip_reason ? `Tripped ${ago(b.tripped_at ?? null, now)}: ${b.trip_reason}` : 'Paused by hand') : 'The AI stops by itself if it passes a cap'}
          right={<Action tone={paused ? 'brass' : 'rust'} onClick={async () => show(await setPaused(!paused), paused ? 'The AI is back on.' : 'The AI is paused.')}>{paused ? 'Resume' : 'Pause'}</Action>} />
        <Meter name="This hour" spent={summary.spend.hour_cost_usd} cap={b.hourly_cost_cap_usd} />
        <Meter name="Today" spent={summary.spend.day_cost_usd} cap={b.daily_cost_cap_usd} />
        {caps ? (
          <>
            <Row name="An hour" right={<Stepper label="Hourly cap" value={caps.hourly} min={1} max={20} step={1} format={(v) => `$${v}`} onChange={(v) => setCapsDraft({ ...caps, hourly: v })} />} />
            <Row name="A day" right={<Stepper label="Daily cap" value={caps.daily} min={1} max={50} step={1} format={(v) => `$${v}`} onChange={(v) => setCapsDraft({ ...caps, daily: v })} />} />
            <div className="flex justify-end gap-[18px] px-[16px] py-[8px]">
              <Action tone="quiet" onClick={() => setCapsDraft(null)}>Cancel</Action>
              <Action onClick={async () => { show(await setCaps(caps.hourly, caps.daily), `Caps: $${caps.hourly} an hour, $${caps.daily} a day.`); setCapsDraft(null) }}>Save caps</Action>
            </div>
          </>
        ) : (
          <Row name="Caps" state={`$${b.hourly_cost_cap_usd} an hour, $${b.daily_cost_cap_usd} a day`} right={<Action onClick={() => setCapsDraft({ hourly: b.hourly_cost_cap_usd, daily: b.daily_cost_cap_usd })}>Change</Action>} />
        )}
      </Group>
      {note}
      <Group label="Models this week">
        {usage == null ? <Quiet>Loading…</Quiet> : usage.models.map((m) => <Row key={m.feature} name={m.feature} state={`${MODEL_NAMES[m.model] ?? m.model} · ${m.calls} calls`} />)}
      </Group>
      <Group label="Health">
        <Row name="Calendar sync" state={lastSync ? `Last checked ${ago(lastSync, now)}` : 'Not checked yet'} tone={lastSync ? 'good' : 'rust'} />
        <Row name="Background jobs" state={jobs ? `${jobs.total} in the last hour${jobs.errors || jobs.timeouts ? ` · ${jobs.errors} errors, ${jobs.timeouts} timeouts` : ', all fine'}` : 'No check yet'} tone={jobs && (jobs.errors || jobs.timeouts) ? 'rust' : 'good'} />
        <Row name="App errors" state={`${summary.client_errors.last_24h} today · ${summary.client_errors.last_7d} this week`} tone={summary.client_errors.last_24h ? 'rust' : 'quiet'} />
      </Group>
      {src.onWall && (
        <Group label="This wall">
          <Row name="The light sensor" state={hw.sensorOk == null ? 'Checking…' : hw.sensorOk ? 'Working' : 'Not answering · the screen keeps its last brightness'} tone={hw.sensorOk === false ? 'rust' : hw.sensorOk ? 'good' : 'quiet'} />
          <Row name="The wake-word listener" state={hw.listener === 'off' ? 'Not running' : hw.listener ? 'Running' : 'Checking…'} tone={hw.listener === 'off' ? 'rust' : hw.listener ? 'good' : 'quiet'} />
          <Row name="The screen’s brightness range" state={hw.panel ? `${hw.panel.min}–${hw.panel.max} on the monitor’s own scale` : 'Checking…'} />
        </Group>
      )}
    </div>
  )
}

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────────────
// Every line opens (Jake, Oct 6: "allow me to dig into this information more, click and show me the details, allow me
// to edit the bugs captured, prioritize, delete if not relevant any more").
type AssistantResult = Exclude<NightlyCheck['details'][number], string>
const isResult = (d: unknown): d is AssistantResult => typeof d === 'object' && d !== null
const nightName = (date: string) => new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
const priorityName = (v: string) => BUG_PRIORITIES.find((p) => p.value === v)?.label ?? 'Normal'

export function ChecksPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const now = src.now()
  const checks = src.useChecks()
  const box = src.useBugBox()
  const [night, setNight] = useState<string | null>(null)
  const [open, setOpen] = useState<{ kind: 'screens' } | { kind: 'assistant' } | { kind: 'result'; r: AssistantResult } | { kind: 'bug'; id: string } | null>(null)
  const [showClosed, setShowClosed] = useState(false)
  const nights = checks ? nightStatus(checks) : []
  const shownDate = night ?? checks?.[0]?.run_date ?? null
  const shown = (checks ?? []).filter((c) => c.run_date === shownDate)
  const screens = shown.find((c) => c.kind === 'screens') ?? null
  const assistant = shown.find((c) => c.kind === 'assistant') ?? null
  const results = (assistant?.details ?? []).filter(isResult) as AssistantResult[]
  const failures = results.filter((r) => r.ok === false)
  const bugs = box.bugs ?? []
  const openBugs = bugs.filter((b) => bugIsOpen(b.status))
  const closedBugs = bugs.filter((b) => !bugIsOpen(b.status))
  const bug = open?.kind === 'bug' ? bugs.find((b) => b.id === open.id) ?? null : null
  return (
    <div>
      {head}
      <Group label={shownDate ? `${night && night !== checks?.[0]?.run_date ? 'The night of' : 'Last run'} · ${nightName(shownDate)}` : 'Last run'}>
        {checks == null ? <Quiet>Loading…</Quiet> : shown.length === 0 ? <Quiet>No run yet. The first one is tonight at 3 AM.</Quiet> : shown.map((c) => (
          <Row key={c.kind + c.created_at} name={c.kind === 'assistant' ? 'The assistant' : 'Screens'} state={checkLine(c)} tone={c.ok ? 'good' : 'rust'}
            onClick={() => setOpen({ kind: c.kind })} />
        ))}
      </Group>
      {failures.length > 0 && (
        <Group label="What failed">
          {failures.map((f, i) => <Row key={i} name={f.situation ?? 'A check'} state={`“${f.said ?? ''}”`} tone="rust" onClick={() => setOpen({ kind: 'result', r: f })} />)}
        </Group>
      )}
      {nights.length > 0 && (
        <>
          <Label>The last two weeks</Label>
          <div className="flex flex-wrap gap-[2px] px-[4px]" role="list" aria-label="Nights">
            {nights.map((n) => (
              <button key={n.date} type="button" role="listitem" aria-label={`${nightName(n.date)}: ${n.ok ? 'all passed' : 'something failed'}`} aria-pressed={n.date === shownDate}
                onClick={() => setNight(n.date)} className="flex h-[44px] w-[30px] items-center justify-center border-0 bg-transparent p-0">
                <span className={`h-[20px] w-[20px] rounded-[5px] ${n.ok ? 'bg-wall-pigment-6' : 'bg-wall-rust'} ${n.date === shownDate ? 'ring-2 ring-wall-ink ring-offset-2 ring-offset-phone-ground' : ''}`} />
              </button>
            ))}
          </div>
        </>
      )}
      <Group label={`Bug box · ${box.bugs ? `${openBugs.length} open` : '…'}`}>
        {box.bugs == null ? <Quiet>Loading…</Quiet> : openBugs.length === 0 ? <Quiet>Nothing open. Hold the bug icon on the phone to report one.</Quiet> : openBugs.map((b) => (
          <Row key={b.id} name={b.title} state={bugLine(b, now)} tone={b.severity === 'critical' || b.severity === 'high' ? 'rust' : 'quiet'} onClick={() => setOpen({ kind: 'bug', id: b.id })} />
        ))}
      </Group>
      {closedBugs.length > 0 && (
        <div className="mt-[8px] px-[4px]">
          <Action tone="quiet" onClick={() => setShowClosed(!showClosed)}>{showClosed ? 'Hide the closed ones' : `Show the ${closedBugs.length} closed`}</Action>
        </div>
      )}
      {showClosed && closedBugs.length > 0 && (
        <Group label="Closed">
          {closedBugs.map((b) => <Row key={b.id} name={b.title} state={bugLine(b, now)} onClick={() => setOpen({ kind: 'bug', id: b.id })} />)}
        </Group>
      )}
      <p className={`m-0 mt-[10px] px-[4px] text-wall-ink-2 ${t.detail}`}>A failed night sends you an email at 7:30 AM; a good one sends nothing.</p>

      {open?.kind === 'screens' && screens && (
        <Sheet label="Screens" onClose={() => setOpen(null)}>
          <SheetHead title="Screens" sub={`${nightName(screens.run_date)} · ${screens.summary.replace(/\s*\(log:.*\)\s*$/, '')}`} />
          {screens.ok ? <Quiet>Every screen looked the way it should.</Quiet> : (
            <Group>
              {screenFailures(screens.details).map((f, i) => <Row key={i} name={f.name} state={`${f.area} · ${f.where}`} tone="rust" />)}
            </Group>
          )}
          <p className={`m-0 mt-[10px] px-[4px] text-wall-ink-2 ${t.detail}`}>A screen fails when it no longer matches its saved picture: a real break, or an intended change whose picture wasn’t updated.</p>
          <SheetClose onClose={() => setOpen(null)} />
        </Sheet>
      )}
      {open?.kind === 'assistant' && assistant && (
        <Sheet label="The assistant" onClose={() => setOpen(null)}>
          <SheetHead title="The assistant" sub={`${nightName(assistant.run_date)} · ${checkLine(assistant)}`} />
          <Group>
            {results.map((r, i) => <Row key={i} name={r.situation ?? 'A check'} state={`${r.ok ? '' : 'Failed · '}“${r.said ?? ''}”`} tone={r.ok ? 'quiet' : 'rust'}
              lead={<span aria-hidden="true" className={`h-[10px] w-[10px] shrink-0 rounded-full ${r.ok ? 'bg-wall-pigment-6' : 'bg-wall-rust'}`} />}
              onClick={() => setOpen({ kind: 'result', r })} />)}
          </Group>
          <SheetClose onClose={() => setOpen(null)} />
        </Sheet>
      )}
      {open?.kind === 'result' && (
        <Sheet label={open.r.situation ?? 'A check'} onClose={() => setOpen(assistant ? { kind: 'assistant' } : null)}>
          <SheetHead title={open.r.situation ?? 'A check'} sub={open.r.ok ? 'Passed' : 'Failed'} tone={open.r.ok ? 'good' : 'rust'} />
          <Detail label="Said to it">“{open.r.said}”</Detail>
          {open.r.problem && <Detail label="What went wrong" tone="rust">{open.r.problem}</Detail>}
          <Detail label="What came back">{open.r.got?.text || '(nothing said)'}</Detail>
          {open.r.got?.tool && <Detail label="Card">{open.r.got.tool.replace(/_/g, ' ')}{Object.keys(open.r.got.args ?? {}).length > 0 ? ` · ${Object.entries(open.r.got.args ?? {}).filter(([k]) => k !== 'id' && k !== 'expected_updated_at').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v.join(', ') : String(v)}`).join(' · ')}` : ''}</Detail>}
          {open.r.got?.ms != null && <Detail label="Took">{(open.r.got.ms / 1000).toFixed(1)} s</Detail>}
          <SheetClose onClose={() => setOpen(assistant ? { kind: 'assistant' } : null)} label="Back" />
        </Sheet>
      )}
      {bug && <BugSheet key={bug.id} bug={bug} now={now} edit={box.edit} remove={box.remove} onClose={() => setOpen(null)} />}
    </div>
  )
}

function bugLine(b: BugReport, now: Date): string {
  const status = BUG_STATUSES.find((s) => s.value === b.status)?.label ?? (b.status === 'resolved' ? 'Fixed' : 'Not relevant')
  return [priorityName(b.severity), b.status === 'open' ? null : status, b.member_name, ago(b.created_at, now)].filter(Boolean).join(' · ')
}

function SheetHead({ title, sub, tone = 'quiet' }: { title: string; sub?: string; tone?: 'quiet' | 'rust' | 'good' }) {
  const t = useType()
  return (
    <>
      <h2 className={`m-0 font-display font-semibold text-wall-ink ${t.heading}`}>{title}</h2>
      {sub && <p className={`m-0 mb-[6px] mt-[4px] ${t.detail} ${{ quiet: 'text-wall-ink-2', rust: 'text-wall-rust', good: 'text-wall-pigment-6' }[tone]}`}>{sub}</p>}
    </>
  )
}

function SheetClose({ onClose, label = 'Done' }: { onClose: () => void; label?: string }) {
  return <div className="mt-[10px] flex justify-end"><Action onClick={onClose}>{label}</Action></div>
}

function Detail({ label, children, tone }: { label: string; children: ReactNode; tone?: 'rust' }) {
  const t = useType()
  return (
    <div className="mt-[14px] px-[4px]">
      <div className={`font-semibold uppercase tracking-[0.18em] text-wall-ink-2 ${t.label}`}>{label}</div>
      <div className={`mt-[4px] whitespace-pre-wrap break-words ${t.body} ${tone === 'rust' ? 'text-wall-rust' : 'text-wall-ink'}`}>{children}</div>
    </div>
  )
}

/** One report: rename it, say more, set its priority and state, close it, or delete it. */
function BugSheet({ bug, now, edit, remove, onClose }: { bug: BugReport; now: Date; edit: (id: string, patch: BugPatch) => Promise<SaveResult>; remove: (id: string) => Promise<SaveResult>; onClose: () => void }) {
  const t = useType()
  const [title, setTitle] = useState(bug.title)
  const [details, setDetails] = useState(bug.details ?? '')
  const [sure, setSure] = useState(false)
  const [note, show] = useSaveNote()
  const save = async (patch: BugPatch, saved = 'Saved') => show(await edit(bug.id, patch), saved)
  const conversation = (bug.transcript ?? []).filter((m) => m.text)
  const field = `w-full rounded-[12px] border border-solid border-wall-stone bg-wall-on-pigment px-[14px] font-body text-wall-ink ${t.body}`
  const isOpen = bugIsOpen(bug.status)
  return (
    <Sheet label={`Bug: ${bug.title}`} onClose={onClose}>
      <p className={`m-0 text-wall-ink-2 ${t.detail}`}>{[bug.member_name ? `From ${bug.member_name}` : bug.source === 'assistant' ? 'Filed by the assistant' : null, bug.page ? `on ${bug.page}` : null, new Date(bug.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + (now.getTime() - Date.parse(bug.created_at) < 86_400_000 ? ` (${ago(bug.created_at, now)})` : '')].filter(Boolean).join(' · ')}</p>
      <textarea aria-label="What’s wrong" value={title} rows={2} onChange={(e) => setTitle(e.target.value)} onBlur={() => { if (title.trim() && title.trim() !== bug.title) void save({ title: title.trim() }) }}
        className={`mt-[10px] resize-none py-[10px] font-display font-semibold ${field} ${t.heading}`} />
      <Label>Priority</Label>
      <Seg label="Priority" value={bug.severity} onChange={(severity) => void save({ severity }, `Priority: ${priorityName(severity)}`)} options={BUG_PRIORITIES} />
      {isOpen && (
        <>
          <Label>Where it stands</Label>
          <Seg label="Where it stands" value={bug.status as BugStatus} onChange={(status) => void save({ status })} options={BUG_STATUSES} />
        </>
      )}
      <Label>Details</Label>
      <textarea aria-label="Details" value={details} rows={5} placeholder="What happened, what you expected" onChange={(e) => setDetails(e.target.value)} onBlur={() => { if (details !== (bug.details ?? '')) void save({ details }) }}
        className={`resize-y py-[10px] ${field}`} />
      {conversation.length > 0 && (
        <>
          <Label>The conversation it came from</Label>
          <div className="flex flex-col gap-[8px] px-[4px]">
            {conversation.map((m, i) => (
              <p key={i} className={`m-0 ${t.detail} ${m.role === 'user' ? 'text-wall-ink' : 'text-wall-ink-2'}`}><span className="font-semibold">{m.role === 'user' ? 'Said' : 'Answer'}:</span> {m.text}</p>
            ))}
          </div>
        </>
      )}
      {note}
      <div className="mt-[16px] flex flex-wrap items-center gap-x-[22px] gap-y-[4px] border-0 border-t border-solid border-wall-stone pt-[10px]">
        {isOpen ? (
          <>
            <Action onClick={async () => { const r = await edit(bug.id, { status: 'resolved' }); show(r, 'Marked fixed.'); if (r.ok) onClose() }}>It’s fixed</Action>
            <Action tone="quiet" onClick={async () => { const r = await edit(bug.id, { status: 'wont_fix' }); show(r, 'Closed.'); if (r.ok) onClose() }}>Not relevant any more</Action>
          </>
        ) : (
          <Action onClick={() => void save({ status: 'open' }, 'Open again.')}>Open it again</Action>
        )}
        <Action tone="rust" onClick={async () => { if (!sure) { setSure(true); return } const r = await remove(bug.id); show(r, 'Deleted.'); if (r.ok) onClose() }}>{sure ? 'Tap again to delete for good' : 'Delete'}</Action>
        <span className="flex-1" />
        <Action tone="quiet" onClick={onClose}>Done</Action>
      </div>
    </Sheet>
  )
}

// ── Voice ───────────────────────────────────────────────────────────────────────────────────────────────
const TIP_KEYS = ['casa.askTip.opens', 'casa.askTip.done', 'casa.swipeTip.opens', 'casa.swipeTip.done']

export function VoicePage({ head }: { head: ReactNode }) {
  const src = useSource()
  const screen = src.useScreen()
  const turns = src.useVoiceTurns()
  const hw = src.useWallHardware()
  const now = src.now()
  const [mic, setMic] = useState<string | null>(null)
  const [note, show] = useSaveNote()
  useEffect(() => {
    void navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((p) => setMic(p.state), () => setMic(null))
  }, [])
  // The listener's own number when it answers (it's what's really in use); 0.1 wakes easily … 0.6 is strict → 12…2.
  const sensitivity = Math.round((0.7 - (hw.wakeScore ?? screen.settings.wakeWordSensitivity)) * 20)
  return (
    <div>
      {head}
      {src.onWall && (
        <Group label="The wake word, on this wall">
          <Row name="The listener" state={hw.listener === 'ready' ? 'Running, waiting for the wake word' : hw.listener === 'busy' ? 'Listening to someone now' : hw.listener === 'off' ? 'Not running · Refresh the wall in Maintenance' : 'Checking…'} tone={hw.listener === 'off' ? 'rust' : hw.listener ? 'good' : 'quiet'} />
          <Row name="Listen for the wake word" right={<Toggle label="Listen for the wake word" on={screen.settings.wakeWordEnabled} onChange={(on) => screen.update({ wakeWordEnabled: on })} />} />
          <Row name="How easily it wakes" state="Higher hears you from further away; lower wakes by mistake less"
            right={<Stepper label="How easily it wakes" value={sensitivity} min={2} max={12} step={1} onChange={(v) => {
              const score = Math.round((0.7 - v / 20) * 100) / 100
              screen.update({ wakeWordSensitivity: score })
              // The Pi's listener takes it at once (as the old settings did).
              void src.wallDo({ wakeScore: score })
            }} />} />
        </Group>
      )}
      <Group label="On this device">
        <Row name="Microphone" state={mic === 'granted' ? 'Allowed' : mic === 'denied' ? 'Blocked · allow it in the browser’s settings' : mic === 'prompt' ? 'Asks the first time you talk' : 'Can’t tell on this browser'} tone={mic === 'denied' ? 'rust' : 'quiet'} />
        <Row name="The how-to tips" state="“Hold me to ask” and “Swipe to finish” show again on the next opens"
          right={<Action onClick={() => { try { TIP_KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* private mode */ } show({ ok: true }, 'The tips will show again.') }}>Show again</Action>} />
      </Group>
      {note}
      <Group label="The last things it heard">
        {turns == null ? <Quiet>Loading…</Quiet> : turns.length === 0 ? <Quiet>Nothing yet.</Quiet> : turns.map((v, i) => (
          <Row key={i} name={`“${v.text}”`} state={[v.page === 'wall' ? 'On the wall' : v.page === 'phone' ? 'On a phone' : v.page, ago(v.at, now)].filter(Boolean).join(' · ')} />
        ))}
      </Group>
    </div>
  )
}

// ── Maintenance ─────────────────────────────────────────────────────────────────────────────────────────
export function MaintenancePage({ head, onOld }: { head: ReactNode; onOld: () => void }) {
  const src = useSource()
  const [note, show] = useSaveNote()
  const [sure, setSure] = useState<string | null>(null)
  const job = (id: 'sync_calendars' | 'refresh_wall', name: string, about: string, done: string) => (
    <Row name={name} state={sure === id ? 'Tap Run again to go ahead' : about}
      right={<Action label={`Run: ${name}`} onClick={async () => { if (sure !== id) { setSure(id); return } setSure(null); show(await src.run(id), done) }}>{sure === id ? 'Run now' : 'Run'}</Action>} />
  )
  return (
    <div>
      {head}
      <Group label="The wall">
        {src.onWall
          ? <Row name="Reload this screen" state="Now, from here" right={<Action label="Run: Reload this screen" onClick={() => void src.wallDo('reload_here')}>Reload</Action>} />
          : job('refresh_wall', 'Refresh the wall', 'Reloads the kitchen screen within a minute', 'The wall will reload in a minute.')}
        {src.onWall && (
          <Row name="Re-measure the screen’s brightness range" state={sure === 'calibrate' ? 'The screen flickers for a few seconds. Tap again to go ahead' : 'If the dimmest or brightest looks wrong'}
            right={<Action label="Run: Re-measure the screen’s brightness range" onClick={async () => { if (sure !== 'calibrate') { setSure('calibrate'); return } setSure(null); show(await src.wallDo('calibrate_panel'), 'Measured.') }}>{sure === 'calibrate' ? 'Run now' : 'Run'}</Action>} />
        )}
      </Group>
      <Group label="Data">{job('sync_calendars', 'Check calendars now', 'Normally every few minutes', 'Checking the calendars now.')}</Group>
      {note}
      <Group label="The old settings">
        <Row name="Old settings" state="Everything from before, until the new pages have earned their place" onClick={onOld} />
      </Group>
      <Group label="For Claude">
        <Row name="The design canvas" state="Every screen, before it’s built" onClick={() => window.open('https://claude.ai/artifact/G56Z8ixXCTxpyYRHAtBtiC', '_blank')} />
        <Row name="The settings plan" state="What stays, what retired, and why" onClick={() => window.open('https://claude.ai/code/artifact/2d448df8-9864-43bb-8094-82443acb4abc', '_blank')} />
      </Group>
    </div>
  )
}

