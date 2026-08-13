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

  return (
    <header className="app-topbar w-full flex items-center justify-between flex-shrink-0 z-sticky bg-casa-navy px-4 py-2.5 shadow-md">
      {/* ── Left: Brand & Ambient / Turbo Pill ── */}
      <div className="flex items-center gap-3.5 flex-shrink-0">
        <NavLink to="/" className="flex items-center gap-2.5 group">
          <span className="w-8 h-8 rounded-xl bg-casa-gold flex items-center justify-center text-caption font-bold text-casa-navy flex-shrink-0 shadow-sm group-hover:scale-105 transition-transform">
            CT
          </span>
          <span className="font-display text-heading text-white hidden sm:block tracking-wide">
            Casa Tabor
          </span>
        </NavLink>

        {/* Calm / Turbo Mode Segmented Pill (only visible on Home) */}
        {isHome && (
          <div className="flex items-center bg-white/10 p-0.5 rounded-xl border border-white/10 gap-0.5">
            <Button
              variant={canvasSubmode === 'calm' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setCanvasSubmode('calm')}
              className={cn(
                'min-h-[32px] px-3 py-1 rounded-lg text-caption font-semibold transition-all',
                canvasSubmode === 'calm'
                  ? 'bg-casa-gold text-casa-navy shadow-sm'
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
                'min-h-[32px] px-3 py-1 rounded-lg text-caption font-semibold transition-all',
                canvasSubmode === 'turbo'
                  ? 'bg-amber-400 text-casa-navy shadow-sm font-bold'
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
      <nav className="hidden md:flex items-center gap-1 bg-white/5 p-1 rounded-2xl border border-white/10">
        <NavLink
          to="/"
          end
          className={({ isActive }) =>
            cn(
              'px-4 py-1.5 rounded-xl text-body-sm font-medium transition-all',
              isActive
                ? 'bg-white/15 text-white shadow-sm'
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
              'px-4 py-1.5 rounded-xl text-body-sm font-medium transition-all',
              isActive
                ? 'bg-white/15 text-white shadow-sm'
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
              'px-4 py-1.5 rounded-xl text-body-sm font-medium transition-all',
              isActive
                ? 'bg-white/15 text-white shadow-sm'
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
              'px-4 py-1.5 rounded-xl text-body-sm font-medium transition-all',
              isActive
                ? 'bg-white/15 text-white shadow-sm'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            )
          }
        >
          Settings
        </NavLink>
      </nav>

      {/* ── Right: Weather · Clock · Dev Switcher · Art · AI Sidecar ── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {weather && (
          <div className="hidden lg:flex items-center gap-1.5 text-caption text-white/70 bg-white/5 px-2.5 py-1 rounded-xl border border-white/10">
            <Cloud size={13} className="text-casa-gold" />
            <span>{weather.temp}°</span>
            <span className="text-white/40">{weather.city}</span>
          </div>
        )}

        {/* Ambient Clock */}
        <div className="font-mono text-body-sm font-semibold text-white tabular-nums bg-white/5 px-2.5 py-1 rounded-xl border border-white/10">
          {format(now, 'h:mm')}
          <span className="text-caption text-white/50 ml-0.5">{format(now, 'a')}</span>
        </div>

        {/* Quick Dev Switcher to Classic Mode */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setExperienceMode('classic')}
          aria-label="Switch to Classic Mode"
          className="hidden xl:flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 hover:text-white text-caption font-medium border border-white/10 transition-colors min-h-[32px]"
        >
          <LayoutGrid size={13} />
          <span>Classic</span>
        </Button>

        {/* Refresh button */}
        <IconButton
          icon={<RefreshCw size={15} strokeWidth={1.8} />}
          aria-label="Refresh screen"
          onClick={() => window.location.reload()}
          title="Refresh screen"
          size="sm"
          className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
        />

        {/* Art Mode button */}
        <IconButton
          icon={<ImageIcon size={15} strokeWidth={1.8} />}
          aria-label="Open Art Mode"
          onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
          title="Art Mode"
          size="sm"
          className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
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
            'flex items-center gap-2 px-3 py-1.5 rounded-xl transition-all font-semibold text-caption',
            aiDrawerOpen
              ? 'bg-casa-gold text-casa-navy ring-2 ring-casa-gold/80 shadow-md'
              : 'bg-casa-gold/20 hover:bg-casa-gold/30 text-casa-gold border border-casa-gold/30'
          )}
          title={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
          aria-label={aiDrawerOpen ? 'Close Copilot' : 'Open AI Copilot'}
        >
          <Sparkles size={15} strokeWidth={2.2} />
          <span className="hidden sm:inline">Copilot</span>
        </motion.button>
      </div>
    </header>
  )
}
