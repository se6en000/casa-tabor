import { NavLink, useNavigate } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { Home, Calendar, Sun, Music, Settings, Bell, Sparkles, Cloud } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { useCalendarStore } from '../../stores/calendarStore'
import { useNotifications } from '../../hooks/useNotifications'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import NotificationDrawer from '../shared/NotificationDrawer'
import { useState, useMemo } from 'react'

const NAV = [
  { to: '/',          icon: Home,     label: 'Home' },
  { to: '/calendar',  icon: Calendar, label: 'Calendar' },
  { to: '/briefing',  icon: Sun,      label: 'Briefing' },
  { to: '/music',     icon: Music,    label: 'Music' },
  { to: '/settings',  icon: Settings, label: 'Settings' },
]

export default function TabletSidebar() {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { data: weather } = useHomeWeather()
  const { visibleMembers, toggleMember } = useCalendarStore()
  const { unreadCount } = useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()
  const { data: todayEvents } = useTodayEvents(now)

  // Infer status per family member
  const whoStatus = useMemo(() => {
    if (!family || !todayEvents) return []
    return family.map(m => {
      const mine = todayEvents.filter(e => e.members?.some(em => em.family_member.id === m.id))
      const activeNow = mine.find(e => isBefore(new Date(e.start_time), now) && isAfter(new Date(e.end_time), now))
      const nextUp = mine
        .filter(e => isAfter(new Date(e.start_time), now))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]
      return { member: m, activeNow, nextUp }
    })
  }, [family, todayEvents, now])

  return (
    <>
      <aside className="hidden lg:flex w-72 flex-shrink-0 bg-casa-surface border-r border-casa-border flex-col h-screen sticky top-0 overflow-y-auto z-30">

        {/* Brand + clock */}
        <div className="px-6 pt-8 pb-6 border-b border-casa-border">
          <button
            onClick={() => navigate('/')}
            className="font-display text-display-md text-casa-navy leading-none hover:text-casa-gold transition-colors"
          >
            Casa Tabor
          </button>
          <div className="font-mono text-display-lg text-casa-navy mt-2 tabular-nums leading-none">
            {format(now, 'h:mm')}
            <span className="text-heading ml-1.5 text-casa-muted">{format(now, 'a')}</span>
          </div>
          <div className="text-caption text-casa-muted mt-1">{format(now, 'EEEE, MMMM d')}</div>
          {weather && (
            <div className="flex items-center gap-1.5 text-caption text-casa-muted mt-2">
              <Cloud size={12} />
              <span>{weather.temp}° · {weather.condition}</span>
            </div>
          )}
        </div>

        {/* Family — filter + who's home merged */}
        <div className="px-4 py-5 border-b border-casa-border">
          <p className="text-caption text-casa-muted uppercase tracking-wider mb-3 px-2">Family</p>
          <div className="flex flex-col gap-0.5">
            {family?.map(m => {
              const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
              const status = whoStatus.find(s => s.member.id === m.id)
              const busy = !!status?.activeNow
              const statusLabel = status?.activeNow
                ? status.activeNow.location_name
                  ? `Out · ${status.activeNow.location_name.split(' ').slice(0, 3).join(' ')}`
                  : `Busy until ${format(new Date(status.activeNow.end_time), 'h:mm a')}`
                : status?.nextUp
                  ? `Next: ${format(new Date(status.nextUp.start_time), 'h:mm a')}`
                  : 'Free today'

              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className={cn(
                    'flex items-center gap-3 px-2 py-2.5 rounded-xl transition-all text-left w-full',
                    active ? 'bg-casa-bg' : 'opacity-35 hover:opacity-60',
                  )}
                >
                  <span
                    className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-[11px] font-bold text-white"
                    style={{ backgroundColor: m.color_hex }}
                  >
                    {m.name[0]}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={cn('text-body font-medium leading-tight', active ? 'text-casa-navy' : 'text-casa-muted')}>
                      {m.name}
                    </p>
                    <p className="text-caption text-casa-muted truncate mt-0.5">{statusLabel}</p>
                  </div>
                  <span className={cn(
                    'w-2.5 h-2.5 rounded-full flex-shrink-0',
                    !active ? 'bg-casa-muted/30' : busy ? 'bg-amber-400' : 'bg-emerald-400',
                  )} />
                </button>
              )
            })}
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-4 py-4 flex flex-col gap-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-4 py-3 rounded-xl transition-colors text-body font-medium',
                  isActive
                    ? 'bg-casa-navy text-white'
                    : 'text-casa-muted hover:text-casa-navy hover:bg-casa-bg',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={19} strokeWidth={isActive ? 2 : 1.8} />
                  {label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Bottom: AI + notifications */}
        <div className="px-4 pb-6 pt-4 border-t border-casa-border flex flex-col gap-2">
          <button
            onClick={() => document.dispatchEvent(new CustomEvent('open-ai-chat'))}
            className="flex items-center gap-3 px-4 py-3 rounded-xl bg-casa-gold/10 hover:bg-casa-gold/20 text-casa-gold transition-colors text-body font-medium"
          >
            <Sparkles size={19} strokeWidth={1.8} />
            Ask AI
          </button>

          <button
            onClick={() => setNotifOpen(true)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl text-casa-muted hover:text-casa-navy hover:bg-casa-bg transition-colors text-body font-medium"
          >
            <Bell size={19} strokeWidth={1.8} />
            Activity
            {unreadCount > 0 && (
              <span className="ml-auto text-caption font-bold bg-red-500 text-white rounded-full min-w-[20px] h-5 px-1.5 flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
        </div>
      </aside>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
