import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef } from 'react'
import {
  Users, Sun, MessageSquare, Bot, Home, Activity,
  BookmarkCheck, Layers, ChevronRight, Music2, LineChart, Bug, Brain,
  Palette, ShoppingCart, Lock, LayoutGrid, ChevronLeft,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import BounceScroll from '../shared/BounceScroll'
import { Button, Heading, MasterDetailLayout, Text } from '../ui'
import MobileSettingsHome from '../mobile/MobileSettingsHome'

// ── Nav structure ──────────────────────────────────────────────────────────

const NAV_GROUPS = [
  {
    label: 'Visual & Display',
    items: [
      { to: '/settings/display', icon: Sun,           label: 'Appearance & Display', desc: 'Palettes, text size, room tone, and sensors' },
      { to: '/settings/art-mode', icon: Palette,      label: 'Art Mode',            desc: 'Art feed, rotation cadence, and display behavior' },
    ],
  },
  {
    label: 'Home & Content',
    items: [
      { to: '/settings/home',    icon: Home,          label: 'Home & Profile',      desc: 'Address, home screen layout' },
      { to: '/settings/places',  icon: BookmarkCheck, label: 'Saved Places',        desc: 'Locations & people nicknames' },
      { to: '/settings/pantry-inventory', icon: ShoppingCart, label: 'Pantry Inventory', desc: 'Stock levels and low-inventory thresholds' },
    ],
  },
  {
    label: 'Household',
    items: [
      { to: '/settings/family',  icon: Users,         label: 'Family',              desc: 'Members, colors, roles' },
      { to: '/settings/memory', icon: Brain,          label: 'Memory',               desc: 'Personal, household, and food preferences' },
    ],
  },
  {
    label: 'Connections',
    items: [
      { to: '/settings/google',  icon: Layers,        label: 'Google Services',     desc: 'Calendar sync + Gmail' },
      { to: '/settings/grocery-intelligence', icon: ShoppingCart, label: 'Grocery Intelligence', desc: 'Smart aisle ordering and scan preferences' },
      { to: '/settings/music',   icon: Music2,        label: 'Spotify / Music',     desc: 'Connect music playback' },
      { to: '/settings/ai',      icon: Bot,           label: 'AI Provider',         desc: 'Vendor, model, API key' },
      { to: '/settings/ai/shortcuts', icon: Bot,      label: 'AI Shortcuts',        desc: 'Action Button and Apple Shortcut setup' },
      { to: '/settings/bug-tracker', icon: Bug,       label: 'Bug Tracker',         desc: 'Capture and triage defects' },
      { to: '/settings/sms',     icon: MessageSquare, label: 'Notifications',       desc: 'SMS briefings & alerts' },
    ],
  },
  {
    label: 'System',
    items: [
      { to: '/settings/analytics', icon: LineChart,     label: 'Data & Analytics',    desc: 'Orchestration and graph health' },
      { to: '/settings/status',  icon: Activity,      label: 'Status Dashboard',    desc: 'AI usage and cost' },
      { to: '/settings/admin-ops', icon: Lock,        label: 'Admin Operations',    desc: 'Mass calendar operations (PIN required)' },
    ],
  },
  {
    label: 'Developer & Diagnostics',
    items: [
      { to: '/settings/design-system', icon: LayoutGrid, label: 'Design System Reference', desc: 'Read-only components, tokens, and device validation' },
    ],
  },
]

const ALL_ITEMS = NAV_GROUPS.flatMap(g => g.items)

// ── Shell ──────────────────────────────────────────────────────────────────

export default function SettingsShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const tabsRef = useRef<HTMLDivElement>(null)

  // On mobile: are we looking at the root list or a detail page?
  const isRoot = location.pathname === '/settings'

  // Redirect /settings → first item on desktop (no-op on mobile since we show MobileSettingsHome)
  useEffect(() => {
    if (location.pathname === '/settings') {
      if (window.innerWidth >= 1024) {
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

    const container = tabsRef.current
    const buttonLeft = activeButton.offsetLeft
    const buttonRight = buttonLeft + activeButton.offsetWidth
    const containerScrollLeft = container.scrollLeft
    const containerWidth = container.clientWidth

    const isVisible = 
      buttonLeft >= containerScrollLeft && 
      buttonRight <= containerScrollLeft + containerWidth

    if (!isVisible) {
      activeButton.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center',
      })
    }
  }, [activeItem])

  return (
    <MasterDetailLayout
      showMasterOnMobile={isRoot}
      showDetailOnMobile={!isRoot}
      master={(
        <>
          {/* ── Mobile Dedicated Settings Hub (< md) ── */}
          <div className="md:hidden w-full h-full overflow-y-auto">
            <MobileSettingsHome />
          </div>

          {/* ── Desktop Settings Sidebar (>= md) ── */}
          <div className="hidden md:flex flex-col h-full">
            <div className="px-5 py-5 border-b border-casa-border flex-shrink-0">
              <Heading role="display-sm">Settings</Heading>
            </div>

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
                              'flex items-center gap-3 px-3 py-2.5 rounded-lg min-h-control transition-colors group',
                              isActive
                                ? 'bg-casa-gold/10 text-casa-gold'
                                : 'text-casa-navy hover:bg-casa-bg'
                            )}
                          >
                            {({ isActive }) => (
                              <>
                                <item.icon size={16} className={cn('flex-shrink-0', isActive ? 'text-casa-gold' : 'text-casa-muted group-hover:text-casa-navy')} />
                                <div className="flex-1 min-w-0">
                                  <Text role="body-sm" className="font-medium leading-none">{item.label}</Text>
                                  <Text role="caption" muted className="mt-0.5 md:block truncate hidden">{item.desc}</Text>
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
          </div>
        </>
      )}
      detail={(
        <>
          {/* ── Mobile subpage header with Back button ── */}
          <div className="md:hidden border-b border-casa-border bg-casa-surface flex-shrink-0">
            <div className="px-3 py-2.5 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => navigate('/settings')}
                leadingIcon={<ChevronLeft size={18} />}
                className="font-bold text-caption text-casa-gold"
              >
                Household Settings
              </Button>
              <span className="text-caption font-semibold text-casa-navy truncate pr-2">
                {activeItem?.label || 'Settings'}
              </span>
            </div>
            
            {/* Scrollable tabs */}
            <div
              ref={tabsRef}
              className="overflow-x-auto scroll-smooth scrollbar-hide flex settings-tabs border-t border-casa-border/40"
            >
              {ALL_ITEMS.map((item) => (
                <Button
                  key={item.to}
                  data-path={item.to}
                  variant="ghost"
                  onClick={() => navigate(item.to)}
                  className={cn(
                    'min-h-[36px] px-3 py-2 text-caption font-medium whitespace-nowrap flex-shrink-0 transition-all outline-none',
                    activeItem?.to === item.to
                      ? 'bg-casa-gold/15 text-casa-gold font-bold rounded-lg'
                      : 'text-casa-muted hover:text-casa-navy'
                  )}
                >
                  {item.label}
                </Button>
              ))}
            </div>
          </div>
          
          {/* Page content */}
          <BounceScroll className="flex-1">
            <div className="settings-surface mx-auto w-full max-w-page-narrow px-page-gutter py-section-gap pb-28">
              <Outlet />
            </div>
          </BounceScroll>
        </>
      )}
    />
  )
}
