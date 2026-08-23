import { useMemo, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Cloud, Settings, Bell, RefreshCw } from 'lucide-react'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { useRollingEvents } from '../../hooks/useCalendarEvents'
import { useGoogleSyncTriage } from '../../hooks/useGoogleSyncTriage'
import { clusterPrepItems } from '../../utils/prepItemClusters'
import { splitActionableAndTransitItems } from '../../utils/needsYouFeed'
import { isItemAlreadyScheduled, isExpiredEventSuggestion } from '../../utils/calendarEventMatcher'
import { cn } from '../../utils/cn'
import { IconButton, JewelCapsuleCopilot } from '../ui'
import { useAppStore } from '../../stores/appStore'
import MaisonCrest from '../shared/MaisonCrest'

export default function CanvasTopBar() {
  const navigate = useNavigate()
  const {
    aiDrawerOpen,
    setAiDrawerOpen,
    canvasSubmode,
    setCanvasSubmode,
  } = useAppStore()

  const location = useLocation()
  const now = useLiveClock(10_000)
  const { data: weather } = useHomeWeather()
  const btnRef = useRef<HTMLButtonElement>(null)

  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { failedJobs } = useGoogleSyncTriage()

  const activeConflicts = useMemo(() => conflicts.filter((c) => !c.resolved), [conflicts])
  const activePrep = useMemo(() => prepItems.filter((p) => !p.dismissed), [prepItems])

  // Filter out items already on the calendar or expired event suggestions
  const unscheduledPrep = useMemo(() => {
    return activePrep.filter((p) => !isExpiredEventSuggestion(p, now) && !isItemAlreadyScheduled(p, rollingEvents))
  }, [activePrep, rollingEvents, now])

  // Pure actionable items (excluding passive in-transit delivery tracking)
  const { actionableItems } = useMemo(
    () => splitActionableAndTransitItems(unscheduledPrep),
    [unscheduledPrep]
  )

  const clusteredPrep = useMemo(() => clusterPrepItems(actionableItems), [actionableItems])
  const totalAttentionCount = activeConflicts.length + failedJobs.length + clusteredPrep.length

  const isHome = location.pathname === '/'
  const isCalm = canvasSubmode === 'calm'
  const isTriageActive = isHome && canvasSubmode === 'turbo'

  const handleTriageClick = () => {
    if (!isHome) {
      navigate('/')
      setCanvasSubmode('turbo')
    } else {
      setCanvasSubmode(canvasSubmode === 'turbo' ? 'calm' : 'turbo')
    }
  }

  return (
    <header
      className={cn(
        'app-topbar w-full h-14 flex items-center justify-between flex-shrink-0 z-sticky backdrop-blur-md px-4 sm:px-6 transition-colors duration-300 font-sans',
        isCalm
          ? 'bg-casa-bg/90 border-b border-casa-border/40 text-casa-navy'
          : 'bg-casa-navy/95 border-b border-white/10 text-white'
      )}
    >
      {/* ── Left: Refined Luxury Brand Monogram ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <NavLink
          to="/"
          onClick={() => setCanvasSubmode('calm')}
          className="inline-flex items-center gap-3 group h-10"
        >
          <MaisonCrest size={42} isWarm={isCalm} className="group-hover:scale-105" />
          <span
            className={cn(
              'maison-brand-title text-heading hidden sm:inline-block font-display font-bold tracking-[0.05em] leading-none',
              isCalm ? 'text-casa-navy' : 'text-white'
            )}
          >
            Maison <span className="text-casa-gold font-normal">Tabor</span>
          </span>
        </NavLink>
      </div>

      {/* ── Center: Workspace Navigation Track (Unified Glass Track) ── */}
      <nav
        className={cn(
          'hidden md:inline-flex items-center gap-1 p-1 rounded-full border font-sans',
          isCalm
            ? 'bg-casa-surface/60 border-casa-border/50 shadow-2xs'
            : 'bg-white/5 border-white/10'
        )}
      >
        {[
          { path: '/', label: 'Home' },
          { path: '/calendar', label: 'Calendar' },
          { path: '/cook', label: 'Meals & Kitchen' },
          { path: '/grocery', label: 'Grocery List' },
        ].map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
            onClick={() => {
              if (tab.path === '/') {
                setCanvasSubmode('calm')
              }
            }}
            className={({ isActive }) =>
              cn(
                'px-4 min-h-[32px] inline-flex items-center justify-center rounded-full text-body-sm font-medium transition-all leading-none',
                isActive
                  ? isCalm
                    ? 'bg-casa-navy text-white shadow-xs font-semibold'
                    : 'bg-white/20 text-white shadow-xs font-semibold'
                  : isCalm
                  ? 'text-casa-muted hover:text-casa-navy hover:bg-black/5'
                  : 'text-white/60 hover:text-white hover:bg-white/10'
              )
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>

      {/* ── Right: Weather/Clock · Actions · Copilot ── */}
      <div className="flex items-center gap-2.5 flex-shrink-0 font-sans">

        {/* Ambient Info: Show weather, date & time on non-home pages */}
        {!isHome && (
          <div className="hidden lg:flex items-center gap-2 text-caption font-sans font-medium text-casa-muted">
            {weather && (
              <>
                <span className="inline-flex items-center gap-1">
                  <Cloud size={13} className="text-casa-gold" />
                  <span className="tabular-nums font-semibold">{weather.temp}°</span> {weather.city}
                </span>
                <span>·</span>
              </>
            )}
            <span>{format(now, 'EEEE, MMMM d')}</span>
            <span>·</span>
            <span className="tabular-nums font-semibold">{format(now, 'h:mm a')}</span>
          </div>
        )}

        {/* Unified Utility Action Track (Streamlined) */}
        <div
          className={cn(
            'flex items-center gap-1 p-1 rounded-full border transition-all',
            isCalm
              ? 'bg-casa-surface/60 border-casa-border/50 shadow-2xs'
              : 'bg-white/[0.06] border-white/[0.12] shadow-2xs backdrop-blur-md'
          )}
        >
          {/* Refresh Page */}
          <IconButton
            icon={<RefreshCw size={19} strokeWidth={1.8} />}
            aria-label="Refresh Page"
            onClick={() => window.location.reload()}
            title="Refresh Page"
            variant="ghost"
            className={cn(
              'size-control rounded-full flex items-center justify-center transition-all duration-150',
              isCalm
                ? 'text-casa-text-secondary hover:text-casa-navy hover:bg-black/5 active:scale-95'
                : 'text-white/70 hover:text-white hover:bg-white/10 active:scale-95'
            )}
          />

          {/* Triage Bell with Luxury Complication Badge */}
          <div className="relative inline-flex items-center justify-center">
            <IconButton
              icon={<Bell size={19} strokeWidth={1.8} className={isTriageActive ? (isCalm ? 'text-amber-800' : 'text-casa-gold') : totalAttentionCount > 0 ? (isCalm ? 'text-amber-800' : 'text-casa-gold') : undefined} />}
              aria-label={totalAttentionCount > 0 ? `${totalAttentionCount} Triage Items` : 'Triage Items'}
              onClick={handleTriageClick}
              title={totalAttentionCount > 0 ? `${totalAttentionCount} Triage Items` : 'Triage Items'}
              variant="ghost"
              className={cn(
                'size-control rounded-full flex items-center justify-center transition-all duration-150',
                isCalm
                  ? 'text-casa-text-secondary hover:text-casa-navy hover:bg-black/5 active:scale-95'
                  : 'text-white/70 hover:text-white hover:bg-white/10 active:scale-95'
              )}
            />
            {totalAttentionCount > 0 && (
              <span
                className={cn(
                  'absolute bottom-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full font-sans font-bold text-2xs tabular-nums flex items-center justify-center leading-none pointer-events-none shadow-xs border',
                  isCalm
                    ? 'bg-casa-gold text-casa-navy border-casa-surface ring-1 ring-casa-gold/40'
                    : 'bg-casa-gold text-casa-navy border-casa-navy ring-1 ring-casa-gold/50'
                )}
              >
                {totalAttentionCount}
              </span>
            )}
          </div>

          <IconButton
            icon={<Settings size={19} strokeWidth={1.8} />}
            aria-label="Settings"
            onClick={() => navigate('/settings')}
            title="Settings"
            variant="ghost"
            className={cn(
              'size-control rounded-full flex items-center justify-center',
              location.pathname.startsWith('/settings')
                ? isCalm
                  ? 'bg-casa-navy/15 text-casa-navy'
                  : 'bg-white/25 text-white'
                : isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-black/5'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          />
        </div>

        {/* AI Copilot Primary Action */}
        <JewelCapsuleCopilot
          ref={btnRef}
          isActive={aiDrawerOpen}
          onClick={() => {
            if (aiDrawerOpen) {
              setAiDrawerOpen(false)
            } else {
              const rect = btnRef.current?.getBoundingClientRect()
              document.dispatchEvent(
                new CustomEvent('open-ai-chat', {
                  detail: rect ? { right: window.innerWidth - rect.right, top: rect.bottom } : undefined,
                })
              )
            }
          }}
        />
      </div>
    </header>
  )
}
