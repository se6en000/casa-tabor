import { useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  Plus,
  Zap,
  ChefHat,
  MoreHorizontal,
  ShoppingCart,
  Music,
  Sun,
  Settings,
  Bell,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import { useWeekConflicts } from '../../hooks/useConflicts'
import { usePrepItems } from '../../hooks/usePrepItems'
import { useCalendarStore } from '../../stores/calendarStore'
import { useAppStore } from '../../stores/appStore'
import NotificationDrawer from '../shared/NotificationDrawer'
import { Button } from '../ui'

interface MobileFloatingDockProps {
  onOpenQuickCreate?: () => void
}

export default function MobileFloatingDock({ onOpenQuickCreate }: MobileFloatingDockProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { unreadCount } = useNotifications()
  const { setActiveView } = useCalendarStore()
  const { setCanvasSubmode } = useAppStore()

  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()
  const unresolvedConflicts = conflicts.filter((c) => !c.resolved)
  const unresolvedPrep = prepItems.filter((p) => !p.dismissed)
  const totalAttentionCount = unresolvedConflicts.length + unresolvedPrep.length

  const triggerHaptic = () => {
    try {
      navigator.vibrate?.(8)
    } catch {}
  }

  const navItems = [
    {
      to: '/',
      icon: Home,
      label: 'Today',
      badge: 0,
      onClick: () => {
        triggerHaptic()
        setCanvasSubmode('calm')
      },
    },
    {
      to: '/calendar',
      icon: Calendar,
      label: 'Calendar',
      badge: 0,
      onClick: () => {
        triggerHaptic()
        setActiveView('today')
      },
    },
    {
      to: '/actions',
      icon: Zap,
      label: 'Actions',
      badge: totalAttentionCount,
      onClick: () => triggerHaptic(),
    },
    {
      to: '/cook',
      icon: ChefHat,
      label: 'Kitchen',
      badge: 0,
      onClick: () => triggerHaptic(),
    },
  ]

  // Hide floating dock on full trips detail page
  const isHidden = location.pathname.startsWith('/trips/')

  if (isHidden) return null

  return (
    <>
      {/* ── Floating Dynamic Capsule Navigation Dock (lg:hidden) ── */}
      <nav
        aria-label="Mobile Navigation Dock"
        className="lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-sticky w-[calc(100%-1.5rem)] max-w-[430px] h-[62px] rounded-full bg-casa-navy/92 dark:bg-casa-navy/95 backdrop-blur-2xl border border-casa-gold/35 shadow-[0_12px_36px_-4px_rgba(0,0,0,0.4),0_0_24px_rgba(201,169,110,0.15)] flex items-center justify-between px-2.5 py-1.5 transition-all duration-300 pointer-events-auto"
      >
        {/* Left item 1: Today */}
        <NavLink
          to="/"
          end
          onClick={navItems[0].onClick}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 rounded-full transition-all duration-200',
              isActive
                ? 'text-casa-gold font-bold scale-[1.04]'
                : 'text-white/70 hover:text-white active:scale-95'
            )
          }
        >
          {({ isActive }) => (
            <>
              <Home size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
                Today
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-casa-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </>
          )}
        </NavLink>

        {/* Left item 2: Calendar */}
        <NavLink
          to="/calendar"
          onClick={navItems[1].onClick}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 rounded-full transition-all duration-200',
              isActive
                ? 'text-casa-gold font-bold scale-[1.04]'
                : 'text-white/70 hover:text-white active:scale-95'
            )
          }
        >
          {({ isActive }) => (
            <>
              <Calendar size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
                Calendar
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-casa-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </>
          )}
        </NavLink>

        {/* ── Center Elevated FAB (+) ── */}
        <div className="relative flex items-center justify-center px-1 -mt-4">
          <Button
            variant="ghost"
            onClick={() => {
              triggerHaptic()
              onOpenQuickCreate?.()
            }}
            aria-label="Create new event, reminder, or task"
            className="w-12 h-12 rounded-full bg-gradient-to-br from-casa-gold via-amber-400 to-amber-500 text-casa-navy p-0 flex items-center justify-center border-2 border-casa-navy shadow-[0_4px_18px_rgba(201,169,110,0.55)] active:scale-90 transition-all duration-150 cursor-pointer"
          >
            <Plus size={24} strokeWidth={2.6} className="text-casa-navy" />
          </Button>
        </div>

        {/* Right item 1: Actions */}
        <NavLink
          to="/actions"
          onClick={navItems[2].onClick}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 rounded-full transition-all duration-200',
              isActive
                ? 'text-casa-gold font-bold scale-[1.04]'
                : 'text-white/70 hover:text-white active:scale-95'
            )
          }
        >
          {({ isActive }) => (
            <>
              <div className="relative">
                <Zap size={20} strokeWidth={isActive ? 2.3 : 1.8} />
                {totalAttentionCount > 0 && (
                  <span className="absolute -top-1.5 -right-2.5 min-w-[15px] h-[15px] px-1 flex items-center justify-center rounded-full bg-amber-500 text-white text-3xs font-bold leading-none border border-casa-navy shadow-sm">
                    {totalAttentionCount > 9 ? '9+' : totalAttentionCount}
                  </span>
                )}
              </div>
              <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
                Actions
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-casa-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </>
          )}
        </NavLink>

        {/* Right item 2: Kitchen / Meals */}
        <NavLink
          to="/cook"
          onClick={navItems[3].onClick}
          className={({ isActive }) =>
            cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 rounded-full transition-all duration-200',
              isActive
                ? 'text-casa-gold font-bold scale-[1.04]'
                : 'text-white/70 hover:text-white active:scale-95'
            )
          }
        >
          {({ isActive }) => (
            <>
              <ChefHat size={20} strokeWidth={isActive ? 2.3 : 1.8} />
              <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
                Kitchen
              </span>
              {isActive && (
                <motion.div
                  layoutId="mobile-dock-active"
                  className="absolute -bottom-0.5 w-1 h-1 rounded-full bg-casa-gold"
                  transition={{ type: 'spring', stiffness: 380, damping: 30 }}
                />
              )}
            </>
          )}
        </NavLink>

        {/* Right item 3: More */}
        <Button
          variant="ghost"
          aria-label="More navigation destinations"
          onClick={() => {
            triggerHaptic()
            setMoreOpen(true)
          }}
          className={cn(
            'relative flex flex-1 flex-col items-center justify-center min-h-[44px] py-1 rounded-full text-white/70 hover:text-white active:scale-95 transition-all duration-200',
            moreOpen ? 'text-casa-gold' : ''
          )}
        >
          <div className="relative">
            <MoreHorizontal size={20} strokeWidth={1.8} />
            {unreadCount > 0 && !moreOpen && (
              <span className="absolute -top-1 -right-2 min-w-[13px] h-[13px] px-0.5 flex items-center justify-center rounded-full bg-red-500 text-white text-3xs font-bold leading-none">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
            More
          </span>
        </Button>
      </nav>

      {/* ── More Slide-Up Modal Sheet ── */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Scrim Backdrop */}
            <motion.div
              key="dock-more-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-scrim"
              onClick={() => setMoreOpen(false)}
            />

            {/* Sheet Content */}
            <motion.div
              key="dock-more-sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.15 }}
              dragMomentum={false}
              onDragEnd={(_: unknown, info: { velocity: { y: number }; offset: { y: number } }) => {
                if (info.velocity.y > 250 || info.offset.y > 100) setMoreOpen(false)
              }}
              className="lg:hidden fixed bottom-0 left-0 right-0 bg-casa-surface rounded-t-3xl z-modal shadow-modal cursor-grab active:cursor-grabbing border-t border-casa-border will-change-transform touch-none pb-28"
            >
              {/* Drag Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1.5 bg-casa-divider rounded-full" />
              </div>

              {/* Sheet Header */}
              <div className="px-5 pt-2 pb-3 border-b border-casa-border flex items-center justify-between">
                <span className="text-caption font-bold text-casa-muted uppercase tracking-wider">
                  Household Hub & More
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setMoreOpen(false)}
                  className="text-caption text-casa-gold font-semibold"
                >
                  Done
                </Button>
              </div>

              {/* Grid / List of extended destinations */}
              <div className="p-3 grid grid-cols-2 gap-2">
                <Button
                  variant="ghost"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-surface-subtle transition-colors text-left"
                  onClick={() => {
                    navigate('/grocery')
                    setMoreOpen(false)
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <ShoppingCart size={18} className="text-emerald-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold text-casa-navy">Grocery</div>
                    <div className="text-2xs text-casa-muted truncate">Pantry & Restock</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-surface-subtle transition-colors text-left"
                  onClick={() => {
                    navigate('/briefing')
                    setMoreOpen(false)
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center shrink-0">
                    <Sun size={18} className="text-amber-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold text-casa-navy">Briefing</div>
                    <div className="text-2xs text-casa-muted truncate">Morning Pulse</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-surface-subtle transition-colors text-left"
                  onClick={() => {
                    navigate('/music')
                    setMoreOpen(false)
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-casa-gold/20 flex items-center justify-center shrink-0">
                    <Music size={18} className="text-casa-gold" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold text-casa-navy">Music</div>
                    <div className="text-2xs text-casa-muted truncate">Sonos & Spotify</div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-surface-subtle transition-colors text-left relative"
                  onClick={() => {
                    setNotifOpen(true)
                    setMoreOpen(false)
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-red-500/15 flex items-center justify-center shrink-0 relative">
                    <Bell size={18} className="text-red-500" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-red-500 border-2 border-casa-surface" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold text-casa-navy">Activity</div>
                    <div className="text-2xs text-casa-muted truncate">
                      {unreadCount > 0 ? `${unreadCount} new alerts` : 'Notifications'}
                    </div>
                  </div>
                </Button>

                <Button
                  variant="ghost"
                  className="flex items-center gap-3 p-3.5 rounded-2xl bg-casa-bg hover:bg-casa-surface-subtle transition-colors text-left col-span-2"
                  onClick={() => {
                    navigate('/settings')
                    setMoreOpen(false)
                  }}
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-500/15 flex items-center justify-center shrink-0">
                    <Settings size={18} className="text-slate-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-body-sm font-semibold text-casa-navy">Household Settings</div>
                    <div className="text-2xs text-casa-muted truncate">Family members, display, AI, integrations</div>
                  </div>
                </Button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
