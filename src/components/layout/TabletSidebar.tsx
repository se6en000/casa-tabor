import { NavLink } from 'react-router-dom'
import { format, isAfter, isBefore } from 'date-fns'
import { Home, Calendar, ShoppingCart, Sun, Music, Settings, ChevronDown, ChefHat, ChevronLeft, ChevronRight } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useCalendarStore } from '../../stores/calendarStore'
import { useTodayEvents } from '../../hooks/useCalendarEvents'
import { useMemberAvailability } from '../../hooks/useMemberAvailability'
import { useAppStore } from '../../stores/appStore'
import {
  evaluateMemberAvailabilityForWindow,
  indexAvailabilityExceptionsByMember,
  indexAvailabilityRulesByMember,
} from '../../lib/memberAvailability'
import { getPersistedDriverOverrideMemberIds } from '../../lib/eventPlanOverrides'
import { useState, useMemo, useEffect } from 'react'
import BounceScroll from '../shared/BounceScroll'
import { Button, IconButton } from '../ui'
import MaisonCrest from '../shared/MaisonCrest'

const NAV = [
  { to: '/',         icon: Home,         label: 'Home' },
  { to: '/calendar', icon: Calendar,     label: 'Calendar' },
  { to: '/grocery',  icon: ShoppingCart, label: 'Grocery' },
  { to: '/cook',     icon: ChefHat,      label: 'Cooking' },
  { to: '/briefing', icon: Sun,          label: 'Briefing' },
  { to: '/music',    icon: Music,        label: 'Music' },
  { to: '/settings', icon: Settings,     label: 'Settings' },
]

interface TabletSidebarProps {
  aiDrawerOpen?: boolean
}

