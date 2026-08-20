import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'
import { motion } from 'framer-motion'
import { cn } from '../../utils/cn'
import { CopilotIcon, type CopilotIconState } from './CopilotIcon'

export interface JewelCapsuleCopilotProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  isActive?: boolean
  isProactive?: boolean
  isProcessing?: boolean
  isListening?: boolean
  isSuccess?: boolean
  state?: CopilotIconState
  badgeCount?: number
  showShortcut?: boolean
  label?: string
  iconSize?: number
}

/**
 * Dynamic Jewel Capsule Copilot Button
 * Haute luxury AI trigger with faceted diamond sparkle constellation,
 * brushed gold hairline bezel, animated specular shimmer sheen, and glassmorphic elevation.
 */
export const JewelCapsuleCopilot = forwardRef<HTMLButtonElement, JewelCapsuleCopilotProps>(
  function JewelCapsuleCopilot(
    {
      isActive = false,
      isProactive = false,
      isProcessing = false,
      isListening = false,
      isSuccess = false,
      state,
      badgeCount,
      showShortcut = false,
      label,
      iconSize = 20,
      className,
      onClick,
      ...rest
    },
    ref
  ) {
    const displayLabel = label ?? (isActive ? 'Close' : 'Copilot')

    // Determine effective visual state
    const effectiveState: CopilotIconState =
      state ??
      (isSuccess
        ? 'success'
        : isListening
        ? 'listening'
        : isProcessing
        ? 'processing'
        : isProactive
        ? 'proactive'
        : isActive
        ? 'hover'
        : 'idle')

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
          'group relative inline-flex items-center gap-2 px-3.5 min-h-[44px] rounded-full transition-all duration-300 select-none outline-none overflow-visible cursor-pointer',
          'bg-gradient-to-r from-casa-surface-subtle via-casa-accent-subtle to-casa-accent-soft',
          'border border-casa-gold/40 hover:border-casa-gold backdrop-blur-md',
          'text-casa-navy font-bold text-caption tracking-wide',
          isActive && 'ring-2 ring-casa-gold/80 bg-casa-accent-soft shadow-xs',
          className
        )}
        title={isActive ? 'Close Copilot' : 'Open Copilot'}
        aria-label={isActive ? 'Close Copilot' : 'Open Copilot'}
        aria-expanded={isActive}
        {...(rest as any)}
      >
        {/* Luxury Animated SVG Flat Design Copilot Icon */}
        <span className="relative shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
          <CopilotIcon state={effectiveState} size={iconSize} ariaHidden={true} />
        </span>

        {/* Proactive Unread Badge */}
        {isProactive && badgeCount !== undefined && badgeCount > 0 && (
          <span
            className="absolute -top-1 left-4 bg-casa-gold text-white text-2xs font-bold min-w-[17px] h-[17px] rounded-full flex items-center justify-center border-2 border-casa-surface shadow-xs animate-bounce"
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
