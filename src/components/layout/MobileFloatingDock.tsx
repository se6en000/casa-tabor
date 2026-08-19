import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  Calendar,
  ShoppingCart,
  ChefHat,
  Settings,
  Plus,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useCalendarStore } from '../../stores/calendarStore'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui'

interface MobileFloatingDockProps {
  onOpenQuickCreate?: () => void
}

export default function MobileFloatingDock({ onOpenQuickCreate }: MobileFloatingDockProps) {
  const location = useLocation()
  const { setActiveView } = useCalendarStore()
  const { setCanvasSubmode } = useAppStore()

  const triggerHaptic = () => {
    try {
      navigator.vibrate?.(8)
    } catch {
      // Haptics optional / unsupported
    }
  }

  // 5 Tabs in exact requested order: Today / Agenda / Grocery / Cooking / More (NO BADGES)
  const navTabs = [
    {
      to: '/',
      icon: Home,
      label: 'Today',
      isActive: location.pathname === '/',
      onClick: () => {
        triggerHaptic()
        setCanvasSubmode('calm')
      },
    },
    {
      to: '/calendar',
      icon: Calendar,
      label: 'Agenda',
      isActive: location.pathname.startsWith('/calendar'),
      onClick: () => {
        triggerHaptic()
        setActiveView('today')
      },
    },
    {
      to: '/grocery',
      icon: ShoppingCart,
      label: 'Grocery',
      isActive: location.pathname.startsWith('/grocery'),
      onClick: () => triggerHaptic(),
    },
    {
      to: '/cook',
      icon: ChefHat,
      label: 'Cooking',
      isActive: location.pathname.startsWith('/cook'),
      onClick: () => triggerHaptic(),
    },
    {
      to: '/settings',
      icon: Settings,
      label: 'More',
      isActive: location.pathname.startsWith('/settings'),
      onClick: () => triggerHaptic(),
    },
  ]

  // Hide floating dock on full trips detail page
  const isHidden = location.pathname.startsWith('/trips/')

  if (isHidden) return null

  return (
    <>
      {/* ── Single-Thumb Floating Quick Add FAB (lg:hidden) ── */}
      <div className="lg:hidden fixed bottom-[calc(5.25rem+env(safe-area-inset-bottom))] right-4 z-sticky pointer-events-auto">
        <Button
          variant="ghost"
          onClick={() => {
            triggerHaptic()
            onOpenQuickCreate?.()
          }}
          aria-label="Create new event, reminder, or task"
          className="w-13 h-13 rounded-full bg-casa-gold hover:bg-amber-400 text-casa-navy p-0 flex items-center justify-center border-2 border-casa-surface shadow-[0_8px_24px_rgba(201,169,110,0.4)] active:scale-90 transition-all duration-150 cursor-pointer"
        >
          <Plus size={26} strokeWidth={2.6} className="text-casa-navy" />
        </Button>
      </div>

      {/* ── Floating Curved Island Bottom Navigation Bar (lg:hidden, ZERO BADGES) ── */}
      <nav
        aria-label="Mobile Navigation Bar"
        className="lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3.5 right-3.5 max-w-md mx-auto z-sticky bg-casa-surface/30 dark:bg-casa-surface/20 backdrop-blur-2xl border border-casa-border/40 rounded-full shadow-[0_8px_32px_rgba(0,0,0,0.06)] flex items-center justify-around px-2 py-1 transition-all duration-300 pointer-events-auto"
      >
        {navTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            onClick={tab.onClick}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[46px] py-1 rounded-full transition-all duration-200',
              tab.isActive
                ? 'text-casa-gold font-bold scale-[1.03]'
                : 'text-casa-muted hover:text-casa-navy active:scale-95'
            )}
          >
            <tab.icon size={21} strokeWidth={tab.isActive ? 2.3 : 1.8} />
            <span className="text-2xs tracking-tight leading-none mt-1 font-medium truncate">
              {tab.label}
            </span>
            {tab.isActive && (
              <motion.div
                layoutId="mobile-nav-active-dot"
                className="absolute bottom-1 w-1 h-1 rounded-full bg-casa-gold"
                transition={{ type: 'spring', stiffness: 380, damping: 30 }}
              />
            )}
          </NavLink>
        ))}
      </nav>
    </>
  )
}
