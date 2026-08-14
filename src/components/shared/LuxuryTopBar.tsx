import { useMemo, useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import {
  Sparkles,
  ImageIcon,
  RefreshCw,
  Zap,
  Leaf,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { IconButton, Button } from '../ui'
import { useAppStore } from '../../stores/appStore'
import { WeatherIcon } from './WeatherIcon'

/* ════════════════════════════════════════════════════════════════
   LuxuryTopBar — Unified premium navigation bar
   ════════════════════════════════════════════════════════════════
   Replaces both TopBarC (Classic) and CanvasTopBar (Living Canvas)
   with a single component that adapts based on experienceMode and
   canvasSubmode.

   Zone Layout:
   ┌───────┬────────────┬───────────┬─────────────┬──────────┬──────────┐
   │ Brand │ ModeSw.    │ NavRail   │ AmbientInfo │ Utility  │ Copilot  │
   │  (A)  │   (B)      │   (C)     │    (D)      │  (E)     │  (F)     │
   └───────┴────────────┴───────────┴─────────────┴──────────┴──────────┘
   ═══════════════════════════════════════════════════════════════════ */

// ── Navigation tabs ──────────────────────────────────────────────
const NAV_TABS = [
  { path: '/', label: 'Living Canvas', classicLabel: 'Home' },
  { path: '/calendar', label: 'Calendar', classicLabel: 'Calendar' },
  { path: '/cook', label: 'Meals & Kitchen', classicLabel: 'Meals & Kitchen' },
  { path: '/settings', label: 'Settings', classicLabel: 'Settings' },
] as const

// ── Zone A: Brand Monogram ───────────────────────────────────────
function BrandZone({ isWarm }: { isWarm: boolean }) {
  return (
    <NavLink to="/" className="inline-flex items-center gap-2.5 group h-9 flex-shrink-0">
      <span
        className="topbar-monogram w-9 h-9 rounded-[10px] inline-flex items-center justify-center text-caption font-bold text-casa-gold flex-shrink-0 transition-transform duration-200 ease-[var(--transition-ease-emphasized)] group-hover:scale-[1.04] leading-none"
      >
        CT
      </span>
      <span
        className={cn(
          'font-display text-heading hidden sm:inline-block tracking-[0.02em] font-semibold leading-none',
          isWarm ? 'text-casa-navy' : 'text-white',
        )}
      >
        Casa Tabor
      </span>
    </NavLink>
  )
}

// ── Zone B: Mode Switcher (Living Canvas home only) ──────────────
function ModeSwitch({ isWarm }: { isWarm: boolean }) {
  const { canvasSubmode, setCanvasSubmode } = useAppStore()

  return (
    <div
      className={cn(
        'hidden md:inline-flex items-center p-0.5 rounded-full border gap-0.5',
        isWarm ? 'bg-casa-surface/60 border-casa-border/50' : 'bg-white/5 border-white/10',
      )}
      role="tablist"
      aria-label="Canvas mode"
    >
      <Button
        variant={canvasSubmode === 'calm' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => setCanvasSubmode('calm')}
        role="tab"
        aria-selected={canvasSubmode === 'calm'}
        className={cn(
          'px-3 min-h-[32px] rounded-full text-caption font-semibold transition-all leading-none',
          canvasSubmode === 'calm'
            ? isWarm
              ? 'bg-casa-navy/10 text-casa-navy border border-casa-gold/40 shadow-2xs font-bold'
              : 'bg-white/20 text-white border border-white/30 shadow-2xs font-bold'
            : isWarm
            ? 'text-casa-text-tertiary hover:text-casa-navy'
            : 'text-white/60 hover:text-white',
        )}
      >
        <Leaf size={12} strokeWidth={2.2} />
        <span>Calm</span>
      </Button>
      <Button
        variant={canvasSubmode === 'turbo' ? 'primary' : 'ghost'}
        size="sm"
        onClick={() => setCanvasSubmode('turbo')}
        role="tab"
        aria-selected={canvasSubmode === 'turbo'}
        className={cn(
          'px-3 min-h-[32px] rounded-full text-caption font-semibold transition-all leading-none',
          canvasSubmode === 'turbo'
            ? 'bg-amber-500/20 text-amber-900 border border-amber-500/40 shadow-2xs font-bold'
            : isWarm
            ? 'text-casa-text-tertiary hover:text-casa-navy'
            : 'text-white/60 hover:text-white',
        )}
      >
        <Zap size={12} strokeWidth={2.2} />
        <span>Turbo</span>
      </Button>
    </div>
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

  return (
    <nav
      className="hidden md:inline-flex items-center gap-0.5 relative"
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
    <div className="flex items-center gap-2.5 flex-shrink-0">
      {/* Weather */}
      {weather && (
        <div
          className={cn(
            'hidden sm:flex items-center gap-1.5 text-caption',
            isWarm ? 'text-casa-text-secondary' : 'text-white/70',
          )}
        >
          <WeatherIcon
            condition={weather.condition}
            size={14}
            className="text-casa-gold"
          />
          <span className="font-mono tabular-nums">{weather.temp}°</span>
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

      {/* Clock */}
      <div
        className={cn(
          'font-mono text-body font-semibold tabular-nums',
          isWarm ? 'text-casa-navy' : 'text-white',
        )}
      >
        {format(now, 'h:mm')}
        <span
          className={cn(
            'text-caption ml-0.5',
            isWarm ? 'text-casa-text-tertiary' : 'text-white/50',
          )}
        >
          {format(now, 'a')}
        </span>
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

// ── Zone E: Utility Actions Track ────────────────────────────────
function UtilityTrack({
  isWarm,
}: {
  isWarm: boolean
  isCanvas: boolean
}) {
  const iconCn = cn(
    'rounded-full',
    isWarm
      ? 'text-casa-text-tertiary hover:text-casa-navy hover:bg-black/5'
      : 'text-white/60 hover:text-white hover:bg-white/10',
  )

  return (
    <div
      className={cn(
        'inline-flex items-center p-0.5 rounded-full border gap-0.5',
        isWarm
          ? 'bg-casa-surface/40 border-casa-border/40'
          : 'bg-white/5 border-white/10',
      )}
    >
      {/* Refresh Screen */}
      <IconButton
        icon={<RefreshCw size={14} strokeWidth={1.8} />}
        aria-label="Refresh Screen"
        onClick={() => window.location.reload()}
        title="Refresh Screen"
        size="sm"
        variant="ghost"
        className={iconCn}
      />

      {/* Art Mode / Screensaver */}
      <IconButton
        icon={<ImageIcon size={14} strokeWidth={1.8} />}
        aria-label="Open Art Mode"
        onClick={() =>
          document.dispatchEvent(new CustomEvent('screensaver-on'))
        }
        title="Art Mode Screensaver"
        size="sm"
        variant="ghost"
        className={iconCn}
      />
    </div>
  )
}

// ── Zone F: AI Copilot Action ────────────────────────────────────
function CopilotAction() {
  const { aiDrawerOpen, setAiDrawerOpen } = useAppStore()
  const btnRef = useRef<HTMLButtonElement>(null)

  return (
    <motion.button
      ref={btnRef}
      onClick={() => {
        if (aiDrawerOpen) {
          setAiDrawerOpen(false)
        } else {
          const rect = btnRef.current?.getBoundingClientRect()
          document.dispatchEvent(
            new CustomEvent('open-ai-chat', {
              detail: rect
                ? { right: window.innerWidth - rect.right, top: rect.bottom }
                : undefined,
            }),
          )
        }
      }}
      animate={{
        boxShadow: aiDrawerOpen
          ? '0 0 16px rgba(201,169,110,0.6)'
          : [
              '0 0 5px rgba(201,169,110,0.18)',
              '0 0 12px rgba(201,169,110,0.38)',
              '0 0 5px rgba(201,169,110,0.18)',
            ],
      }}
      transition={{
        duration: 3.4,
        repeat: aiDrawerOpen ? 0 : Infinity,
        ease: 'easeInOut',
      }}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-full transition-all font-bold text-caption leading-none tracking-[0.03em]',
        aiDrawerOpen
          ? 'bg-casa-gold text-casa-navy ring-2 ring-casa-gold/80 shadow-xs'
          : 'bg-casa-gold text-casa-navy hover:bg-amber-400 shadow-2xs',
      )}
      title={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
      aria-label={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
      aria-expanded={aiDrawerOpen}
    >
      <Sparkles size={14} strokeWidth={2.2} className="shrink-0" />
      <span className="hidden sm:inline leading-none">
        {aiDrawerOpen ? 'Close' : 'Copilot'}
      </span>
    </motion.button>
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
  const isHome = location.pathname === '/'
  const isWarm = isCalm // Warm material when in calm mode

  return (
    <header
      className={cn(
        'app-topbar w-full flex items-center justify-between flex-shrink-0 z-sticky transition-all duration-300',
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

        {/* Mode Switcher — renders AFTER nav rail */}
        {isCanvas && isHome && (
          <>
            <span className="topbar-gold-divider hidden lg:block" />
            <ModeSwitch isWarm={isWarm} />
          </>
        )}
      </div>

      {/* ── Right cluster: Info + Utility + AI ──────────── */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <AmbientInfo isWarm={isWarm} showEvents={!isCanvas} />

        <span className="topbar-gold-divider hidden lg:block" />

        <UtilityTrack isWarm={isWarm} isCanvas={isCanvas} />

        <span className="topbar-gold-divider hidden sm:block" />

        <CopilotAction />
      </div>
    </header>
  )
}

