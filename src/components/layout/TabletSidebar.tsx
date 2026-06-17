import { NavLink } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { Home, Calendar, ShoppingCart, Sun, Music, Settings, ChevronDown, Users, ChevronLeft, ChevronRight } from 'lucide-react'
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const { data: todayEvents } = useTodayEvents(now)

  // Load sidebar state from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    if (saved !== null) setSidebarCollapsed(JSON.parse(saved))
  }, [])

  // Save sidebar state to localStorage when it changes
  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(sidebarCollapsed))
  }, [sidebarCollapsed])

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
        'hidden lg:flex flex-shrink-0 bg-casa-rail border-r border-casa-border flex-col h-screen sticky top-0 overflow-hidden z-30 transition-all duration-300',
        sidebarCollapsed ? 'w-20' : 'w-72'
      )}>

        {/* Collapse/expand toggle at top */}
        <div className="flex-shrink-0 flex items-center justify-center p-2 border-b border-casa-border">
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded-lg hover:bg-casa-bg transition-colors text-casa-muted hover:text-casa-navy"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        {/* Family — collapsible filter + who's home */}
        {!sidebarCollapsed && (
          <div className="flex-shrink-0 border-b border-casa-border">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <button
                onClick={() => setFamilyOpen(o => !o)}
                className="flex items-center gap-1.5 text-caption text-casa-muted uppercase tracking-wider hover:text-casa-navy transition-colors"
              >
                <Users size={12} className="shrink-0" />
                Family
                <ChevronDown
                  size={13}
                  className={cn('ml-1 transition-transform duration-200', familyOpen ? 'rotate-0' : '-rotate-90')}
                />
              </button>
              <NavLink
                to="/settings/family"
                className="text-body-sm text-casa-muted hover:text-casa-navy transition-colors"
              >
                Manage
              </NavLink>
            </div>

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
                  <div className="px-4 pb-4 flex flex-col gap-1.5">
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
                          'w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all text-left',
                          active
                            ? 'bg-transparent hover:bg-casa-bg'
                            : 'opacity-40 hover:opacity-70 hover:bg-casa-bg/60',
                        )}
                      >
                        <span
                          className="relative w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-body-sm font-bold text-white"
                          style={{ backgroundColor: m.color_hex }}
                        >
                          {m.name[0]}
                          <span className={cn(
                            'absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full border-2 border-casa-surface',
                            !active ? 'bg-casa-muted/40' : busy ? 'bg-amber-400' : 'bg-emerald-400',
                          )} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn('text-body font-semibold leading-tight', active ? 'text-casa-navy' : 'text-casa-text')}>
                            {m.name}
                          </p>
                          <p className={cn('text-body-sm truncate mt-0.5', busy ? 'text-casa-gold' : 'text-casa-muted')}>
                            {statusLabel}
                          </p>
                        </div>
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
        <BounceScroll className="flex-1 min-h-0" innerClassName={cn('flex flex-col gap-1.5', sidebarCollapsed ? 'px-2 py-4' : 'px-4 py-4')}>
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={to === '/calendar' ? () => setActiveView('stacked') : undefined}
              className={({ isActive }) =>
                cn(
                  'w-full flex items-center rounded-2xl transition-colors font-medium',
                  sidebarCollapsed ? 'justify-center p-3 aspect-square' : 'justify-start gap-3 px-4 py-3 text-body',
                  isActive
                    ? 'bg-casa-navy text-white shadow-sm'
                    : 'text-casa-muted hover:text-casa-navy hover:bg-casa-bg',
                )
              }
              title={sidebarCollapsed ? label : undefined}
            >
              {({ isActive }) => (
                <>
                  <Icon size={sidebarCollapsed ? 22 : 19} strokeWidth={isActive ? 2 : 1.8} className={sidebarCollapsed ? '' : 'flex-shrink-0'} />
                  {!sidebarCollapsed && label}
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
