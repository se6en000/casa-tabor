import { useEffect, useState, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ChevronLeft, Lock, ScanFace, Search } from 'lucide-react'
import { choreDays } from '../wall/choreText'
import { liveSource } from './liveSource'
import { people, SettingsSourceContext, useSource, type SettingsSource } from './data'
import { checkLine, money, ownerId, pageById, pageFromPath, searchPages, SETTINGS_PAGES, type SettingsPage, type SettingsPageId } from './model'
import { Action, Group, PageHead, PageIcon, Row, Seg } from './ui'
import { SizeContext, useType, type SettingsSize } from './sizing'
import { AlexaPage, CalendarsPage, ChoresPage, FamilyPage, KnowsPage, PlacesPage, WallPage } from './GeneralPages'
import { DEFAULT_CORE } from '../../supabase/functions/_shared/house-persona.mjs'
import { ChecksPage, LimitsPage, MaintenancePage, UsagePage, VoicePage } from './AdvancedPages'

// Settings V2 (canvas 47; Jake, Oct 5: "go, A on the settings landing page"). /settings: on a phone, the home (47a A,
// the glance) and a page at a time; on a laptop or the kitchen wall, the list beside the page (47f), touch-sized on
// the wall. Advanced is Jake's. The old settings stay at /settings/old until these have earned their place.

const WIDE_PX = 900
const IDLE_BACK_MS = 90_000

