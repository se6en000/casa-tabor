import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  Home,
  ShoppingCart,
  ChefHat,
  Settings,
  Plus,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import { useAppStore } from '../../stores/appStore'
import { Button } from '../ui'

interface MobileFloatingDockProps {
  onOpenQuickCreate?: () => void
}

export default function MobileFloatingDock({ onOpenQuickCreate }: MobileFloatingDockProps) {
  const location = useLocation()
  const { setCanvasSubmode } = useAppStore()
  const [isKeyboardActive, setIsKeyboardActive] = useState(false)

  // Auto-hide bottom nav when on-screen keyboard is active / input is focused
  useEffect(() => {
    const isInputElement = (el: Element | null) => {
      if (!el) return false
      const tag = el.tagName.toLowerCase()
      return tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable
    }

    const onFocusIn = (e: FocusEvent) => {
      if (isInputElement(e.target as Element)) {
        setIsKeyboardActive(true)
      }
    }

    const onFocusOut = () => {
      setTimeout(() => {
        if (!isInputElement(document.activeElement)) {
          setIsKeyboardActive(false)
        }
      }, 60)
    }

    window.addEventListener('focusin', onFocusIn)
    window.addEventListener('focusout', onFocusOut)

    return () => {
      window.removeEventListener('focusin', onFocusIn)
      window.removeEventListener('focusout', onFocusOut)
    }
  }, [])

  const triggerHaptic = () => {
    try {
      navigator.vibrate?.(8)
    } catch {
      // Haptics optional / unsupported
    }
  }

  // 4 Tabs in exact requested order: Today / Grocery / Cooking / More (NO BADGES)
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
      {/* ── Single-Thumb Floating Quick Add FAB (lg:hidden, hidden on grocery page or when keyboard is open) ── */}
      {!location.pathname.startsWith('/grocery') && !isKeyboardActive && (
        <div className="lg:hidden fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-sticky pointer-events-auto">
          <Button
            variant="ghost"
            onClick={() => {
              triggerHaptic()
              onOpenQuickCreate?.()
            }}
            aria-label="Create new event, reminder, or task"
            className="w-13 h-13 rounded-full bg-casa-navy hover:bg-slate-800 text-casa-gold p-0 flex items-center justify-center border-2 border-casa-gold/40 shadow-[0_8px_24px_rgba(27,42,74,0.35)] active:scale-90 transition-all duration-150 cursor-pointer"
          >
            <Plus size={26} strokeWidth={2.6} className="text-casa-gold" />
          </Button>
        </div>
      )}

      {/* ── Edge-Anchored Luxury Translucent Bottom Navigation Bar (lg:hidden) ── */}
      <nav
        aria-label="Mobile Navigation Bar"
        className={cn(
          'lg:hidden fixed bottom-0 left-0 right-0 z-sticky floating-dock-glass border-t border-casa-gold/30 shadow-[0_-4px_24px_rgba(27,42,74,0.06)] flex items-center justify-around px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] transition-all duration-300 pointer-events-auto',
          isKeyboardActive ? 'translate-y-full opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
        )}
      >
        {navTabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.to === '/'}
            onClick={tab.onClick}
            className={cn(
              'relative flex flex-1 flex-col items-center justify-center min-h-[46px] py-1 transition-all duration-200',
              tab.isActive
                ? 'text-casa-navy font-bold scale-[1.03]'
                : 'text-casa-navy/60 hover:text-casa-navy active:scale-95'
            )}
          >
            {/* Active Gold Tint Background Capsule */}
            {tab.isActive && (
              <motion.div
                layoutId="mobile-nav-active-pill"
                className="absolute inset-x-1 inset-y-0.5 rounded-xl bg-casa-gold/15 border border-casa-gold/30 -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
              />
            )}
            <tab.icon
              size={21}
              strokeWidth={tab.isActive ? 2.4 : 1.8}
              className={cn(
                'transition-colors duration-200',
                tab.isActive ? 'text-casa-navy' : 'text-casa-navy/65'
              )}
            />
            <span className="text-2xs tracking-tight leading-none mt-1 font-semibold truncate">
              {tab.label}
            </span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
