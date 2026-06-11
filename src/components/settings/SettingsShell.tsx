import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import {
  Users, Sun, MessageSquare, Bot, Palette, Home, Activity,
  BookmarkCheck, Layers, ChevronLeft, ChevronRight, Music2,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import BounceScroll from '../shared/BounceScroll'

// ── Nav structure ──────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Household',
    items: [
      { to: '/settings/family',  icon: Users,         label: 'Family',              desc: 'Members, colors, roles' },
      { to: '/settings/profile', icon: Home,          label: 'Home & Profile',      desc: 'Address, drive times, planning' },
      { to: '/settings/places',  icon: BookmarkCheck, label: 'Saved Places',        desc: 'Locations & people nicknames' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { to: '/settings/google',  icon: Layers,        label: 'Google Services',     desc: 'Calendar sync + Gmail' },
      { to: '/settings/ai',      icon: Bot,           label: 'AI Provider',         desc: 'Vendor, model, API key' },
      { to: '/settings/sms',     icon: MessageSquare, label: 'Notifications',       desc: 'SMS briefings & alerts' },
      { to: '/music',            icon: Music2,        label: 'Spotify / Music',     desc: 'Connect music playback' },
    ],
  },
  {
    label: 'Display & Art',
    items: [
      { to: '/settings/display', icon: Sun,           label: 'Display & Art Mode',  desc: 'Brightness, Room Tone, sleep, art' },
    ],
  },
  {
    label: 'Appearance',
    items: [
      { to: '/settings/theme',   icon: Palette,       label: 'Theme & Colors',      desc: 'Presets and custom palette' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings/status',  icon: Activity,      label: 'Status Dashboard',    desc: 'AI usage and cost' },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

// ── Shell ──────────────────────────────────────────────────────────────────

export default function SettingsShell() {
  const location = useLocation()
  const navigate = useNavigate()

  // On mobile: are we looking at the list or a detail page?
  const isRoot = location.pathname === '/settings'

  // Redirect /settings → first item on desktop (no-op on mobile since we show list)
  useEffect(() => {
    if (location.pathname === '/settings') {
      // Only auto-navigate on wider screens
      if (window.innerWidth >= 768) {
        navigate('/settings/family', { replace: true })
      }
    }
  }, [location.pathname, navigate])

  const activeItem = ALL_ITEMS.find(i =>
    location.pathname === i.to || location.pathname.startsWith(i.to + '/')
  )

  return (
    <div className="flex flex-1 overflow-hidden h-full">

      {/* ── Sidebar — hidden on mobile when viewing a detail page ── */}
      <aside className={cn(
        'flex-shrink-0 border-r border-casa-border bg-casa-surface flex flex-col overflow-hidden transition-all',
        // Mobile: full width on list, hidden on detail
        'w-full md:w-64 lg:w-72',
        !isRoot && 'hidden md:flex',
        isRoot && 'flex',
      )}>
        {/* Sidebar header */}
        <div className="px-5 py-5 border-b border-casa-border flex-shrink-0">
          <h1 className="font-display text-display-sm text-casa-navy">Settings</h1>
        </div>

        {/* Nav groups */}
        <BounceScroll className="flex-1">
          <nav className="px-3 py-3 space-y-5">
            {NAV_GROUPS.map(group => (
              <div key={group.label}>
                <p className="text-[10px] font-bold text-casa-muted uppercase tracking-widest px-2 mb-1.5">
                  {group.label}
                </p>
                <ul className="space-y-0.5">
                  {group.items.map(item => (
                    <li key={item.to}>
                      <NavLink
                        to={item.to}
                        className={({ isActive }) => cn(
                          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors group',
                          isActive
                            ? 'bg-casa-gold/10 text-casa-gold'
                            : 'text-casa-navy hover:bg-casa-bg'
                        )}
                      >
                        {({ isActive }) => (
                          <>
                            <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'text-casa-gold' : 'text-casa-muted group-hover:text-casa-navy')} />
                            <div className="flex-1 min-w-0">
                              <p className="text-body-sm font-medium leading-none">{item.label}</p>
                              <p className="text-[11px] text-casa-muted mt-0.5 md:block truncate hidden">{item.desc}</p>
                            </div>
                            <ChevronRight size={14} className="md:hidden text-casa-muted flex-shrink-0" />
                          </>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </BounceScroll>
      </aside>

      {/* ── Detail panel ── */}
      <div className={cn(
        'flex-1 flex flex-col overflow-hidden',
        isRoot && 'hidden md:flex',
      )}>
        {/* Mobile back bar */}
        <div className="md:hidden flex items-center gap-2 px-4 py-3 border-b border-casa-border bg-casa-surface flex-shrink-0">
          <button
            onClick={() => navigate('/settings')}
            className="flex items-center gap-1 text-casa-gold text-body-sm font-medium"
          >
            <ChevronLeft size={18} /> Settings
          </button>
          {activeItem && (
            <span className="text-body-sm font-semibold text-casa-navy ml-1">{activeItem.label}</span>
          )}
        </div>

        {/* Page content */}
        <BounceScroll className="flex-1">
          <div className="max-w-3xl mx-auto px-6 py-8">
            <Outlet />
          </div>
        </BounceScroll>
      </div>
    </div>
  )
}