export default function TabletSidebar({ aiDrawerOpen = false }: TabletSidebarProps = {}) {
  const now = useLiveClock(15_000)
  const { data: family } = useFamilyMembers()
  const { visibleMembers, toggleMember, setActiveView } = useCalendarStore()
  const { setCanvasSubmode } = useAppStore()
  const [familyOpen, setFamilyOpen] = useState(true)
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem('sidebar-collapsed')
    return saved === 'true'
  })
  const { data: todayEvents } = useTodayEvents(now)

  const isEffectivelyCollapsed = collapsed || aiDrawerOpen

  useEffect(() => {
    localStorage.setItem('sidebar-collapsed', JSON.stringify(collapsed))
  }, [collapsed])

  // Infer status per family member
  const homeFamily = useMemo(
    () => (family ?? []).filter((m) => (
      (m.role === 'parent' || m.role === 'child' || m.role === 'caregiver')
      && (m.show_on_home_sidebar ?? true)
    )),
    [family],
  )
  const availability = useMemberAvailability(homeFamily.map((member) => member.id))
  const rulesByMember = useMemo(
    () => indexAvailabilityRulesByMember(availability.rules),
    [availability.rules],
  )
  const exceptionsByMember = useMemo(
    () => indexAvailabilityExceptionsByMember(availability.exceptions),
    [availability.exceptions],
  )

  // Infer status per family member
  const whoStatus = useMemo(() => {
    if (!todayEvents) return []
    const assignedDriverOverridesByEvent = new Map(
      todayEvents.map((event) => [event.id, getPersistedDriverOverrideMemberIds(event)]),
    )
    return homeFamily.map(m => {
      const mine = todayEvents.filter((event) => {
        const isAttendee = event.members?.some((membership) => membership.family_member.id === m.id)
        const isAssignedViaOverride = assignedDriverOverridesByEvent.get(event.id)?.has(m.id) ?? false
        return Boolean(isAttendee || isAssignedViaOverride)
      })
      const activeNow = mine.find(e => isBefore(new Date(e.start_time), now) && isAfter(new Date(e.end_time), now))
      const nextUp = mine
        .filter(e => isAfter(new Date(e.start_time), now))
        .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0]
      return { member: m, activeNow, nextUp }
    })
  }, [homeFamily, todayEvents, now])

  return (
    <aside className={cn(
      'hidden lg:flex flex-none bg-casa-bg-2 border-r border-casa-border flex-col h-full min-h-0 overflow-hidden z-30 transition-all duration-300',
      // Preserve contract: collapsed ? 'w-20' : 'basis-1/5'
      isEffectivelyCollapsed ? 'w-20' : 'w-64 xl:w-72'
    )}>
      {/* Top Header */}
      <div className="flex items-center justify-between px-3.5 py-3.5 border-b border-casa-border/50">
        {!isEffectivelyCollapsed ? (
          <div className="flex items-center gap-3 min-w-0">
            <MaisonCrest size={48} isWarm={true} className="drop-shadow-xs flex-shrink-0" />
            <div className="flex flex-col justify-center gap-0.5 min-w-0">
              <span className="maison-brand-title font-bold text-title text-casa-navy tracking-[0.06em] truncate leading-none">
                Maison <span className="text-casa-gold font-normal">Tabor</span>
              </span>
              <span className="text-3xs tracking-[0.18em] uppercase font-bold text-casa-gold/90 font-sans leading-none">
                Estate OS
              </span>
            </div>
          </div>
        ) : (
          <MaisonCrest size={40} isWarm={true} className="mx-auto drop-shadow-xs" />
        )}
        <IconButton
          icon={isEffectivelyCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          aria-label={isEffectivelyCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={() => setCollapsed(!collapsed)}
          variant="ghost"
          size="sm"
          className={cn("text-casa-muted hover:text-casa-navy", isEffectivelyCollapsed ? "mt-2" : "")}
        />
      </div>

      <BounceScroll className="flex-1 overflow-y-auto overflow-x-hidden p-3 space-y-6">
        {/* Navigation */}
        <nav className="space-y-1">
          {NAV.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => {
                if (to === '/') setCanvasSubmode('calm')
                if (to === '/calendar') setActiveView('today')
              }}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-card transition-colors font-medium text-body-sm min-h-[44px]',
                  isActive
                    ? 'bg-casa-gold/15 text-casa-navy font-semibold'
                    : 'text-casa-muted hover:text-casa-navy hover:bg-casa-surface/60'
                )
              }
            >
              <Icon size={20} className="flex-shrink-0" />
              {!isEffectivelyCollapsed && <span>{label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Family — collapsible filter + who's home */}
        {!isEffectivelyCollapsed && homeFamily.length > 0 && (
          <div className="mt-3">
            <Button
              variant="ghost"
              fullWidth
              align="between"
              onClick={() => setFamilyOpen(o => !o)}
              trailingIcon={(
                <ChevronDown
                  size={13}
                  className={cn('transition-transform duration-200', familyOpen ? 'rotate-0' : '-rotate-90')}
                />
              )}
              className="min-h-control px-1.5 text-caption font-semibold text-casa-text-faint uppercase tracking-[0.18em] hover:text-casa-text-secondary transition-colors"
            >
              Family
            </Button>

            <AnimatePresence initial={false}>
              {familyOpen && (
                <motion.div
                  key="family-list"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="flex flex-col gap-0.5">
                    {homeFamily.map(m => {
                      const active = visibleMembers.length === 0 || visibleMembers.includes(m.id)
                      const status = whoStatus.find(s => s.member.id === m.id)
                      const busy = !!status?.activeNow
                      const nowWindowEnd = new Date(now.getTime() + (30 * 60 * 1000))
                      const availabilityAssessment = evaluateMemberAvailabilityForWindow(
                        m,
                        now,
                        nowWindowEnd,
                        rulesByMember.get(m.id) ?? [],
                        exceptionsByMember.get(m.id) ?? [],
                        { requireCanDrive: false },
                      )
                      const statusLabel = status?.activeNow
                        ? status.activeNow.location_name
                          ? `Out · ${status.activeNow.location_name.split(' ').slice(0, 3).join(' ')}`
                          : `Busy until ${format(new Date(status.activeNow.end_time), 'h:mm a')}`
                        : !availabilityAssessment.available
                          ? availabilityAssessment.reason ?? 'Unavailable'
                          : availabilityAssessment.softUnavailable
                            ? `${availabilityAssessment.reason ?? 'Blocked hours'} (flex)`
                          : status?.nextUp
                            ? `Next: ${format(new Date(status.nextUp.start_time), 'h:mm a')}`
                            : 'Free today'
                      const constrained = !availabilityAssessment.available || availabilityAssessment.softUnavailable

                      return (
                        <Button
                          variant="ghost"
                          fullWidth
                          align="start"
                          key={m.id}
                          onClick={() => toggleMember(m.id)}
                          contentClassName="gap-2.5"
                          className={cn(
                            'min-h-control px-1.5 py-1.5 rounded-xl transition-colors',
                            active ? 'bg-transparent' : 'bg-transparent hover:bg-casa-surface/35',
                          )}
                        >
                          <span
                            className="relative w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-body font-bold text-white"
                            style={{ backgroundColor: m.color_hex }}
                          >
                            {m.name[0]}
                            <span className={cn(
                              'absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-casa-bg-2',
                              !active ? 'bg-casa-muted/30' : busy || constrained ? 'bg-amber-400' : 'bg-emerald-400',
                            )} />
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-body font-semibold leading-tight transition-opacity', active ? 'text-casa-navy opacity-100' : 'text-casa-navy opacity-45')}>
                              {m.name}
                            </p>
                            <p className={cn('text-caption leading-tight font-normal tabular-nums truncate mt-0.5', active ? 'text-casa-text-faint' : 'text-casa-text-faint/80')}>
                              {statusLabel}
                            </p>
                          </div>
                        </Button>
                      )
                    })}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </BounceScroll>
    </aside>
  )
}
