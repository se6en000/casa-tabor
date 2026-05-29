import { NavLink } from 'react-router-dom'
import { Home, Calendar, Sun, Settings, Music } from 'lucide-react'
import { cn } from '../../utils/cn'
import NotificationBell from './NotificationBell'

const navItems = [
  { to: '/', icon: Home, label: 'Home' },
  { to: '/calendar', icon: Calendar, label: 'Calendar' },
  { to: '/music', icon: Music, label: 'Music' },
  { to: '/briefing', icon: Sun, label: 'Briefing' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

export default function NavBar() {
  return (
    <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-casa-surface border-t border-casa-border h-[--spacing-nav-height] flex items-center justify-around px-4 z-50">
      {navItems.map(({ to, icon: Icon, label }) => (
        <NavLink
          key={to}
          to={to}
          className={({ isActive }) =>
            cn(
              'flex flex-col items-center gap-1 px-4 py-2 rounded-button transition-colors',
              isActive
                ? 'text-casa-gold'
                : 'text-casa-muted hover:text-casa-navy'
            )
          }
        >
          <Icon size={22} strokeWidth={1.8} />
          <span className="text-caption font-medium">{label}</span>
        </NavLink>
      ))}
      <div className="flex flex-col items-center gap-1 px-4 py-2">
        <NotificationBell />
        <span className="text-caption font-medium text-casa-muted">Activity</span>
      </div>
    </nav>
  )
}