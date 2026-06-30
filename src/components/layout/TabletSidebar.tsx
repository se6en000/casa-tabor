import { NavLink } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { Home, Calendar, ShoppingCart, Sun, Music, Settings, ChevronDown, Users, ChefHat, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useCalendarStore } from '../../stores/calendarStore'
import { useNotifications } from '../../hooks/useNotifications'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import NotificationDrawer from '../shared/NotificationDrawer'
import { useState, useMemo, useEffect } from 'react'
import BounceScroll from '../shared/BounceScroll'

const NAV = [
  { to: '/',         icon: Home,         label: 'Home' },
  { to: '/calendar', icon: Calendar,     label: 'Calendar' },
  { to: '/grocery',  icon: ShoppingCart, label: 'Grocery' },
  { to: '/cook',     icon: ChefHat,      label: 'Cooking' },
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
  const [collapsed, setCollapsed] = useState(false)
  const { data: todayEvents } = useTodayEvents(now)

  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) setCollapsed(JSON.parse(saved))
  }, [])

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed))
  }, [collapsed])

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
      <aside className={cn(
        'hidden lg:flex flex-shrink-0 bg-casa-surface border-r border-casa-border flex-col h-screen sticky top-0 overflow-hidden z-30 transition-all duration-300',
        collapsed ? 'w-20' : 'w-72',
      )}>

        <BounceScroll
          className="flex-1 min-h-0"
          innerClassName={cn('py-4 flex flex-col', collapsed ? 'px-2' : 'px-4')}
        >
          <div className={cn('flex mb-2', collapsed ? 'justify-center' : 'justify-end')}>
            <button
              onClick={() => setCollapsed(c => !c)}
              className="p-1.5 rounded-md hover:bg-casa-bg transition-colors text-casa-muted hover:text-casa-navy"
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
            </button>
          </div>

          {/* Family — collapsible filter + who's home */}
          {!collapsed && (
            <div className="mb-4">
              <button
                onClick={() => setFamilyOpen(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 pb-2 text-caption text-casa-muted uppercase tracking-wider hover:text-casa-navy transition-colors"
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
                    <div className="flex flex-col gap-0.5">
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
          )}

          {/* Nav */}
          <div className="flex flex-col gap-0.5">
            {NAV.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                end={to === '/'}
                onClick={to === '/calendar' ? () => setActiveView('stacked') : undefined}
                title={collapsed ? label : undefined}
                className={({ isActive }) =>
                  cn(
                    'flex items-center rounded-xl transition-colors font-medium',
                    collapsed ? 'justify-center p-3 aspect-square' : 'gap-3 px-4 py-3 text-body',
                    isActive
                      ? 'bg-casa-navy text-white'
                      : 'text-casa-muted hover:text-casa-navy hover:bg-casa-bg',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon size={collapsed ? 22 : 19} strokeWidth={isActive ? 2 : 1.8} />
                    {!collapsed && label}
                  </>
                )}
              </NavLink>
            ))}
          </div>
        </BounceScroll>
      </aside>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
