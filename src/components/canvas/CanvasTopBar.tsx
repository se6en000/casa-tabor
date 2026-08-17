import { useMemo, useRef } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { Cloud, Settings, Bell } from 'lucide-react'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { clusterPrepItems } from '../../utils/prepItemClusters'
import { cn } from '../../utils/cn'
import { IconButton, JewelCapsuleCopilot } from '../ui'
import { useAppStore } from '../../stores/appStore'

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

  const activeConflicts = useMemo(() => conflicts.filter((c) => !c.resolved), [conflicts])
  const activePrep = useMemo(() => prepItems.filter((p) => !p.dismissed), [prepItems])
  const clusteredPrep = useMemo(() => clusterPrepItems(activePrep), [activePrep])
  const totalAttentionCount = activeConflicts.length + clusteredPrep.length

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
          className="inline-flex items-center gap-2.5 group h-9"
        >
          <span className="w-8 h-8 rounded-full bg-casa-gold/15 text-casa-gold border border-casa-gold/30 inline-flex items-center justify-center font-sans text-caption font-bold flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform leading-none">
            CT
          </span>
          <span
            className={cn(
              'font-display text-heading hidden sm:inline-block tracking-[0.03em] font-semibold leading-none',
              isCalm ? 'text-casa-navy' : 'text-white'
            )}
          >
            Casa Tabor
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
