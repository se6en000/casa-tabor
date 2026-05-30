import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { Home, Calendar, Sun, Settings, Music, MoreHorizontal, Bell, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { useNotifications } from '../../hooks/useNotifications'
import NotificationDrawer from './NotificationDrawer'
import { AnimatePresence, motion } from 'framer-motion'

const primaryTabs = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/briefing', icon: Sun, label: 'Briefing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function NavBar() {
  const [moreOpen, setMoreOpen] = useState(false)
  const [notifOpen, setNotifOpen] = useState(false)
  const navigate = useNavigate()
  const { unreadCount } = useNotifications()

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-casa-surface border-t border-casa-border h-[--spacing-nav-height] flex items-center justify-around px-2 z-50">
        {primaryTabs.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              cn(
                'flex flex-col items-center gap-1 px-3 py-2 rounded-button transition-colors',
                isActive ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy'
              )
            }
          >
            <Icon size={22} strokeWidth={1.8} />
            <span className="text-caption font-medium">{label}</span>
          </NavLink>
        ))}

        {/* More button */}
        <button
          onClick={() => setMoreOpen(o => !o)}
          className={cn(
            'flex flex-col items-center gap-1 px-3 py-2 rounded-button transition-colors relative',
            moreOpen ? 'text-casa-gold' : 'text-casa-muted hover:text-casa-navy'
          )}
        >
          <MoreHorizontal size={22} strokeWidth={1.8} />
          {unreadCount > 0 && !moreOpen && (
            <span className="absolute top-1 right-2 min-w-[14px] h-3.5 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold leading-none">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
          <span className="text-caption font-medium">More</span>
        </button>
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
              transition={{ duration: 0.18 }}
              className="lg:hidden fixed inset-0 bg-black/30 z-40"
              onClick={() => setMoreOpen(false)}
            />

            {/* Sheet */}
            <motion.div
              key="sheet"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              className="lg:hidden fixed bottom-[--spacing-nav-height] left-0 right-0 bg-casa-surface rounded-t-2xl border-t border-casa-border z-50 pb-2 pt-3 px-4 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]"
            >
              {/* Handle */}
              <div className="w-10 h-1 bg-casa-divider rounded-full mx-auto mb-4" />

              <div className="grid grid-cols-3 gap-2 pb-2">
                {/* Music */}
                <button
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-casa-bg hover:bg-casa-border transition-colors"
                  onClick={() => { navigate('/music'); setMoreOpen(false) }}
                >
                  <Music size={24} strokeWidth={1.6} className="text-casa-navy" />
                  <span className="text-body-sm font-medium text-casa-navy">Music</span>
                </button>

                {/* Activity / Notifications */}
                <button
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-casa-bg hover:bg-casa-border transition-colors relative"
                  onClick={() => { setNotifOpen(true); setMoreOpen(false) }}
                >
                  <Bell size={24} strokeWidth={1.6} className="text-casa-navy" />
                  {unreadCount > 0 && (
                    <span className="absolute top-3 right-6 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                  )}
                  <span className="text-body-sm font-medium text-casa-navy">Activity</span>
                </button>

                {/* Close */}
                <button
                  className="flex flex-col items-center gap-2 p-4 rounded-xl bg-casa-bg hover:bg-casa-border transition-colors"
                  onClick={() => setMoreOpen(false)}
                >
                  <X size={24} strokeWidth={1.6} className="text-casa-muted" />
                  <span className="text-body-sm font-medium text-casa-muted">Close</span>
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <NotificationDrawer open={notifOpen} onClose={() => setNotifOpen(false)} />
    </>
  )
}
