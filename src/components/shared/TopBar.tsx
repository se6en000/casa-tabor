import { useMemo, useRef } from 'react'
import { format, isAfter, isBefore } from 'date-fns'
import { Cloud, Sparkles, ImageIcon, Mic, RefreshCw, LogOut, UserRound } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLiveClock, greetingFor } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'
import { IconButton } from '../ui'
import { useProfileSession } from '../../contexts/ProfileSessionContext'
import { useAppStore } from '../../stores/appStore'

/** Full-width Command Bar — CT logo · current events center · weather + clock + AI right */
export function TopBarC() {
  const { aiDrawerOpen, setAiDrawerOpen } = useAppStore()
  const { profile, signOut } = useProfileSession()
  const now = useLiveClock(10_000)
  const { data: weather } = useHomeWeather()
  const { data: todayEvents = [], isLoading: eventsLoading } = useTodayEvents(now)

  const happeningNow = useMemo(() =>
    todayEvents.filter(e =>
      isBefore(new Date(e.start_time), now) && isAfter(new Date(e.end_time), now)
    )
  , [todayEvents, now])

  const nextEvent = useMemo(() =>
    happeningNow.length === 0
      ? todayEvents
          .filter(e => isAfter(new Date(e.start_time), now))
          .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]
      : null
  , [happeningNow, todayEvents, now])

  const displayEvents = happeningNow.length > 0 ? happeningNow : nextEvent ? [nextEvent] : []
  const isNow = happeningNow.length > 0

  return (
    <header
      className="app-topbar w-full flex items-center flex-shrink-0 z-sticky bg-casa-navy"
    >
      {/* ── Left: brand + greeting ──────────────────────── */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="maison-seal w-8 h-8 rounded-full flex items-center justify-center font-display text-sm font-bold text-casa-gold flex-shrink-0">
          <span className="maison-seal-letter text-sm font-serif">T</span>
        </span>
        <span className="maison-brand-title text-heading text-white hidden sm:block font-display font-bold tracking-[0.06em]">
          Maison <span className="text-casa-gold font-normal">Tabor</span>
        </span>
        {/* Greeting + date — shown when there's enough width */}
        <div className="hidden md:flex flex-col justify-center ml-1 border-l border-white/15 pl-3">
          <span className="text-body-sm font-semibold text-white/90 leading-tight">{greetingFor(now)}</span>
          <span className="text-caption text-white/45 leading-tight">{format(now, 'EEEE, MMMM d')}</span>
        </div>
      </div>

      {/* ── Center: current / next events ────────────── */}
      <div className="app-topbar-events flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
        {eventsLoading && todayEvents.length === 0 ? (
          <span className="flex items-center gap-1.5 text-caption font-medium text-white/50 animate-pulse">
            <span className="w-1.5 h-1.5 rounded-full bg-casa-gold" />
            Syncing schedule...
          </span>
        ) : displayEvents.length > 0 ? (
          <>
            {isNow && (
              <span className="flex items-center gap-1 text-caption font-semibold text-white/50 uppercase tracking-wider flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Now
              </span>
            )}
            {!isNow && nextEvent && (
              <span className="text-caption font-semibold text-white/40 uppercase tracking-wider flex-shrink-0">
                Next &middot;{' '}
                {(() => {
                  const mins = Math.round((new Date(nextEvent.start_time).getTime() - now.getTime()) / 60000)
                  return mins < 60 ? `in ${mins}m` : format(new Date(nextEvent.start_time), 'h:mm a')
                })()}
              </span>
            )}
            <div className="flex items-center gap-2 min-w-0 overflow-hidden">
              {displayEvents.slice(0, 3).map((ev) => {
                const color = ev.members?.[0]?.family_member?.color_hex
                return (
                  <div
                    key={ev.id}
                    className="flex items-center gap-1.5 bg-white/10 rounded-full px-3 py-1 min-w-0 max-w-[220px]"
                  >
                    {color && <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />}
                    <span className="text-caption text-white truncate">{ev.title.includes(' | ') ? ev.title.split(' | ').slice(1).join(' | ') : ev.title}</span>
                  </div>
                )
              })}
              {displayEvents.length > 3 && (
                <span className="text-caption text-white/40 flex-shrink-0">+{displayEvents.length - 3}</span>
              )}
            </div>
          </>
        ) : (
          <span className="text-caption text-white/30">All clear</span>
        )}
      </div>

      {/* ── Right: weather · clock · AI ─────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {weather && (
          <div className="hidden sm:flex items-center gap-1.5 text-caption text-white/70">
            <Cloud size={13} className="text-white/40" />
            <span>{weather.temp}°</span>
            <span className="text-white/40 hidden md:inline ml-1">{weather.city}</span>
          </div>
        )}

        <div className="font-mono text-body font-semibold text-white tabular-nums">
          {format(now, 'h:mm')}
          <span className="text-caption text-white/50 ml-0.5">{format(now, 'a')}</span>
        </div>

        {profile && (
          <>
            <div className="hidden lg:flex items-center gap-1.5 text-caption text-white/70">
              <UserRound size={14} aria-hidden="true" />
              <span>{profile.memberName}</span>
            </div>
            <IconButton
              icon={<LogOut size={16} strokeWidth={1.8} />}
              aria-label={`Sign out ${profile.memberName}`}
              onClick={signOut}
              title={`Sign out ${profile.memberName}`}
              size="sm"
              className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            />
          </>
        )}

        {/* Refresh button — reloads the kiosk/browser in place */}
        <IconButton
          icon={<RefreshCw size={16} strokeWidth={1.8} />}
          aria-label="Refresh screen"
          onClick={() => window.location.reload()}
          title="Refresh screen"
          size="sm"
          className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
        />

        {/* Art Mode button */}
        <IconButton
          icon={<ImageIcon size={16} strokeWidth={1.8} />}
          aria-label="Open Art Mode"
          onClick={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
          title="Art Mode"
          size="sm"
          className="bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
        />

        {/* AI button with subtle breathing ring */}
        {(() => {
          // eslint-disable-next-line react-hooks/rules-of-hooks
          const btnRef = useRef<HTMLButtonElement>(null)
          return (
            <motion.button
              ref={btnRef}
              onClick={() => {
                if (aiDrawerOpen) {
                  setAiDrawerOpen(false)
                } else {
                  const rect = btnRef.current?.getBoundingClientRect()
                  document.dispatchEvent(new CustomEvent('open-ai-chat', {
                    detail: rect ? { right: window.innerWidth - rect.right, top: rect.bottom } : undefined
                  }))
                }
              }}
              animate={{
                boxShadow: aiDrawerOpen
                  ? '0 0 12px rgba(201,169,110,0.5)'
                  : [
                      '0 0 5px rgba(201,169,110,0.18)',
                      '0 0 9px rgba(201,169,110,0.32)',
                      '0 0 5px rgba(201,169,110,0.18)',
                    ],
              }}
              transition={{ duration: 3.4, repeat: aiDrawerOpen ? 0 : Infinity, ease: 'easeInOut' }}
              className={cn(
                'relative size-control-sm rounded-lg flex items-center justify-center transition-colors',
                aiDrawerOpen
                  ? 'bg-casa-gold text-casa-navy font-bold ring-2 ring-casa-gold/60'
                  : 'bg-casa-gold/15 hover:bg-casa-gold/30 text-casa-gold',
              )}
              title={aiDrawerOpen ? 'Close Copilot' : 'Talk to Copilot'}
              aria-label={aiDrawerOpen ? 'Close Copilot' : 'Talk to Copilot'}
              aria-expanded={aiDrawerOpen}
            >
              <Sparkles size={15} strokeWidth={aiDrawerOpen ? 2.2 : 1.8} />
              <span className={cn(
                'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ring-2 ring-casa-navy',
                aiDrawerOpen ? 'bg-casa-navy text-white' : 'bg-casa-gold text-casa-navy',
              )}>
                <Mic size={7} strokeWidth={2.5} />
              </span>
            </motion.button>
          )
        })()}
      </div>
    </header>
  )
}

export function TopBarA() { return <TopBarC /> }
export function TopBarB() { return <TopBarC /> }
