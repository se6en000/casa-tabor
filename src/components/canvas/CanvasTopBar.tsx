import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { Cloud, Sparkles, ImageIcon, RefreshCw, LayoutGrid, Zap, Leaf } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { cn } from '../../utils/cn'
import { IconButton, Button } from '../ui'
import { useAppStore } from '../../stores/appStore'

export default function CanvasTopBar() {
  const {
    aiDrawerOpen,
    setAiDrawerOpen,
    canvasSubmode,
    setCanvasSubmode,
    setExperienceMode,
  } = useAppStore()

  const location = useLocation()
  const now = useLiveClock(10_000)
  const { data: weather } = useHomeWeather()
  const btnRef = useRef<HTMLButtonElement>(null)

  const isHome = location.pathname === '/'
  const isCalm = canvasSubmode === 'calm'

  return (
    <header
      className={cn(
        'app-topbar w-full h-14 flex items-center justify-between flex-shrink-0 z-sticky backdrop-blur-md px-4 transition-colors duration-300 shadow-xs',
        isCalm
          ? 'bg-casa-bg/95 border-b border-casa-border/60 text-casa-navy'
          : 'bg-casa-navy/95 border-b border-white/10 text-white'
      )}
    >
      {/* ── Left: Brand & Ambient / Turbo Pill ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <NavLink to="/" className="inline-flex items-center gap-2.5 group h-9">
          <span className="w-8 h-8 rounded-xl bg-casa-gold inline-flex items-center justify-center text-caption font-bold text-casa-navy flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform leading-none">
            CT
          </span>
          <span
            className={cn(
              'font-display text-heading hidden sm:inline-block tracking-wide leading-none',
              isCalm ? 'text-casa-navy' : 'text-white'
            )}
          >
            Casa Tabor
          </span>
        </NavLink>

        {/* Calm / Turbo Mode Segmented Pill (only visible on Home) */}
        {isHome && (
          <div
            className={cn(
              'inline-flex items-center p-0.5 rounded-xl border gap-0.5',
              isCalm ? 'bg-casa-surface border-casa-border' : 'bg-white/10 border-white/10'
            )}
          >
            <Button
              variant={canvasSubmode === 'calm' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCanvasSubmode('calm')}
              className={cn(
                'px-3 min-h-[34px] rounded-lg text-caption font-semibold transition-all leading-none',
                canvasSubmode === 'calm'
                  ? 'bg-casa-gold text-casa-navy shadow-sm font-bold'
                  : isCalm
                  ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              <Leaf size={13} strokeWidth={2.2} />
              <span>Calm</span>
            </Button>
            <Button
              variant={canvasSubmode === 'turbo' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCanvasSubmode('turbo')}
              className={cn(
                'px-3 min-h-[34px] rounded-lg text-caption font-semibold transition-all leading-none',
                canvasSubmode === 'turbo'
                  ? 'bg-amber-400 text-casa-navy shadow-sm font-bold'
                  : isCalm
                  ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                  : 'text-white/60 hover:text-white hover:bg-white/5'
              )}
            >
              <Zap size={13} strokeWidth={2.2} />
              <span>Turbo</span>
            </Button>
          </div>
        )}
      </div>

      {/* ── Center: Workspace Tabs ── */}
      <nav
        className={cn(
          'hidden md:inline-flex items-center gap-1 p-1 rounded-2xl border',
          isCalm ? 'bg-casa-surface/80 border-casa-border/60' : 'bg-white/5 border-white/10'
        )}
      >
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-4 min-h-[34px] inline-flex items-center justify-center rounded-xl text-body-sm font-medium transition-all leading-none',
              isActive
                ? isCalm
                  ? 'bg-casa-navy text-white shadow-sm font-semibold'
                  : 'bg-white/15 text-white shadow-sm font-semibold'
                : isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )
          }
        >
          Living Canvas
        </NavLink>
        <NavLink
          to="/calendar"
          className={({ isActive }) =>
            cn(
              'px-4 min-h-[34px] inline-flex items-center justify-center rounded-xl text-body-sm font-medium transition-all leading-none',
              isActive
                ? isCalm
                  ? 'bg-casa-navy text-white shadow-sm font-semibold'
                  : 'bg-white/15 text-white shadow-sm font-semibold'
                : isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )
          }
        >
          Calendar
        </NavLink>
        <NavLink
          to="/cook"
          className={({ isActive }) =>
            cn(
              'px-4 min-h-[34px] inline-flex items-center justify-center rounded-xl text-body-sm font-medium transition-all leading-none',
              isActive
                ? isCalm
                  ? 'bg-casa-navy text-white shadow-sm font-semibold'
                  : 'bg-white/15 text-white shadow-sm font-semibold'
                : isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )
          }
        >
          Meals & Kitchen
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'px-4 min-h-[34px] inline-flex items-center justify-center rounded-xl text-body-sm font-medium transition-all leading-none',
              isActive
                ? isCalm
                  ? 'bg-casa-navy text-white shadow-sm font-semibold'
                  : 'bg-white/15 text-white shadow-sm font-semibold'
                : isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-casa-border/30'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )
          }
        >
          Settings
        </NavLink>
      </nav>

      {/* ── Right: Weather · Clock · Dev Switcher · Art · AI Sidecar ── */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {weather && (
          <div
            className={cn(
              'hidden lg:inline-flex items-center gap-1.5 text-caption px-2.5 min-h-[34px] rounded-xl border leading-none',
              isCalm
                ? 'text-casa-navy bg-casa-surface border-casa-border'
                : 'text-white/80 bg-white/5 border-white/10'
            )}
          >
            <Cloud size={13} className="text-casa-gold shrink-0" />
            <span className="font-semibold leading-none">{weather.temp}°</span>
            <span className={cn('leading-none', isCalm ? 'text-casa-muted' : 'text-white/40')}>
              {weather.city}
            </span>
          </div>
        )}

        {/* Ambient Clock */}
        <div
          className={cn(
            'inline-flex items-center font-mono text-body-sm font-semibold tabular-nums px-2.5 min-h-[34px] rounded-xl border leading-none',
            isCalm
              ? 'text-casa-navy bg-casa-surface border-casa-border'
              : 'text-white bg-white/5 border-white/10'
          )}
        >
          <span className="leading-none">{format(now, 'h:mm')}</span>
          <span
            className={cn('text-caption ml-1 leading-none', isCalm ? 'text-casa-muted' : 'text-white/50')}
          >
            {format(now, 'a')}
          </span>
        </div>

        {/* Quick Dev Switcher to Classic Mode */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExperienceMode('classic')}
          aria-label="Switch to Classic Mode"
          className={cn(
            'hidden xl:inline-flex items-center gap-1.5 px-3 min-h-[34px] rounded-xl text-caption font-medium border transition-colors leading-none',
            isCalm
              ? 'bg-casa-surface text-casa-muted hover:bg-casa-border/40 hover:text-casa-navy border-casa-border'
              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white border-white/10'
          )}
        >
          <LayoutGrid size={13} className="shrink-0" />
          <span>Classic</span>
        </Button>

        {/* Refresh button */}
        <IconButton
          icon={<RefreshCw size={15} strokeWidth={1.8} />}
          aria-label="Refresh screen"
          onClick={() => window.location.reload()}
          title="Refresh screen"
          size="sm"
          className={cn(
            'min-h-[34px] min-w-[34px]',
            isCalm
              ? 'bg-casa-surface text-casa-muted hover:bg-casa-border/40 hover:text-casa-navy border border-casa-border'
              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
          )}
        />

        {/* Art Mode button */}
        <IconButton
          icon={<ImageIcon size={15} strokeWidth={1.8} />}
          aria-label="Open Art Mode"
          onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
          title="Art Mode"
          size="sm"
          className={cn(
            'min-h-[34px] min-w-[34px]',
            isCalm
              ? 'bg-casa-surface text-casa-muted hover:bg-casa-border/40 hover:text-casa-navy border border-casa-border'
              : 'bg-white/10 text-white/70 hover:bg-white/20 hover:text-white'
          )}
        />

        {/* AI Copilot Sidecar Button */}
        <motion.button
          ref={btnRef}
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
          animate={{
            boxShadow: aiDrawerOpen
              ? '0 0 16px rgba(201,169,110,0.6)'
              : [
                  '0 0 5px rgba(201,169,110,0.2)',
                  '0 0 10px rgba(201,169,110,0.35)',
                  '0 0 5px rgba(201,169,110,0.2)',
                ],
          }}
          transition={{ duration: 3.4, repeat: aiDrawerOpen ? 0 : Infinity, ease: 'easeInOut' }}
          className={cn(
            'inline-flex items-center justify-center gap-2 px-3.5 min-h-[34px] rounded-xl transition-all font-semibold text-caption leading-none',
            aiDrawerOpen
              ? 'bg-casa-gold text-casa-navy ring-2 ring-casa-gold/80 shadow-md'
              : 'bg-casa-gold/20 hover:bg-casa-gold/30 text-casa-gold border border-casa-gold/30'
          )}
          title={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
          aria-label={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
        >
          <Sparkles size={15} strokeWidth={2.2} className="shrink-0" />
          <span className="hidden sm:inline leading-none">Copilot</span>
        </motion.button>
      </div>
    </header>
  )
}