function useWide(onWall: boolean) {
  const query = `(min-width: ${WIDE_PX}px)`
  const [wide, setWide] = useState(() => onWall || (typeof window !== 'undefined' && window.matchMedia?.(query).matches))
  useEffect(() => {
    if (onWall || !window.matchMedia) return
    const m = window.matchMedia(query)
    const on = () => setWide(m.matches)
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [onWall, query])
  return wide
}

export default function SettingsRoot({ source = liveSource }: { source?: SettingsSource }) {
  const size: SettingsSize = source.onWall ? 'wall' : 'hand'
  return (
    <SettingsSourceContext.Provider value={source}>
      <SizeContext.Provider value={size}>
        <Settings />
      </SizeContext.Provider>
    </SettingsSourceContext.Provider>
  )
}

function Settings() {
  const src = useSource()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const wide = useWide(src.onWall)
  const members = src.useMembers()
  const viewer = src.useViewer()
  const owner = ownerId(members ?? [])
  // On the kitchen wall the kiosk stays signed in, so Advanced asks for Jake's PIN each visit (canvas 47f).
  const [wallUnlocked, setWallUnlocked] = useState(false)
  const isOwner = src.onWall ? wallUnlocked : Boolean(viewer.id && viewer.id === owner)
  const unlock = owner ? { ownerId: owner, onUnlock: () => setWallUnlocked(true) } : null
  const page = pageFromPath(pathname)
  // An old link (/settings/google, Google's way back) is shown at its new address.
  useEffect(() => {
    const part = pathname.replace(/^\/settings\/?/, '').split('/')[0]
    if (page && part !== page) navigate(`/settings/${page}${search}`, { replace: true })
  }, [page, pathname, search, navigate])
  const [tab, setTab] = useState<'general' | 'advanced'>(() => (pageById(page)?.advanced ? 'advanced' : 'general'))
  const open = (id: SettingsPageId) => navigate(`/settings/${id}`)
  const home = () => navigate('/settings')
  const leave = () => navigate(src.onWall ? '/wall' : wide ? '/' : '/phone')
  // On the kitchen wall, settings left open goes back to the wall after a minute and a half untouched (canvas 47f).
  useEffect(() => {
    if (!src.onWall) return
    let timer = window.setTimeout(() => navigate('/wall'), IDLE_BACK_MS)
    const touched = () => { window.clearTimeout(timer); timer = window.setTimeout(() => navigate('/wall'), IDLE_BACK_MS) }
    window.addEventListener('pointerdown', touched)
    window.addEventListener('keydown', touched)
    return () => { window.clearTimeout(timer); window.removeEventListener('pointerdown', touched); window.removeEventListener('keydown', touched) }
  }, [src.onWall, navigate])
  const leaveWords = src.onWall ? 'Back to the wall' : 'Back'

  const shown = page ?? (wide ? 'family' : null)
  // On a wide screen an Advanced page shows the PIN pad itself; the list beside it just says it's locked.
  const pageGated = Boolean(shown && pageById(shown)?.advanced && !isOwner)
  const body = shown ? <PageView id={shown} isOwner={isOwner} unlock={unlock} onBack={wide ? undefined : home} onOld={() => navigate('/settings/old/display')} /> : null

  if (!wide) {
    return (
      <main className="min-h-[100dvh] bg-phone-ground px-[18px] pb-[48px] pt-[max(20px,calc(env(safe-area-inset-top)+10px))] font-body text-wall-ink">
        {body ?? <Home tab={tab} setTab={setTab} isOwner={isOwner} unlock={unlock} onOpen={open} current={null} onLeave={leave} leaveWords={leaveWords} />}
      </main>
    )
  }
  return (
    <main className="fixed inset-0 flex bg-phone-ground font-body text-wall-ink">
      <nav aria-label="Settings" className={`shrink-0 overflow-y-auto border-0 border-r border-solid border-wall-stone bg-phone-card px-[24px] pb-[40px] pt-[28px] ${src.onWall ? 'w-[500px]' : 'w-[400px]'}`}>
        <Home tab={tab} setTab={setTab} isOwner={isOwner} unlock={pageGated ? null : unlock} locked={pageGated} onOpen={open} current={shown} onLeave={leave} leaveWords={leaveWords} />
      </nav>
      <div className="min-w-0 flex-1 overflow-y-auto px-[48px] pb-[60px] pt-[36px]">
        <div className={src.onWall ? 'max-w-[1100px]' : 'max-w-[720px]'}>{body}</div>
      </div>
    </main>
  )
}

/** The home (47a A, the glance): each page with what it's set to now, in words. */
type Unlock = { ownerId: string; onUnlock: () => void } | null

function Home({ tab, setTab, isOwner, unlock, locked = false, onOpen, current, onLeave, leaveWords }: {
  locked?: boolean
  tab: 'general' | 'advanced'
  setTab: (t: 'general' | 'advanced') => void
  isOwner: boolean
  unlock: Unlock
  onOpen: (id: SettingsPageId) => void
  current: SettingsPageId | null
  onLeave: () => void
  leaveWords: string
}) {
  const src = useSource()
  const t = useType()
  const viewer = src.useViewer()
  const [q, setQ] = useState('')
  const found = searchPages(q, isOwner)
  return (
    <div className="flex flex-col">
      <button type="button" onClick={onLeave} className={`-ml-[4px] flex min-h-[44px] w-fit items-center gap-[2px] border-0 bg-transparent p-0 font-semibold text-wall-brass-ink ${t.body}`}>
        <ChevronLeft size={20} aria-hidden="true" /> {leaveWords}
      </button>
      <h1 className={`m-0 mt-[6px] font-display font-semibold leading-none text-wall-ink ${t.title}`}>Settings</h1>
      <label className={`mt-[14px] flex items-center gap-[10px] rounded-full border border-solid border-wall-stone bg-wall-on-pigment px-[16px] ${src.onWall ? 'h-[64px]' : 'h-[46px]'}`}>
        <Search size={17} aria-hidden="true" className="shrink-0 text-wall-ink-2" />
        <input aria-label="Search settings" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings"
          className={`min-w-0 flex-1 border-0 bg-transparent font-body text-wall-ink outline-none placeholder:text-wall-ink-2 ${t.body}`} />
      </label>
      {q.trim() ? (
        <Group label="Found">
          {found.length === 0 ? <Row name="Nothing matches" state="Try “brightness”, “Face ID” or “breaker”" /> : found.map((p) => (
            <Row key={p.id} label={`Open ${p.name}`} onClick={() => { setQ(''); setTab(p.advanced ? 'advanced' : 'general'); onOpen(p.id) }} lead={<PageIcon icon={p.icon} />} name={p.name} state={p.about} />
          ))}
        </Group>
      ) : (
        <>
          <div className="mt-[12px]">
            <Seg label="General or Advanced" value={tab} onChange={setTab} options={[
              { value: 'general', label: 'General' },
              { value: 'advanced', label: <>{!isOwner && <Lock size={13} aria-hidden="true" />}Advanced</> },
            ]} />
          </div>
          {tab === 'general'
            ? <Group label="The household"><GeneralRows onOpen={onOpen} current={current} /></Group>
            : isOwner ? <Group label="Just Jake"><AdvancedRows onOpen={onOpen} current={current} /></Group>
              : locked ? <Group label="Just Jake"><Row name="Locked" state="Jake’s PIN, beside" /></Group> : <Gate unlock={unlock} />}
        </>
      )}
      <p className={`m-0 mt-[16px] text-center text-wall-ink-2 ${t.detail}`}>
        {viewer.name ? <>Signed in as {viewer.name}{viewer.signOut && <> · <button type="button" onClick={viewer.signOut} className={`border-0 bg-transparent p-0 font-semibold text-wall-brass-ink ${t.detail}`}>Switch person</button></>}</> : 'Nobody’s signed in'}
      </p>
    </div>
  )
}

function PageRow({ p, state, tone, onOpen, current }: { p: SettingsPage; state: ReactNode; tone?: 'quiet' | 'brass' | 'rust' | 'good'; onOpen: (id: SettingsPageId) => void; current: SettingsPageId | null }) {
  return (
    <div className={current === p.id ? 'bg-phone-card' : ''} aria-current={current === p.id ? 'page' : undefined}>
      <Row label={`Open ${p.name}`} onClick={() => onOpen(p.id)} lead={<PageIcon icon={p.icon} />} name={p.name} state={state} tone={tone} />
    </div>
  )
}

const P = (id: SettingsPageId) => SETTINGS_PAGES.find((p) => p.id === id)!

function GeneralRows({ onOpen, current }: { onOpen: (id: SettingsPageId) => void; current: SettingsPageId | null }) {
  const src = useSource()
  const members = src.useMembers()
  const faceId = src.useFaceId()
  const viewer = src.useViewer()
  const places = src.usePlaces()
  const contacts = src.useContacts()
  const connections = src.useConnections()
  const { data: email } = src.useEmail()
  const { config } = src.useDisplay()
  const { items } = src.useMemory()
  const { chores } = src.useChores()
  const { persona } = src.usePersona()
  const n = (count: number | undefined, one: string, many: string) => (count == null ? '' : `${count} ${count === 1 ? one : many}`)
  const linked = (connections ?? []).filter((m) => m.connection)
  const signIn = linked.some((m) => m.connection?.reauthorization_required || m.connection?.health_status === 'reauthorization_required')
  const failing = linked.some((m) => m.connection?.last_sync_error)
  const broken = signIn || failing
  const calendars = linked.reduce((sum, m) => sum + (m.connection?.read_calendar_metadata?.length || 1), 0)
  const unsure = items?.filter((i) => i.confidence !== 'sure').length ?? 0
  const trash = chores?.find((c) => /trash/i.test(c.title))
  return (
    <>
      <PageRow p={P('family')} onOpen={onOpen} current={current} state={[n(people(members).length || undefined, 'person', 'people'), viewer.name && faceId.here ? `Face ID on for ${viewer.name}` : null].filter(Boolean).join(' · ')} />
      <PageRow p={P('places')} onOpen={onOpen} current={current} state={[places ? `Home and ${n(places.filter((p) => p.confirmed !== false && !(p as { dismissed_at?: string | null }).dismissed_at).length, 'place', 'places')}` : null, contacts ? n(contacts.length, 'person', 'people') : null].filter(Boolean).join(' · ')} />
      <PageRow p={P('calendars')} onOpen={onOpen} current={current} tone={broken ? 'rust' : 'quiet'}
        state={signIn ? 'A calendar needs signing in again' : failing ? 'A calendar isn’t syncing' : [connections ? n(calendars, 'calendar', 'calendars') : null, email ? (email.keep.length ? `kept posted on ${email.keep.length}` : 'the email reader is on') : null].filter(Boolean).join(' · ')} />
      <PageRow p={P('wall')} onOpen={onOpen} current={current} state={config ? `Up to ${config.brightness_max ?? 100}% bright · ${config.auto_sleep_enabled !== false ? 'sleeps in the dark' : 'stays on in the dark'}` : ''} />
      <PageRow p={P('knows')} onOpen={onOpen} current={current} tone={unsure ? 'brass' : 'quiet'} state={items ? `${n(items.length, 'thing', 'things')}${unsure ? ` · ${unsure} not sure yet` : ''}` : ''} />
      <PageRow p={P('alexa')} onOpen={onOpen} current={current} tone="brass" state={persona ? [persona.core === DEFAULT_CORE ? 'The house' : 'In your words', n(persona.notes.length, 'thing picked up', 'things picked up')].join(' · ') : ''} />
      <PageRow p={P('chores')} onOpen={onOpen} current={current} state={chores ? [n(chores.length, 'chore', 'chores'), trash ? `${trash.title.toLowerCase()} ${choreDays(trash.days_of_week)}` : null].filter(Boolean).join(' · ') : ''} />
    </>
  )
}

function AdvancedRows({ onOpen, current }: { onOpen: (id: SettingsPageId) => void; current: SettingsPageId | null }) {
  const src = useSource()
  const usage = src.useUsage()
  const { summary } = src.useHealth()
  const checks = src.useChecks()
  const lastDate = checks?.[0]?.run_date
  const last = (checks ?? []).filter((c) => c.run_date === lastDate)
  const failed = last.filter((c) => !c.ok)
  return (
    <>
      <PageRow p={P('usage')} onOpen={onOpen} current={current} state={usage ? `Today ${money(usage.today.usd)} · the family ${money(usage.today.family)}` : ''} />
      <PageRow p={P('limits')} onOpen={onOpen} current={current} tone={summary?.breaker.paused ? 'rust' : 'quiet'}
        state={summary ? (summary.breaker.paused ? 'The AI is paused' : `${money(summary.spend.day_cost_usd)} of ${money(summary.breaker.daily_cost_cap_usd)} today`) : ''} />
      <PageRow p={P('checks')} onOpen={onOpen} current={current} tone={failed.length ? 'rust' : 'quiet'}
        state={checks == null ? '' : last.length === 0 ? 'First run tonight at 3 AM' : failed.length ? failed.map((c) => checkLine(c)).join(' · ') : 'All passed last night'} />
      <PageRow p={P('voice')} onOpen={onOpen} current={current} state={src.onWall ? 'The wake word on this wall' : 'Microphone and tips'} />
      <PageRow p={P('maintenance')} onOpen={onOpen} current={current} state="Refresh the wall · old settings" />
    </>
  )
}

/** Anyone but Jake sees what Advanced is and how to get in, not the numbers (47e); on the wall, his PIN opens it. */
function Gate({ unlock }: { unlock: Unlock }) {
  const src = useSource()
  const t = useType()
  const viewer = src.useViewer()
  if (src.onWall && unlock) return <WallPin unlock={unlock} />
  return (
    <section aria-label="Advanced is Jake’s" className="mt-[18px] rounded-[22px] bg-wall-ink px-[22px] py-[24px] text-center text-wall-on-pigment">
      <ScanFace size={40} aria-hidden="true" className="mx-auto text-wall-night-brass" />
      <h2 className={`m-0 mt-[10px] font-display font-semibold ${t.heading}`}>Advanced is Jake’s</h2>
      <p className={`m-0 mt-[6px] text-wall-night-ink-2 ${t.detail}`}>Usage and cost, the AI’s limits, the nightly checks and the tools. Sign in as Jake to open it.</p>
      {viewer.signOut && <div className="mt-[12px] flex justify-center"><Action onClick={viewer.signOut}><span className="text-wall-night-brass">Sign in as Jake</span></Action></div>}
    </section>
  )
}

const PIN_LENGTH = 6
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']

/** Jake's PIN on the wall's own keypad (47f): opens Advanced for this visit only. */
function WallPin({ unlock }: { unlock: NonNullable<Unlock> }) {
  const src = useSource()
  const t = useType()
  const [pin, setPin] = useState('')
  const [wrong, setWrong] = useState(false)
  const [checking, setChecking] = useState(false)
  const press = async (k: string) => {
    if (checking || !k) return
    setWrong(false)
    const next = k === '⌫' ? pin.slice(0, -1) : (pin + k).slice(0, PIN_LENGTH)
    setPin(next)
    if (next.length === PIN_LENGTH) {
      setChecking(true)
      const good = await src.checkOwnerPin(unlock.ownerId, next)
      setChecking(false)
      if (good) unlock.onUnlock()
      else { setWrong(true); setPin('') }
    }
  }
  return (
    <section aria-label="Advanced is Jake’s" className="mt-[18px] rounded-[22px] bg-wall-ink px-[22px] py-[24px] text-center text-wall-on-pigment">
      <h2 className={`m-0 font-display font-semibold ${t.heading}`}>Advanced is Jake’s</h2>
      <p className={`m-0 mt-[6px] text-wall-night-ink-2 ${t.detail}`}>{wrong ? 'That PIN isn’t right.' : checking ? 'Checking…' : 'Jake’s PIN opens it for now.'}</p>
      <div className="mt-[14px] flex justify-center gap-[12px]" aria-label={`${pin.length} of ${PIN_LENGTH} numbers`} role="img">
        {Array.from({ length: PIN_LENGTH }, (_, i) => <span key={i} className={`h-[16px] w-[16px] rounded-full border-2 border-solid border-wall-night-brass ${i < pin.length ? 'bg-wall-night-brass' : ''}`} />)}
      </div>
      <div className="mx-auto mt-[18px] grid max-w-[300px] grid-cols-3 gap-[12px]">
        {KEYS.map((k, i) => k ? (
          <button key={i} type="button" aria-label={k === '⌫' ? 'Delete' : k} onClick={() => void press(k)} className={`h-[72px] rounded-full border border-solid border-wall-night-rule bg-transparent font-semibold text-wall-on-pigment ${t.heading}`}>{k}</button>
        ) : <span key={i} />)}
      </div>
    </section>
  )
}

function PageView({ id, isOwner, unlock, onBack, onOld }: { id: SettingsPageId; isOwner: boolean; unlock: Unlock; onBack?: () => void; onOld: () => void }) {
  const p = pageById(id)!
  const head = <PageHead title={p.heading ?? p.name} about={p.about} back={p.advanced ? 'Advanced' : 'Settings'} onBack={onBack} />
  if (p.advanced && !isOwner) return <div>{head}<Gate unlock={unlock} /></div>
  const pages: Record<SettingsPageId, ReactNode> = {
    family: <FamilyPage head={head} />,
    places: <PlacesPage head={head} />,
    calendars: <CalendarsPage head={head} />,
    wall: <WallPage head={head} />,
    knows: <KnowsPage head={head} />,
    alexa: <AlexaPage head={head} />,
    chores: <ChoresPage head={head} />,
    usage: <UsagePage head={head} />,
    limits: <LimitsPage head={head} />,
    checks: <ChecksPage head={head} />,
    voice: <VoicePage head={head} />,
    maintenance: <MaintenancePage head={head} onOld={onOld} />,
  }
  return <div key={id}>{pages[id]}</div>
}

