import { useId } from 'react'
import type { MouseEvent } from 'react'
import { cn } from '../../utils/cn'

export type CopilotIconState = 'idle' | 'hover' | 'proactive' | 'processing' | 'listening' | 'success'
export type CopilotShimmerSpeed = 'normal' | 'fast' | 'slow'
export type CopilotGlowIntensity = 'normal' | 'vivid' | 'subtle'

export interface CopilotIconProps {
  /** Current state of the Copilot icon */
  state?: CopilotIconState
  /** Size in pixels (width and height, default: 20) */
  size?: number
  /** Speed of the gold shimmer sweep */
  shimmerSpeed?: CopilotShimmerSpeed
  /** Glow intensity */
  glowIntensity?: CopilotGlowIntensity
  /** Additional CSS class names */
  className?: string
  /** Accessible label */
  ariaLabel?: string
  /** Whether the icon is purely decorative (default: true) */
  ariaHidden?: boolean
  /** Click handler */
  onClick?: (e: MouseEvent<HTMLDivElement>) => void
}

/**
 * Animated SVG Flat Design Copilot Icon
 * 
 * Haute luxury AI indicator featuring:
 * - 4-faceted vector diamond star with concave curvature matching the reference design
 * - Central luminous light aperture dot
 * - Companion satellite starlet with animated twinkle
 * - Specular gold gradient shimmer sheen sweep
 * - Multi-layered auric glow lighting
 * - Multi-state support: idle, hover, proactive, processing, listening, success
 */
export function CopilotIcon({
  state = 'idle',
  size = 20,
  shimmerSpeed = 'normal',
  glowIntensity = 'normal',
  className = '',
  ariaLabel = 'Copilot AI',
  ariaHidden = true,
  onClick,
}: CopilotIconProps) {
  const rawId = useId()
  const id = rawId.replace(/:/g, '-')

  const gradStarId = `casa-copilot-grad-star-${id}`
  const gradSheenId = `casa-copilot-grad-sheen-${id}`
  const clipId = `casa-copilot-star-clip-${id}`

  const stateClass = `copilot-state-${state}`
  const speedClass = shimmerSpeed !== 'normal' ? `copilot-speed-${shimmerSpeed}` : ''
  const glowClass = glowIntensity !== 'normal' ? `copilot-glow-${glowIntensity}` : ''

  const sizeClass =
    size === 16 ? 'size-4' :
    size === 18 ? 'size-4.5' :
    size === 22 ? 'size-5.5' :
    size === 24 ? 'size-6' :
    size === 28 ? 'size-7' :
    size === 32 ? 'size-8' :
    size === 40 ? 'size-10' :
    size === 48 ? 'size-12' :
    'size-5'

  return (
    <div
      className={cn(
        'copilot-icon-container relative inline-flex items-center justify-center shrink-0 select-none align-middle',
        sizeClass,
        stateClass,
        speedClass,
        glowClass,
        className
      )}
      onClick={onClick}
      aria-label={!ariaHidden ? ariaLabel : undefined}
      aria-hidden={ariaHidden}
      role={!ariaHidden ? 'img' : undefined}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="copilot-svg-root block w-full h-full overflow-visible transition-all duration-300"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
      >
        <defs>
          {/* Luminous Solid Metallic Gold Gradient */}
          <linearGradient id={gradStarId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(250, 232, 170)" />
            <stop offset="45%" stopColor="rgb(228, 192, 105)" />
            <stop offset="100%" stopColor="rgb(201, 169, 110)" />
          </linearGradient>

          {/* Specular Shimmer Sheen Ribbon */}
          <linearGradient id={gradSheenId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(255, 255, 255)" stopOpacity="0" />
            <stop offset="35%" stopColor="rgb(255, 253, 245)" stopOpacity="0.35" />
            <stop offset="50%" stopColor="rgb(255, 255, 255)" stopOpacity="0.95" />
            <stop offset="65%" stopColor="rgb(255, 244, 208)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(255, 255, 255)" stopOpacity="0" />
          </linearGradient>

          {/* Precise Flat Vector Star Clipping Mask for Internal Shimmer */}
          <clipPath id={clipId}>
            <path d="M 12 2 C 12 7.2 7.2 12 3 12 C 7.2 12 12 16.8 12 22 C 12 16.8 16.8 12 21 12 C 16.8 12 12 7.2 12 2 Z" />
            <path d="M 19.5 1.5 C 19.5 3.1 18.1 4.5 16.5 4.5 C 18.1 4.5 19.5 5.9 19.5 7.5 C 19.5 5.9 20.9 4.5 22.5 4.5 C 20.9 4.5 19.5 3.1 19.5 1.5 Z" />
          </clipPath>
        </defs>

        {/* Acoustic / Beacon Ripple Wave Rings (Active in Listening & Proactive) */}
        <circle className="copilot-ripple-ring copilot-ripple-ring-1" cx="12" cy="12" r="4" />
        <circle className="copilot-ripple-ring copilot-ripple-ring-2" cx="12" cy="12" r="4" />
        <circle className="copilot-ripple-ring copilot-ripple-ring-3" cx="12" cy="12" r="4" />

        {/* Prismatic Orbital Ring (Active in Processing) */}
        <g className="copilot-orbital-spinner">
          <circle cx="12" cy="12" r="10" stroke={`url(#${gradStarId})`} strokeWidth="0.75" strokeDasharray="3 4" fill="none" opacity="0.6" />
          <circle cx="12" cy="2" r="1" fill="rgb(255, 255, 255)" />
          <circle cx="22" cy="12" r="0.8" fill="rgb(248, 228, 183)" />
          <circle cx="12" cy="22" r="1" fill="rgb(201, 169, 110)" />
        </g>

        {/* The Clean Flat 4-Pointed Sparkle Star */}
        <g className="copilot-main-star">
          <path
            className="copilot-flat-star"
            d="M 12 2 C 12 7.2 7.2 12 3 12 C 7.2 12 12 16.8 12 22 C 12 16.8 16.8 12 21 12 C 16.8 12 12 7.2 12 2 Z"
            fill={`url(#${gradStarId})`}
          />
        </g>

        {/* Companion Satellite Starlet (Top Right) */}
        <path
          className="copilot-satellite-star"
          d="M 19.5 1.5 C 19.5 3.1 18.1 4.5 16.5 4.5 C 18.1 4.5 19.5 5.9 19.5 7.5 C 19.5 5.9 20.9 4.5 22.5 4.5 C 20.9 4.5 19.5 3.1 19.5 1.5 Z"
          fill={`url(#${gradStarId})`}
        />

        {/* Sweeping Specular Gold Shimmer Masked to Star Contours */}
        <g clipPath={`url(#${clipId})`}>
          <rect
            className="copilot-shimmer-sweep"
            x="-10"
            y="-10"
            width="44"
            height="44"
            fill={`url(#${gradSheenId})`}
          />
        </g>

        {/* Sparkle Burst Particles (Active in Success) */}
        <g className="copilot-sparkle-burst">
          <circle cx="6" cy="6" r="1" fill="rgb(255, 255, 255)" />
          <circle cx="18" cy="18" r="0.9" fill="rgb(255, 255, 255)" />
          <circle cx="5" cy="17" r="0.8" fill="rgb(248, 228, 183)" />
          <path d="M 6 5 L 6.8 5.8 L 6 6.6 L 5.2 5.8 Z" fill="rgb(255, 255, 255)" />
          <path d="M 18 17 L 18.8 17.8 L 18 18.6 L 17.2 17.8 Z" fill="rgb(255, 255, 255)" />
        </g>
      </svg>
    </div>
  )
}
