import { useEffect, useState, type ReactNode } from 'react'
import { useSource } from './data'
import { ago, money, nightStatus } from './model'
import { Action, Group, Label, Quiet, Row, Stepper, Toggle } from './ui'
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
    </div>
  )
}

// ── Checks ──────────────────────────────────────────────────────────────────────────────────────────────
export function ChecksPage({ head }: { head: ReactNode }) {
  const src = useSource()
  const t = useType()
  const now = src.now()
  const checks = src.useChecks()
  const bugs = src.useBugs()
  const lastDate = checks?.[0]?.run_date ?? null
  const last = (checks ?? []).filter((c) => c.run_date === lastDate)
  const failures = last.flatMap((c) => (c.details ?? []).filter((d): d is { situation?: string; said?: string; ok?: boolean; problem?: string | null } => typeof d === 'object' && d !== null && d.ok === false))
  return (
    <div>
      {head}
      <Group label={lastDate ? `Last run · ${new Date(`${lastDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}` : 'Last run'}>
        {checks == null ? <Quiet>Loading…</Quiet> : last.length === 0 ? <Quiet>No run yet. The first one is tonight at 3 AM.</Quiet> : last.map((c) => (
          <Row key={c.kind + c.created_at} name={c.kind === 'assistant' ? 'The assistant' : 'Screens'} state={c.summary} tone={c.ok ? 'good' : 'rust'} />
        ))}
      </Group>
      {failures.length > 0 && (
        <Group label="What failed">
          {failures.map((f, i) => <Row key={i} name={f.situation ?? 'A check'} state={`“${f.said ?? ''}” — ${f.problem ?? ''}`} tone="rust" />)}
        </Group>
      )}
      {checks && checks.length > 0 && (
        <>
          <Label>The last two weeks</Label>
          <div className="flex flex-wrap gap-[6px] px-[4px]" role="list" aria-label="Nights">
            {nightStatus(checks).map((n) => <span key={n.date} role="listitem" aria-label={`${n.date}: ${n.ok ? 'all passed' : 'something failed'}`} className={`h-[18px] w-[18px] rounded-[5px] ${n.ok ? 'bg-wall-pigment-6' : 'bg-wall-rust'}`} />)}
          </div>
        </>
      )}
      <Group label="Bug box">
        <Row name={bugs ? `${bugs.open} open` : 'Open reports'} state={bugs?.newest ? `Newest ${ago(bugs.newest, now)}` : 'Hold the bug icon on the phone to report one'} />
      </Group>
      <p className={`m-0 mt-[10px] px-[4px] text-wall-ink-2 ${t.detail}`}>A failed night sends you an email at 7:30 AM; a good one sends nothing.</p>
    </div>
  )
}

// ── Voice ───────────────────────────────────────────────────────────────────────────────────────────────
const TIP_KEYS = ['casa.askTip.opens', 'casa.askTip.done', 'casa.swipeTip.opens', 'casa.swipeTip.done']

export function VoicePage({ head }: { head: ReactNode }) {
  const src = useSource()
  const screen = src.useScreen()
  const [mic, setMic] = useState<string | null>(null)
  const [note, show] = useSaveNote()
  useEffect(() => {
    void navigator.permissions?.query({ name: 'microphone' as PermissionName }).then((p) => setMic(p.state), () => setMic(null))
  }, [])
  const sensitivity = Math.round((0.7 - screen.settings.wakeWordSensitivity) * 20) // 0.1 strict…0.6 loose → 12…2
  return (
    <div>
      {head}
      {src.onWall && (
        <Group label="The wake word, on this wall">
          <Row name="Listen for the wake word" right={<Toggle label="Listen for the wake word" on={screen.settings.wakeWordEnabled} onChange={(on) => screen.update({ wakeWordEnabled: on })} />} />
          <Row name="How easily it wakes" state="Higher hears you from further away; lower wakes by mistake less"
            right={<Stepper label="How easily it wakes" value={sensitivity} min={2} max={12} step={1} onChange={(v) => {
              const score = Math.round((0.7 - v / 20) * 100) / 100
              screen.update({ wakeWordSensitivity: score })
              // The Pi's listener takes it at once (as the old settings did).
              void fetch('http://127.0.0.1:8766/wake-sensitivity', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ score }) }).catch(() => {})
            }} />} />
        </Group>
      )}
      <Group label="On this device">
        <Row name="Microphone" state={mic === 'granted' ? 'Allowed' : mic === 'denied' ? 'Blocked · allow it in the browser’s settings' : mic === 'prompt' ? 'Asks the first time you talk' : 'Can’t tell on this browser'} tone={mic === 'denied' ? 'rust' : 'quiet'} />
        <Row name="The how-to tips" state="“Hold me to ask” and “Swipe to finish” show again on the next opens"
          right={<Action onClick={() => { try { TIP_KEYS.forEach((k) => localStorage.removeItem(k)) } catch { /* private mode */ } show({ ok: true }, 'The tips will show again.') }}>Show again</Action>} />
      </Group>
      {note}
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
      <Group label="The wall">{job('refresh_wall', 'Refresh the wall', 'Reloads the kitchen screen within a minute', 'The wall will reload in a minute.')}</Group>
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

