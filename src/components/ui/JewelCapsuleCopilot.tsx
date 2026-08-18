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
 * Luxury Multi-Faceted AI Sparkle Icon
 * Unmistakable AI constellation indicator with gem-cut facets,
 * specular core, and breathing ambient micro-animations.
 */
function LuxuryAIIcon({ isActive, isProactive }: { isActive?: boolean; isProactive?: boolean }) {
  return (
    <span className="relative w-4.5 h-4.5 shrink-0 flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
      <motion.svg
        viewBox="0 0 20 20"
        className="w-full h-full overflow-visible"
        animate={
          isActive
            ? {
                scale: 1.05,
                filter: 'drop-shadow(0 0 8px rgba(212,175,55,0.85)) drop-shadow(0 0 14px rgba(201,169,110,0.5))',
              }
            : isProactive
            ? {
                scale: [1, 1.15, 1],
                filter: [
                  'drop-shadow(0 0 3px rgba(212,175,55,0.4))',
                  'drop-shadow(0 0 10px rgba(212,175,55,0.95))',
                  'drop-shadow(0 0 3px rgba(212,175,55,0.4))',
                ],
              }
            : {
                scale: [1, 1.07, 1],
                filter: [
                  'drop-shadow(0 0 2px rgba(212,175,55,0.25))',
                  'drop-shadow(0 0 6px rgba(212,175,55,0.65))',
                  'drop-shadow(0 0 2px rgba(212,175,55,0.25))',
                ],
              }
        }
        transition={{
          duration: isActive ? 0.3 : isProactive ? 1.8 : 3.2,
          repeat: isActive ? 0 : Infinity,
          ease: 'easeInOut',
        }}
        aria-hidden="true"
      >
        <defs>
          {/* Top-Left Facet: Champagne Silk Highlight */}
          <linearGradient id="casa-ai-facet-hl" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(255, 253, 248)" />
            <stop offset="100%" stopColor="rgb(245, 226, 179)" />
          </linearGradient>
          {/* Top-Right Facet: Royal Amber Gold */}
          <linearGradient id="casa-ai-facet-mid" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(246, 226, 182)" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" />
          </linearGradient>
          {/* Bottom-Right Facet: Deep Antique Gold */}
          <linearGradient id="casa-ai-facet-deep" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(184, 142, 40)" />
            <stop offset="100%" stopColor="rgb(122, 91, 40)" />
          </linearGradient>
          {/* Bottom-Left Facet: Warm Shaded Gold */}
          <linearGradient id="casa-ai-facet-warm" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(212, 175, 55)" />
            <stop offset="100%" stopColor="rgb(158, 123, 36)" />
          </linearGradient>
          {/* Satellite Sparkle */}
          <linearGradient id="casa-ai-sparkle-sat" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="white" />
            <stop offset="60%" stopColor="rgb(246, 226, 182)" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" />
          </linearGradient>
        </defs>

        {/* Primary 4-Point Faceted AI Diamond Star */}
        <g>
          {/* Top-Left Facet */}
          <path d="M9 2 C9 6.2 5.6 9.8 1.5 10 L9 10 Z" fill="url(#casa-ai-facet-hl)" />
          {/* Top-Right Facet */}
          <path d="M9 2 C9 6.2 12.4 9.8 16.5 10 L9 10 Z" fill="url(#casa-ai-facet-mid)" />
          {/* Bottom-Right Facet */}
          <path d="M9 10 L16.5 10 C12.4 10.2 9 13.8 9 18 Z" fill="url(#casa-ai-facet-deep)" />
          {/* Bottom-Left Facet */}
          <path d="M9 10 L9 18 C9 13.8 5.6 10.2 1.5 10 Z" fill="url(#casa-ai-facet-warm)" />
          {/* Facet Hairline Accents */}
          <line x1="9" y1="2" x2="9" y2="18" stroke="rgba(255,255,255,0.4)" strokeWidth="0.4" />
          <line x1="1.5" y1="10" x2="16.5" y2="10" stroke="rgba(255,255,255,0.3)" strokeWidth="0.4" />
        </g>

        {/* Secondary Satellite Sparkle (Twinkling Companion Starlet) */}
        <motion.path
          d="M15.5 1.5 C15.5 2.8 14.4 3.8 13 4 C14.4 4.2 15.5 5.2 15.5 6.5 C15.5 5.2 16.6 4.2 18 4 C16.6 3.8 15.5 2.8 15.5 1.5 Z"
          fill="url(#casa-ai-sparkle-sat)"
          animate={
            isActive
              ? { scale: 1.1, opacity: 1 }
              : {
                  scale: [0.85, 1.25, 0.85],
                  opacity: [0.65, 1, 0.65],
                }
          }
          transition={{
            duration: isActive ? 0.3 : 2.4,
            repeat: isActive ? 0 : Infinity,
            ease: 'easeInOut',
            delay: 0.3,
          }}
        />

        {/* Specular Core Highlight */}
        <circle cx="9" cy="10" r="0.9" fill="white" opacity="0.95" />
      </motion.svg>
    </span>
  )
}

/**
 * Dynamic Jewel Capsule Copilot Button
 * Haute luxury AI trigger with faceted diamond sparkle constellation,
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
    const displayLabel = label ?? (isActive ? 'Close' : 'Casa AI')

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
        title={isActive ? 'Close Casa AI' : 'Open Casa AI'}
        aria-label={isActive ? 'Close Casa AI' : 'Open Casa AI'}
        aria-expanded={isActive}
        {...(rest as any)}
      >
        {/* Luxury AI Sparkle Indicator */}
        <LuxuryAIIcon isActive={isActive} isProactive={isProactive} />

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

