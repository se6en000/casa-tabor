import { useRef } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { format } from 'date-fns'
import { Cloud, Sparkles, ImageIcon, RefreshCw, Zap, Leaf } from 'lucide-react'
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
        'app-topbar w-full h-14 flex items-center justify-between flex-shrink-0 z-sticky backdrop-blur-md px-4 sm:px-6 transition-colors duration-300',
        isCalm
          ? 'bg-casa-bg/90 border-b border-casa-border/40 text-casa-navy'
          : 'bg-casa-navy/95 border-b border-white/10 text-white'
      )}
    >
      {/* ── Left: Refined Luxury Brand Monogram ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        <NavLink to="/" className="inline-flex items-center gap-2.5 group h-9">
          <span className="w-8 h-8 rounded-full bg-casa-gold/15 text-casa-gold border border-casa-gold/30 inline-flex items-center justify-center text-caption font-bold flex-shrink-0 shadow-2xs group-hover:scale-105 transition-transform leading-none">
            CT
          </span>
          <span
            className={cn(
              'font-display text-heading hidden sm:inline-block tracking-tight font-semibold leading-none',
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
          'hidden md:inline-flex items-center gap-1 p-1 rounded-full border',
          isCalm
            ? 'bg-casa-surface/60 border-casa-border/50 shadow-2xs'
            : 'bg-white/5 border-white/10'
        )}
      >
        {[
          { path: '/', label: 'Living Canvas' },
          { path: '/calendar', label: 'Calendar' },
          { path: '/cook', label: 'Meals & Kitchen' },
          { path: '/settings', label: 'Settings' },
        ].map((tab) => (
          <NavLink
            key={tab.path}
            to={tab.path}
            end={tab.path === '/'}
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

      {/* ── Right: Mode Switcher · Weather/Clock · Actions · Copilot ── */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        {/* Calm / Turbo Mode Switcher (Sleek single container on Home view) */}
        {isHome && (
          <div
            className={cn(
              'inline-flex items-center p-0.5 rounded-full border gap-0.5',
              isCalm ? 'bg-casa-surface/60 border-casa-border/50' : 'bg-white/5 border-white/10'
            )}
          >
            <Button
              variant={canvasSubmode === 'calm' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCanvasSubmode('calm')}
              className={cn(
                'px-3 min-h-[30px] rounded-full text-caption font-semibold transition-all leading-none',
                canvasSubmode === 'calm'
                  ? 'bg-casa-gold text-casa-navy shadow-2xs font-bold'
                  : isCalm
                  ? 'text-casa-muted hover:text-casa-navy'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <Leaf size={12} strokeWidth={2.2} />
              <span>Calm</span>
            </Button>
            <Button
              variant={canvasSubmode === 'turbo' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCanvasSubmode('turbo')}
              className={cn(
                'px-3 min-h-[30px] rounded-full text-caption font-semibold transition-all leading-none',
                canvasSubmode === 'turbo'
                  ? 'bg-amber-400 text-casa-navy shadow-2xs font-bold'
                  : isCalm
                  ? 'text-casa-muted hover:text-casa-navy'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <Zap size={12} strokeWidth={2.2} />
              <span>Turbo</span>
            </Button>
          </div>
        )}

        {/* Ambient Info: Show weather & time on non-home pages to avoid duplicating home kiosk info */}
        {!isHome && (
          <div className="hidden lg:flex items-center gap-2 text-caption font-mono text-casa-muted">
            {weather && (
              <span className="inline-flex items-center gap-1">
                <Cloud size={13} className="text-casa-gold" />
                {weather.temp}° {weather.city}
              </span>
            )}
            <span>·</span>
            <span>{format(now, 'h:mm a')}</span>
          </div>
        )}

        {/* Unified Utility Action Track */}
        <div
          className={cn(
            'inline-flex items-center p-0.5 rounded-full border gap-1',
            isCalm ? 'bg-casa-surface/40 border-casa-border/40' : 'bg-white/5 border-white/10'
          )}
        >
          <IconButton
            icon={<RefreshCw size={14} strokeWidth={2} />}
            aria-label="Refresh screen"
            onClick={() => window.location.reload()}
            title="Refresh screen"
            size="sm"
            variant="ghost"
            className={cn(
              'rounded-full w-8 h-8 flex items-center justify-center',
              isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-black/5'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          />

          <IconButton
            icon={<ImageIcon size={14} strokeWidth={2} />}
            aria-label="Open Art Mode"
            onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
            title="Art Mode"
            size="sm"
            variant="ghost"
            className={cn(
              'rounded-full w-8 h-8 flex items-center justify-center',
              isCalm
                ? 'text-casa-muted hover:text-casa-navy hover:bg-black/5'
                : 'text-white/70 hover:text-white hover:bg-white/10'
            )}
          />
        </div>

        {/* AI Copilot Primary Action */}
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
            'inline-flex items-center justify-center gap-1.5 px-3.5 min-h-[32px] rounded-full transition-all font-semibold text-caption leading-none',
            aiDrawerOpen
              ? 'bg-casa-gold text-casa-navy ring-2 ring-casa-gold/80 shadow-xs'
              : 'bg-casa-gold text-casa-navy hover:bg-amber-400 shadow-2xs'
          )}
          title={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
          aria-label={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
        >
          <Sparkles size={14} strokeWidth={2.2} className="shrink-0" />
          <span className="hidden sm:inline leading-none">Copilot</span>
        </motion.button>
      </div>
    </header>
  )
}
