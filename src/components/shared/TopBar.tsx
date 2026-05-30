import { useMemo } from 'react'
import { format, isAfter, isBefore } from 'date-fns'
import { Cloud, Sparkles } from 'lucide-react'
import { motion } from 'framer-motion'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import { cn } from '../../utils/cn'

/** Full-width Command Bar — CT logo · current events center · weather + clock + AI right */
export function TopBarC() {
  const now = useLiveClock(10_000)
  const { data: weather } = useHomeWeather()
  const { data: todayEvents = [] } = useTodayEvents(now)

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
      className="w-full flex items-center gap-4 px-4 h-12 flex-shrink-0 z-40"
      style={{ backgroundColor: 'var(--color-casa-navy, #1E1A14)' }}
    >
      {/* ── Left: brand ─────────────────────────────── */}
      <div className="flex items-center gap-2.5 flex-shrink-0">
        <span className="w-8 h-8 rounded-lg bg-casa-gold flex items-center justify-center text-[11px] font-bold text-white flex-shrink-0">
          CT
        </span>
        <span className="font-display text-heading text-white hidden sm:block tracking-wide">
          Casa Tabor
        </span>
      </div>

      {/* ── Center: current / next events ────────────── */}
      <div className="flex-1 flex items-center justify-center gap-2 min-w-0 overflow-hidden">
        {displayEvents.length > 0 ? (
          <>
            {isNow && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-white/50 uppercase tracking-wider flex-shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Now
              </span>
            )}
            {!isNow && nextEvent && (
              <span className="text-[10px] font-semibold text-white/40 uppercase tracking-wider flex-shrink-0">
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
                    <span className="text-[12px] text-white truncate">{ev.title}</span>
                  </div>
                )
              })}
              {displayEvents.length > 3 && (
                <span className="text-[11px] text-white/40 flex-shrink-0">+{displayEvents.length - 3}</span>
              )}
            </div>
          </>
        ) : (
          <span className="text-[12px] text-white/30">All clear</span>
        )}
      </div>

      {/* ── Right: weather · clock · AI ─────────────── */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {weather && (
          <div className="hidden sm:flex items-center gap-1.5 text-[12px] text-white/70">
            <Cloud size={13} className="text-white/40" />
            <span>{weather.temp}°</span>
            <span className="text-white/40 hidden md:inline ml-1">{weather.city}</span>
          </div>
        )}

        <div className="font-mono text-[15px] font-semibold text-white tabular-nums">
          {format(now, 'h:mm')}
          <span className="text-[11px] text-white/50 ml-0.5">{format(now, 'a')}</span>
        </div>

        {/* AI button with subtle breathing ring */}
        <motion.button
          onClick={() => document.dispatchEvent(new CustomEvent('open-ai-chat'))}
          animate={{
            boxShadow: [
              '0 0 0 0px rgba(201,169,110,0.5), 0 0 6px rgba(201,169,110,0.3)',
              '0 0 0 4px rgba(201,169,110,0.0), 0 0 8px rgba(201,169,110,0.4)',
              '0 0 0 0px rgba(201,169,110,0.5), 0 0 6px rgba(201,169,110,0.3)',
            ],
          }}
          transition={{ duration: 2.8, repeat: Infinity, ease: 'easeInOut' }}
          className={cn(
            'w-8 h-8 rounded-lg flex items-center justify-center transition-colors',
            'bg-casa-gold/20 hover:bg-casa-gold/40 text-casa-gold',
          )}
          title="Ask AI"
        >
          <Sparkles size={15} strokeWidth={1.8} />
        </motion.button>
      </div>
    </header>
  )
}

export function TopBarA() { return <TopBarC /> }
export function TopBarB() { return <TopBarC /> }
