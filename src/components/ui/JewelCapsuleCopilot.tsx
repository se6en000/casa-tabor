import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'

export interface JewelCapsuleCopilotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  isProactive?: boolean
  badgeCount?: number
  showShortcut?: boolean
  label?: string
}

/**
 * Dynamic Jewel Capsule Copilot Button
 * Haute luxury AI trigger with continuous 3D fluid orb physics,
 * brushed gold hairline bezel, and glassmorphic elevation.
 */
export const JewelCapsuleCopilot = forwardRef<HTMLButtonElement, JewelCapsuleCopilotProps>(
  function JewelCapsuleCopilot(
    {
      isActive = false,
      isProactive = false,
      badgeCount,
      showShortcut = false,
      label,
      className,
      onClick,
      ...rest
    },
    ref
  ) {
    const displayLabel = label ?? (isActive ? 'Close' : 'Copilot')

    return (
      <motion.button
        ref={ref}
        type="button"
        data-sidecar-trigger="true"
        data-ai-trigger="true"
        data-sidecar-loadable="true"
        onClick={onClick}
        animate={{
          boxShadow: isActive
            ? '0 0 16px var(--tw-shadow-color, rgba(201,169,110,0.65))'
            : isProactive
            ? [
                '0 0 6px var(--tw-shadow-color, rgba(201,169,110,0.3))',
                '0 0 16px var(--tw-shadow-color, rgba(201,169,110,0.65))',
                '0 0 6px var(--tw-shadow-color, rgba(201,169,110,0.3))',
              ]
            : '0 2px 8px var(--tw-shadow-color, rgba(201,169,110,0.22))',
        }}
        transition={{
          duration: 3,
          repeat: isProactive && !isActive ? Infinity : 0,
          ease: 'easeInOut',
        }}
        className={cn(
          'group relative inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-full transition-all duration-300 select-none outline-none overflow-visible',
          'bg-gradient-to-r from-casa-surface-subtle via-casa-accent-subtle to-casa-accent-soft',
          'border border-casa-gold/40 hover:border-casa-gold backdrop-blur-md',
          'text-casa-navy font-bold text-caption tracking-wide',
          isActive && 'ring-2 ring-casa-gold/80 bg-casa-accent-soft shadow-xs',
          className
        )}
        title={isActive ? 'Close Copilot' : 'Open AI Copilot'}
        aria-label={isActive ? 'Close Copilot' : 'Open AI Copilot'}
        aria-expanded={isActive}
        {...(rest as any)}
      >
        {/* 3D Living Liquid Orb */}
        <span
          className={cn(
            'relative w-4 h-4 rounded-full shrink-0 flex items-center justify-center transition-transform duration-300',
            'bg-gradient-to-br from-amber-100 via-casa-gold to-amber-800',
            'shadow-xs',
            isActive ? 'animate-spin' : 'animate-[spin_4.5s_linear_infinite]',
            'group-hover:scale-110'
          )}
          aria-hidden="true"
        >
          {/* Specular Highlight */}
          <span className="absolute top-[15%] left-[20%] w-[35%] h-[35%] rounded-full bg-white/90 blur-[0.3px]" />
        </span>

        {/* Proactive Unread Badge */}
        {isProactive && badgeCount !== undefined && badgeCount > 0 && (
          <span
            className="absolute -top-1 left-4 bg-casa-gold text-white text-2xs font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center border-2 border-casa-surface shadow-xs"
            aria-label={`${badgeCount} unread proactive items`}
          >
            {badgeCount}
          </span>
        )}

        {/* Text Label */}
        <span className="hidden sm:inline leading-none font-bold text-casa-navy">
          {displayLabel}
        </span>

        {/* Optional ⌘K Keyboard Shortcut Badge */}
        {showShortcut && (
          <span
            className="hidden md:inline-flex items-center justify-center text-2xs font-bold text-casa-navy bg-casa-gold/15 border border-casa-gold/30 px-1.5 py-0.5 rounded-sm leading-none"
            aria-hidden="true"
          >
            ⌘K
          </span>
        )}
      </motion.button>
    )
  }
)
