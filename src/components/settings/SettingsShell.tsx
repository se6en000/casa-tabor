import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import {
  Users, Sun, MessageSquare, Bot, Home, Activity,
  BookmarkCheck, Layers, ChevronRight, Music2,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import BounceScroll from '../shared/BounceScroll'

// ── Nav structure ──────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Visual & Display',
    items: [
      { to: '/settings/display', icon: Sun,           label: 'Display & Art Mode',  desc: 'Theme, colors, brightness, art mode, sensors' },
    ],
  },
  {
    label: 'Home & Content',
    items: [
      { to: '/settings/home',    icon: Home,          label: 'Home & Profile',      desc: 'Address, home screen layout' },
      { to: '/settings/places',  icon: BookmarkCheck, label: 'Saved Places',        desc: 'Locations & people nicknames' },
    ],
  },
  {
    label: 'Household',
    items: [
      { to: '/settings/family',  icon: Users,         label: 'Family',              desc: 'Members, colors, roles' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { to: '/settings/google',  icon: Layers,        label: 'Google Services',     desc: 'Calendar sync + Gmail' },
      { to: '/settings/music',   icon: Music2,        label: 'Spotify / Music',     desc: 'Connect music playback' },
      { to: '/settings/ai',      icon: Bot,           label: 'AI Provider',         desc: 'Vendor, model, API key' },
      { to: '/settings/sms',     icon: MessageSquare, label: 'Notifications',       desc: 'SMS briefings & alerts' },
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
  const tabsRef = useRef<HTMLDivElement>(null)

  // On mobile: are we looking at the list or a detail page?
  const isRoot = location.pathname === '/settings'

  // Redirect /settings → first item on desktop (no-op on mobile since we show list)
  useEffect(() => {
    if (location.pathname === '/settings') {
      // Only auto-navigate on wider screens
      if (window.innerWidth >= 768) {
        navigate('/settings/display', { replace: true })
      }
    }
  }, [location.pathname, navigate])

  const activeItem = ALL_ITEMS.find(i =>
    location.pathname === i.to || location.pathname.startsWith(i.to + '/')
  )

  // Auto-scroll active tab to center on mobile — only if out of view
  useEffect(() => {
    if (!tabsRef.current || !activeItem) return
    
    const activeButton = tabsRef.current.querySelector(
      `button[data-path="${activeItem.to}"]`
    ) as HTMLElement | null
    
    if (!activeButton) return

    // Check if button is already visible in the scroll container
    const container = tabsRef.current
    const buttonLeft = activeButton.offsetLeft
    const buttonRight = buttonLeft + activeButton.offsetWidth
    const containerScrollLeft = container.scrollLeft
    const containerWidth = container.clientWidth

    const isVisible = 
      buttonLeft >= containerScrollLeft && 
      buttonRight <= containerScrollLeft + containerWidth

    // Only scroll if button is NOT fully visible
    if (!isVisible) {
      activeButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeItem])

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
                <p className="text-caption font-bold text-casa-muted uppercase tracking-widest px-2 mb-1.5">
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
                              <p className="text-caption text-casa-muted mt-0.5 md:block truncate hidden">{item.desc}</p>
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
        {/* Mobile horizontal tabs (replaces back button + menu) */}
        <div className="md:hidden border-b border-casa-border bg-casa-surface flex-shrink-0">
          {/* Tabs header */}
          <div className="px-4 py-3 flex items-center justify-between border-b border-casa-border/50">
            <h2 className="font-semibold text-body-sm text-casa-navy">Settings</h2>
          </div>
          
          {/* Scrollable tabs */}
          <div
            ref={tabsRef}
            className="overflow-x-auto scrollbar-hide flex"
            style={{ scrollBehavior: 'smooth' }}
          >
            {ALL_ITEMS.map((item) => (
              <button
                key={item.to}
                data-path={item.to}
                onClick={() => navigate(item.to)}
                className={cn(
                  'px-4 py-3 text-body-sm font-medium whitespace-nowrap flex-shrink-0 border-b-2 transition-all',
                  activeItem?.to === item.to
                    ? 'border-casa-gold text-casa-gold'
                    : 'border-transparent text-casa-muted hover:text-casa-navy'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        
        {/* Desktop title */}
        <div className="hidden md:block px-5 py-5 border-b border-casa-border bg-casa-surface flex-shrink-0">
          <h1 className="font-display text-display-sm text-casa-navy">{activeItem?.label || 'Settings'}</h1>
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
