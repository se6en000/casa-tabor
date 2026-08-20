import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Calendar, ShoppingCart, Sun, Settings, Music, MoreHorizontal, Bell, ChefHat, Sparkles } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from './NotificationDrawer'
import { AnimatePresence, motion } from 'framer-motion'
import { useCalendarStore } from '../../stores/calendarStore'
import { Button } from '../ui'

const primaryTabs = [
  { to: '/', icon: Home, label: 'Today' },
  { to: '/calendar', icon: Calendar, label: 'Agenda' },
  { to: '/cook', icon: ChefHat, label: 'Cooking' },
]

export default function NavBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()
  const { setActiveView } = useCalendarStore()

  return (
    <>
      <nav className="app-bottom-nav lg:hidden fixed bottom-0 left-0 right-0 bg-casa-surface border-t border-casa-border flex items-center justify-around z-sticky">
        {primaryTabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            onClick={() => { if (to === '/calendar') setActiveView('today') }}
            className={({ isActive }) =>
              cn(
                'app-bottom-nav-item flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-button transition-colors min-h-[48px]',
                isActive ? 'text-casa-gold font-semibold' : 'text-casa-muted hover:text-casa-navy'
              )
            }
          >
            <Icon size={22} strokeWidth={1.8} />
            <span className="app-bottom-nav-label text-caption font-medium truncate">{label}</span>
          </NavLink>
        ))}

        {/* More button */}
        <Button variant="ghost"
          onClick={() => setMoreOpen(o => !o)}
          className={cn(
            'app-bottom-nav-item flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-button transition-colors relative min-h-[48px]',
            moreOpen ? 'text-casa-gold font-semibold' : 'text-casa-muted hover:text-casa-navy'
          )}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          {unreadCount > 0 && !moreOpen && (
            <span className="absolute top-1 right-2 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-caption font-bold leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="app-bottom-nav-label text-caption font-medium">More</span>
        </Button>
      </nav>

      {/* More slide-up sheet */}
      <AnimatePresence>
        {moreOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="lg:hidden fixed inset-0 bg-black/40 z-scrim"
              onClick={() => setMoreOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'tween', duration: 0.38, ease: [0.32, 0.72, 0, 1] }}
              drag="y"
              dragConstraints={{ top: 0 }}
              dragElastic={{ top: 0, bottom: 0.15 }}
              dragMomentum={false}
              onDragEnd={(_: unknown, info: { velocity: { y: number }, offset: { y: number } }) => {
                if (info.velocity.y > 300 || info.offset.y > 120) setMoreOpen(false)
              }}
              style={{ willChange: 'transform', touchAction: 'none', paddingBottom: 'calc(var(--spacing-nav-height) + env(safe-area-inset-bottom))' }}
              className="lg:hidden fixed bottom-0 left-0 right-0 bg-casa-surface rounded-t-2xl z-modal shadow-modal cursor-grab active:cursor-grabbing"
            >
              {/* Handle */}
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-9 h-1 bg-casa-divider rounded-full" />
              </div>

              {/* Title */}
              <div className="px-5 pt-2 pb-3 border-b border-casa-border">
                <span className="text-caption font-semibold text-casa-muted uppercase tracking-wider">More</span>
              </div>

              {/* Row items */}
              <div className="py-2">
                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors"
                  onClick={() => { navigate('/grocery'); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                    <ShoppingCart size={18} strokeWidth={1.8} className="text-emerald-600" />
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Grocery List</span>
                </Button>

                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors"
                  onClick={() => { navigate('/actions'); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                    <Sparkles size={18} strokeWidth={1.8} className="text-blue-600" />
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Action Queue</span>
                </Button>

                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors"
                  onClick={() => { navigate('/music'); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-casa-gold/15 flex items-center justify-center flex-shrink-0">
                    <Music size={18} strokeWidth={1.8} className="text-casa-gold" />
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Music</span>
                </Button>

                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors"
                  onClick={() => { navigate('/briefing'); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                    <Sun size={18} strokeWidth={1.8} className="text-amber-600" />
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Daily Briefing</span>
                </Button>

                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors"
                  onClick={() => { navigate('/settings'); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-slate-500/10 flex items-center justify-center flex-shrink-0">
                    <Settings size={18} strokeWidth={1.8} className="text-slate-600" />
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Household Settings</span>
                </Button>

                <Button variant="ghost"
                  className="w-full flex items-center gap-4 px-5 py-3.5 hover:bg-casa-bg active:bg-casa-bg transition-colors relative"
                  onClick={() => { setNotifOpen(true); setMoreOpen(false) }}
                >
                  <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center flex-shrink-0 relative">
                    <Bell size={18} strokeWidth={1.8} className="text-red-500" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-caption font-bold leading-none">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </div>
                  <span className="text-body-md font-medium text-casa-navy">Activity</span>
                  {unreadCount > 0 && (
                    <span className="ml-auto text-caption text-casa-muted">{unreadCount} new</span>
                  )}
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
