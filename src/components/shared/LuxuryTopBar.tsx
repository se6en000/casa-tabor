import { useMemo, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import {
  Settings,
  Bell,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Plus,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { useGoogleSyncTriage } from '../../hooks/useGoogleSyncTriage'
import { useGmailHealth } from '../../hooks/useGmailHealth'
import { clusterPrepItems } from '../../utils/prepItemClusters'
import { splitActionableAndTransitItems } from '../../utils/needsYouFeed'
import { isItemAlreadyScheduled } from '../../utils/calendarEventMatcher'
import { cn } from '../../utils/cn'
import { IconButton, JewelCapsuleCopilot } from '../ui'
import { useAppStore } from '../../stores/appStore'
import { WeatherIcon } from './WeatherIcon'

/* ════════════════════════════════════════════════════════════════
   LuxuryTopBar — Unified premium navigation bar (Architectural Atelier)
   ════════════════════════════════════════════════════════════════
   Zone Layout:
   ┌───────┬───────────┬─────────────┬──────────┬──────────┐
   │ Brand │  NavRail  │ AmbientInfo │ Actions  │ Copilot  │
   │  (A)  │    (B)    │    (C)      │  (D)     │  (E)     │
   └───────┴───────────┴─────────────┴──────────┴──────────┘
   ═══════════════════════════════════════════════════════════════════ */

// ── Navigation tabs ──────────────────────────────────────────────
const NAV_TABS = [
  { path: '/', label: 'Home', classicLabel: 'Home' },
  { path: '/calendar', label: 'Calendar', classicLabel: 'Calendar' },
  { path: '/cook', label: 'Meals & Kitchen', classicLabel: 'Meals & Kitchen' },
  { path: '/grocery', label: 'Grocery List', classicLabel: 'Grocery List' },
] as const

// ── Zone A: Brand Monogram ───────────────────────────────────────
function BrandZone({ isWarm }: { isWarm: boolean }) {
  const { setCanvasSubmode } = useAppStore()

  return (
    <NavLink
      to="/"
      onClick={() => setCanvasSubmode('calm')}
      className="inline-flex items-center gap-2.5 group h-9 flex-shrink-0"
    >
      <span
        className="topbar-monogram w-9 h-9 rounded-[10px] inline-flex items-center justify-center font-sans text-caption font-bold text-casa-gold flex-shrink-0 transition-transform duration-200 ease-[var(--transition-ease-emphasized)] group-hover:scale-[1.04] leading-none"
      >
        CT
      </span>
      <span
        className={cn(
          'font-display text-heading inline-block tracking-[0.03em] font-semibold leading-none',
          isWarm ? 'text-casa-navy' : 'text-white',
        )}
      >
        Casa Tabor
      </span>
    </NavLink>
  )
}

// ── Zone C: Navigation Rail ──────────────────────────────────────
function NavRail({
  isWarm,
  isCanvas,
}: {
  isWarm: boolean
  isCanvas: boolean
}) {
  const location = useLocation()
  const { setCanvasSubmode } = useAppStore()

  return (
    <nav
      className="hidden md:inline-flex items-center gap-0.5 relative font-sans"
      aria-label="Main navigation"
    >
      {NAV_TABS.map((tab) => {
        const isActive =
          tab.path === '/'
            ? location.pathname === '/'
            : location.pathname.startsWith(tab.path)
        const label = isCanvas ? tab.label : tab.classicLabel

        return (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            onClick={() => {
              if (tab.path === '/') {
                setCanvasSubmode('calm')
              }
            }}
            className={cn(
              'relative px-3.5 min-h-[44px] inline-flex items-center justify-center text-body-sm font-medium transition-colors leading-none tracking-[0.01em]',
              isActive
                ? isWarm
                  ? 'text-casa-navy font-semibold'
                  : 'text-white font-semibold'
                : isWarm
                ? 'text-casa-text-tertiary hover:text-casa-navy'
                : 'text-white/55 hover:text-white',
            )}
          >
            {label}
            {/* Gold underline indicator with layout animation */}
            <AnimatePresence>
              {isActive && (
                <motion.span
                  layoutId="topbar-nav-underline"
                  className="topbar-nav-indicator"
                  initial={false}
                  transition={{
                    type: 'spring',
                    stiffness: 500,
                    damping: 35,
                  }}
                />
              )}
            </AnimatePresence>
          </NavLink>
        )
      })}
    </nav>
  )
}

// ── Zone D: Ambient Info (weather + clock + optional event ticker) ─
function AmbientInfo({ isWarm, showEvents }: { isWarm: boolean; showEvents: boolean }) {
  const now = useLiveClock(10_000)
  const { data: weather } = useHomeWeather()
  const { data: todayEvents = [] } = useTodayEvents(now)

  const happeningNow = useMemo(
    () =>
      todayEvents.filter(
        (e) =>
          isBefore(new Date(e.start_time), now) &&
          isAfter(new Date(e.end_time), now),
      ),
    [todayEvents, now],
  )

  const nextEvent = useMemo(
    () =>
      happeningNow.length === 0
        ? todayEvents
            .filter((e) => isAfter(new Date(e.start_time), now))
            .sort(
              (a, b) =>
                new Date(a.start_time).getTime() -
                new Date(b.start_time).getTime(),
            )[0]
        : null,
    [happeningNow, todayEvents, now],
  )

  const displayEvents =
    happeningNow.length > 0
      ? happeningNow
      : nextEvent
      ? [nextEvent]
      : []
  const isNow = happeningNow.length > 0

  return (
    <div className="flex items-center gap-2.5 flex-shrink-0 font-sans">
      {/* Weather */}
      {weather && (
        <div
          className={cn(
            'hidden sm:flex items-center gap-1.5 text-caption font-medium',
            isWarm ? 'text-casa-text-secondary' : 'text-white/70',
          )}
        >
          <WeatherIcon
            condition={weather.condition}
            size={15}
            className="text-casa-gold"
          />
          <span className="tabular-nums font-semibold">{weather.temp}°</span>
          <span
            className={cn(
              'hidden lg:inline',
              isWarm ? 'text-casa-text-tertiary' : 'text-white/40',
            )}
          >
            {weather.city}
          </span>
        </div>
      )}

      {/* Date & Clock */}
      <div className="flex items-center gap-2">
        <span
          className={cn(
            'hidden sm:inline text-body-sm font-medium tracking-[0.01em]',
            isWarm ? 'text-casa-text-secondary' : 'text-white/80',
          )}
        >
          <span className="hidden md:inline">{format(now, 'EEEE, MMMM d')}</span>
          <span className="md:hidden">{format(now, 'EEE, MMM d')}</span>
        </span>

        {/* Clock */}
        <div
          className={cn(
            'text-body font-semibold tabular-nums flex items-baseline gap-0.5',
            isWarm ? 'text-casa-navy' : 'text-white',
          )}
        >
          {format(now, 'h:mm')}
          <span
            className={cn(
              'text-caption font-medium uppercase tracking-wider',
              isWarm ? 'text-casa-text-tertiary' : 'text-white/50',
            )}
          >
            {format(now, 'a')}
          </span>
        </div>
      </div>

      {/* Event ticker — shown in Classic mode on wide screens */}
      {showEvents && displayEvents.length > 0 && (
        <div className="hidden xl:flex items-center gap-1.5 min-w-0 overflow-hidden">
          <span className="topbar-gold-divider" />
          {isNow && (
            <span
              className={cn(
                'flex items-center gap-1 text-caption font-semibold uppercase tracking-wider flex-shrink-0',
                isWarm ? 'text-casa-text-tertiary' : 'text-white/50',
              )}
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              Now
            </span>
          )}
          {!isNow && nextEvent && (
            <span
              className={cn(
                'text-caption font-semibold uppercase tracking-wider flex-shrink-0',
                isWarm ? 'text-casa-text-tertiary' : 'text-white/40',
              )}
            >
              Next &middot;{' '}
              {(() => {
                const mins = Math.round(
                  (new Date(nextEvent.start_time).getTime() - now.getTime()) /
                    60000,
                )
                return mins < 60
                  ? `in ${mins}m`
                  : format(new Date(nextEvent.start_time), 'h:mm a')
              })()}
            </span>
          )}
          {displayEvents.slice(0, 2).map((ev) => {
            const color = ev.members?.[0]?.family_member?.color_hex
            return (
              <div
                key={ev.id}
                className={cn(
                  'flex items-center gap-1.5 rounded-full px-2.5 py-0.5 min-w-0 max-w-[180px]',
                  isWarm
                    ? 'bg-casa-accent-subtle border border-casa-accent-subtle-border'
                    : 'bg-white/10',
                )}
              >
                {color && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: color }}
                  />
                )}
                <span
                  className={cn(
                    'text-caption truncate',
                    isWarm ? 'text-casa-text' : 'text-white',
                  )}
                >
                  {ev.title.includes(' | ')
                    ? ev.title.split(' | ').slice(1).join(' | ')
                    : ev.title}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Zone E: Utility Actions Track (Streamlined) ───────────────────
function UtilityTrack({
  isWarm,
}: {
  isWarm: boolean
  isCanvas: boolean
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const { canvasSubmode, setCanvasSubmode, openQuickCreate } = useAppStore()
  const isSettings = location.pathname.startsWith('/settings')

  const now = useLiveClock(60_000)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { failedJobs } = useGoogleSyncTriage()

  const activeConflicts = useMemo(() => conflicts.filter((c) => !c.resolved), [conflicts])
  const activePrep = useMemo(() => prepItems.filter((p) => !p.dismissed), [prepItems])

  const unscheduledPrep = useMemo(() => {
    return activePrep.filter((p) => !isItemAlreadyScheduled(p, rollingEvents))
  }, [activePrep, rollingEvents])

  const { actionableItems } = useMemo(
    () => splitActionableAndTransitItems(unscheduledPrep),
    [unscheduledPrep]
  )

  const clusteredPrep = useMemo(() => clusterPrepItems(actionableItems), [actionableItems])
  const totalAttentionCount = activeConflicts.length + failedJobs.length + clusteredPrep.length

  const isTriageActive = location.pathname === '/' && canvasSubmode === 'turbo'

  const handleTriageClick = () => {
    if (location.pathname !== '/') {
      navigate('/')
      setCanvasSubmode('turbo')
    } else {
      setCanvasSubmode(canvasSubmode === 'turbo' ? 'calm' : 'turbo')
    }
  }

  const iconCn = (isActive = false) =>
    cn(
      'size-control rounded-full flex items-center justify-center transition-all duration-150',
      isActive
        ? isWarm
          ? 'bg-casa-navy/12 text-casa-navy ring-1 ring-casa-gold/50 shadow-2xs font-semibold'
          : 'bg-casa-gold/20 text-casa-gold ring-1 ring-casa-gold/40 shadow-2xs font-semibold'
        : isWarm
        ? 'text-casa-text-secondary hover:text-casa-navy hover:bg-black/5 active:scale-95'
        : 'text-white/70 hover:text-white hover:bg-white/10 active:scale-95'
    )

  const { summary: gmailHealth, isDown: isGmailDown } = useGmailHealth()

  return (
    <div
      className={cn(
        'hidden sm:inline-flex items-center p-1 rounded-full border gap-1 transition-all',
        isWarm
          ? 'bg-casa-surface/60 border-casa-border/50 shadow-2xs'
          : 'bg-white/[0.06] border-white/[0.12] shadow-2xs backdrop-blur-md'
      )}
    >
      {/* Gmail Health Alert Complication */}
      {isGmailDown && (
        <IconButton
          icon={
            gmailHealth.status === 'error' ? (
              <AlertCircle size={18} strokeWidth={2} className="text-rose-500 animate-pulse" />
            ) : (
              <AlertTriangle size={18} strokeWidth={2} className="text-amber-500" />
            )
          }
          aria-label={`Gmail Sync: ${gmailHealth.label}`}
          onClick={() => navigate('/settings/google')}
          title={`Gmail Sync: ${gmailHealth.label} — Tap to manage in Settings`}
          variant="ghost"
          className={cn(
            'size-control rounded-full flex items-center justify-center transition-all duration-150',
            gmailHealth.status === 'error'
              ? 'bg-rose-500/15 text-rose-500 ring-1 ring-rose-500/40'
              : 'bg-amber-500/15 text-amber-500 ring-1 ring-amber-500/40'
          )}
        />
      )}

      {/* Quick Add Event / Reminder */}
      <IconButton
        icon={<Plus size={19} strokeWidth={2.2} className="text-casa-gold" />}
        aria-label="Add Event or Reminder"
        onClick={() => openQuickCreate()}
        title="Add Event or Reminder (C or N)"
        variant="ghost"
        className={cn(
          iconCn(false),
          'hover:bg-casa-gold/20 active:scale-95 text-casa-gold'
        )}
      />

      {/* Refresh Screen */}
      <IconButton
        icon={<RefreshCw size={19} strokeWidth={1.8} />}
        aria-label="Refresh Page"
        onClick={() => window.location.reload()}
        title="Refresh Page"
        variant="ghost"
        className={iconCn(false)}
      />

      {/* Triage Bell with Luxury Complication Badge */}
      <div className="relative inline-flex items-center justify-center">
        <IconButton
          icon={<Bell size={19} strokeWidth={1.8} className={isTriageActive ? (isWarm ? 'text-amber-800' : 'text-casa-gold') : totalAttentionCount > 0 ? (isWarm ? 'text-amber-800' : 'text-casa-gold') : undefined} />}
          aria-label={totalAttentionCount > 0 ? `${totalAttentionCount} Triage Items` : 'Triage Items'}
          onClick={handleTriageClick}
          title={totalAttentionCount > 0 ? `${totalAttentionCount} Triage Items` : 'Triage Items'}
          variant="ghost"
          className={iconCn(false)}
        />
        {totalAttentionCount > 0 && (
          <span
            className={cn(
              'absolute bottom-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full font-sans font-bold text-2xs tabular-nums flex items-center justify-center leading-none pointer-events-none shadow-xs border',
              isWarm
                ? 'bg-casa-gold text-casa-navy border-casa-surface ring-1 ring-casa-gold/40'
                : 'bg-casa-gold text-casa-navy border-casa-navy ring-1 ring-casa-gold/50'
            )}
          >
            {totalAttentionCount}
          </span>
        )}
      </div>

      {/* Settings */}
      <IconButton
        icon={<Settings size={19} strokeWidth={1.8} />}
        aria-label="Settings"
        onClick={() => navigate('/settings')}
        title="Settings"
        variant="ghost"
        className={iconCn(isSettings)}
      />
    </div>
  )
}

// ── Zone F: AI Copilot Action ────────────────────────────────────
function CopilotAction() {
  const { aiDrawerOpen, sidecarTab, setSidecarTab, openAiInSidecar, closeSidecar } = useAppStore()
  const btnRef = useRef<HTMLButtonElement>(null)
  const isAiActive = aiDrawerOpen && sidecarTab === 'ai'

  return (
    <JewelCapsuleCopilot
      ref={btnRef}
      isActive={isAiActive}
      onClick={() => {
        if (aiDrawerOpen && sidecarTab === 'ai') {
          closeSidecar()
        } else if (aiDrawerOpen && sidecarTab === 'event') {
          setSidecarTab('ai')
        } else {
          openAiInSidecar()
        }
      }}
    />
  )
}

// ════════════════════════════════════════════════════════════════
// ── Main Export ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════
export default function LuxuryTopBar() {
  const { experienceMode, canvasSubmode } = useAppStore()
  const location = useLocation()

  const isCanvas = experienceMode === 'living_canvas'
  const isCalm = isCanvas && canvasSubmode === 'calm'
  const isCook = location.pathname.startsWith('/cook')
  const isWarm = isCalm // Warm material when in calm mode

  return (
    <header
      className={cn(
        'app-topbar hidden lg:flex w-full items-center justify-between flex-shrink-0 z-sticky transition-all duration-300',
        'luxury-topbar',
        isWarm && 'luxury-topbar--warm',
      )}
      role="banner"
      aria-label="Casa Tabor main navigation"
    >
      {/* ── Left cluster: Brand + Nav + Mode ────────────── */}
      <div className="flex items-center gap-3 min-w-0">
        <BrandZone isWarm={isWarm} />

        {/* Gold divider between brand and nav */}
        <span className="topbar-gold-divider hidden md:block" />

        {/* Navigation Rail — ALWAYS FIRST so nav buttons NEVER shift position */}
        <NavRail isWarm={isWarm} isCanvas={isCanvas} />
      </div>

      {/* ── Right cluster: Info + Utility + AI ──────────── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <AmbientInfo isWarm={isWarm} showEvents={!isCanvas} />

        <span className="topbar-gold-divider hidden lg:block" />

        <UtilityTrack isWarm={isWarm} isCanvas={isCanvas} />

        {!isCook && (
          <>
            <span className="topbar-gold-divider hidden sm:block" />
            <CopilotAction />
          </>
        )}
      </div>
    </header>
  )
}

