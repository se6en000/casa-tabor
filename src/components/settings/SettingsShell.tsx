import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState, useMemo } from 'react'
import {
  Users, Sun, MessageSquare, Bot, Activity,
  BookmarkCheck, Layers, ChevronRight, LineChart, Brain,
  Palette, ShoppingCart, Lock, LayoutGrid, ChevronLeft, ChefHat,
} from 'lucide-react'
import { cn } from '../../utils/cn'
import BounceScroll from '../shared/BounceScroll'
import { Button, Heading, MasterDetailLayout, SegmentedControl, Text } from '../ui'
import MobileSettingsHome from '../mobile/MobileSettingsHome'

// ── Nav structure ──────────────────────────────────────────────────────────

const HOUSEHOLD_GROUPS = [
  {
    label: 'Visual & Display',
    items: [
      { to: '/settings/display', icon: Sun,           label: 'Appearance & Themes', desc: 'Palettes, text size, room tone' },
      { to: '/settings/art-mode', icon: Palette,      label: 'Art Mode',            desc: 'Art feed, photos, screensaver' },
    ],
  },
  {
    label: 'Home & Places',
    items: [
      { to: '/settings/places',  icon: BookmarkCheck, label: 'Places & Directory',  desc: 'Home address, places & contacts' },
    ],
  },
  {
    label: 'Kitchen & Food',
    items: [
      { to: '/settings/food-profile', icon: ChefHat, label: 'Kitchen & Pantry',     desc: 'Dietary goals, budget & pantry stock' },
    ],
  },
  {
    label: 'Family & Memory',
    items: [
      { to: '/settings/family',  icon: Users,         label: 'Family Members',      desc: 'Profiles, colors, routines' },
      { to: '/settings/memory',  icon: Brain,         label: 'Memory',              desc: 'Household preferences & projects' },
    ],
  },
  {
    label: 'Connected Services',
    items: [
      { to: '/settings/google',  icon: Layers,        label: 'Google Services',     desc: 'Calendar sync + Gmail' },
      { to: '/settings/sms',     icon: MessageSquare, label: 'Notifications',       desc: 'SMS briefings & alerts' },
    ],
  },
]

const ADVANCED_GROUPS = [
  {
    label: 'AI Engine & Routing',
    items: [
      { to: '/settings/ai',      icon: Bot,           label: 'AI Provider & Models', desc: 'Vendor, model routing, API key' },
      { to: '/settings/ai/shortcuts', icon: Bot,      label: 'AI Shortcuts',        desc: 'Action Button and Apple Shortcut setup' },
    ],
  },
  {
    label: 'System Telemetry & Costs',
    items: [
      { to: '/settings/status',  icon: Activity,      label: 'Cost & Token Dashboard', desc: 'AI usage & billing reconciliation' },
      { to: '/settings/analytics', icon: LineChart,   label: 'Orchestration & Graph Health', desc: 'Pipeline telemetry, sub-engine status & graph' },
      { to: '/settings/grocery-intelligence', icon: ShoppingCart, label: 'Grocery Intelligence', desc: 'Taxonomy quality & dedupe signals' },
    ],
  },
  {
    label: 'Developer & Diagnostics',
    items: [
      { to: '/settings/design-system', icon: LayoutGrid, label: 'Design System Reference', desc: 'Component tokens & visual audits' },
      { to: '/settings/admin-ops', icon: Lock,        label: 'Admin Operations',    desc: 'PIN-gated bulk operations' },
    ],
  },
]

const HOUSEHOLD_ITEMS = HOUSEHOLD_GROUPS.flatMap(g => g.items)
const ADVANCED_ITEMS = ADVANCED_GROUPS.flatMap(g => g.items)
const ALL_ITEMS = [...HOUSEHOLD_ITEMS, ...ADVANCED_ITEMS]

const MODE_OPTIONS = [
  { value: 'household', label: 'Household' },
  { value: 'advanced', label: 'Advanced' },
] as const

// ── Shell ──────────────────────────────────────────────────────────────────

export default function SettingsShell() {
  const location = useLocation()
  const navigate = useNavigate()
  const tabsRef = useRef<HTMLDivElement>(null)

  // Determine mode from current route
  const isAdvancedRoute = useMemo(() => {
    return ADVANCED_ITEMS.some(i => location.pathname === i.to || location.pathname.startsWith(i.to + '/'))
  }, [location.pathname])

  const [mode, setMode] = useState<'household' | 'advanced'>(isAdvancedRoute ? 'advanced' : 'household')

  // Keep mode in sync when route changes
  useEffect(() => {
    if (isAdvancedRoute && mode !== 'advanced') {
      setMode('advanced')
    } else if (!isAdvancedRoute && location.pathname !== '/settings' && mode !== 'household') {
      setMode('household')
    }
  }, [isAdvancedRoute, location.pathname, mode])

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

  const currentGroups = mode === 'advanced' ? ADVANCED_GROUPS : HOUSEHOLD_GROUPS
  const currentItems = mode === 'advanced' ? ADVANCED_ITEMS : HOUSEHOLD_ITEMS

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
            <div className="px-5 py-4 border-b border-casa-border flex-shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <Heading role="display-sm">Settings</Heading>
                {mode === 'advanced' && (
                  <span className="text-2xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-casa-gold/20 text-casa-navy">
                    Diagnostics
                  </span>
                )}
              </div>

              <SegmentedControl
                aria-label="Settings tier mode"
                value={mode}
                options={MODE_OPTIONS}
                onChange={(val) => {
                  const nextMode = val as 'household' | 'advanced'
                  setMode(nextMode)
                  if (nextMode === 'advanced' && !isAdvancedRoute) {
                    navigate('/settings/ai')
                  } else if (nextMode === 'household' && isAdvancedRoute) {
                    navigate('/settings/display')
                  }
                }}
                fullWidth
              />
            </div>

            <BounceScroll className="flex-1">
              <nav className="px-3 py-3 space-y-5">
                {currentGroups.map(group => (
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
                                ? 'bg-casa-gold/10 text-casa-gold font-semibold'
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
                Household Hub
              </Button>
              <div className="flex items-center gap-2 min-w-0 pr-2">
                {mode === 'advanced' && (
                  <span className="text-2xs font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-casa-gold/20 text-casa-navy shrink-0">
                    Adv
                  </span>
                )}
                <span className="text-caption font-semibold text-casa-navy truncate">
                  {activeItem?.label || 'Settings'}
                </span>
              </div>
            </div>
            
            {/* Scrollable tabs for active mode */}
            <div
              ref={tabsRef}
              className="overflow-x-auto scroll-smooth scrollbar-hide flex settings-tabs border-t border-casa-border/40"
            >
              {currentItems.map((item) => (
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
            <div className="settings-surface mx-auto w-full max-w-page-wide px-page-gutter py-section-gap pb-36">
              <Outlet />
            </div>
          </BounceScroll>
        </>
      )}
    />
  )
}
