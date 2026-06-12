import { NavLink } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { Home, Calendar, ShoppingCart, Sun, Music, Settings, ChevronDown, Users } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useCalendarStore } from '../../stores/calendarStore'
import { useNotifications } from '../../hooks/useNotifications'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import NotificationDrawer from '../shared/NotificationDrawer'
import { useState, useMemo } from 'react'
import BounceScroll from '../shared/BounceScroll'

const NAV = [
  { to: '/',         icon: Home,         label: 'Home' },
  { to: '/calendar', icon: Calendar,     label: 'Calendar' },
  { to: '/grocery',  icon: ShoppingCart, label: 'Grocery' },
  { to: '/briefing', icon: Sun,          label: 'Briefing' },
  { to: '/music',    icon: Music,        label: 'Music' },
  { to: '/settings', icon: Settings,     label: 'Settings' },
]

export default function TabletSidebar() {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { visibleMembers, toggleMember, setActiveView } = useCalendarStore()
  useNotifications()
  const [notifOpen, setNotifOpen] = useState(false)
  const [familyOpen, setFamilyOpen] = useState(true)
  const { data: todayEvents } = useTodayEvents(now)

  // Infer status per family member
  const homeFamily = useMemo(
    () => (family ?? []).filter(m => m.role === 'parent' || m.role === 'child'),
    [family],
  )

  // Infer status per family member
  const whoStatus = useMemo(() => {
    if (!todayEvents) return []
    return homeFamily.map(m => {
      const mine = todayEvents.filter(e => e.members?.some(em => em.family_member.id === m.id))
      const activeNow = mine.find(e => isBefore(new Date(e.start_time), now) && isAfter(new Date(e.end_time), now))
      const nextUp = mine
        .filter(e => isAfter(new Date(e.start_time), now))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]
      return { member: m, activeNow, nextUp }
    })
  }, [homeFamily, todayEvents, now])

  return (
    <>
      <aside className="hidden lg:flex w-72 flex-shrink-0 bg-casa-surface border-r border-casa-border flex-col h-screen sticky top-0 overflow-hidden z-30">

        {/* Family — collapsible filter + who's home */}
        <div className="flex-shrink-0 border-b border-casa-border">
          <button
            onClick={() => setFamilyOpen(o => !o)}
            className="w-full flex items-center gap-1.5 px-6 pt-5 pb-3 text-caption text-casa-muted uppercase tracking-wider hover:text-casa-navy transition-colors"
          >
            <Users size={12} className="shrink-0" />
            Family
            <ChevronDown
              size={13}
              className={cn('ml-auto transition-transform duration-200', familyOpen ? 'rotate-0' : '-rotate-90')}
            />
          </button>

          <AnimatePresence initial={false}>
            {familyOpen && (
              <motion.div
                key="family-list"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="px-4 pb-4 flex flex-col gap-0.5">
                  {homeFamily.map(m => {
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
                          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-caption font-bold text-white"
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
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Nav */}
        <BounceScroll className="flex-1 min-h-0" innerClassName="px-4 py-4 flex flex-col gap-0.5">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={to === '/calendar' ? () => setActiveView('stacked') : undefined}
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
        </BounceScroll>
      </aside>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
