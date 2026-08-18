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

  const gradTlId = `casa-copilot-grad-tl-${id}`
  const gradTrId = `casa-copilot-grad-tr-${id}`
  const gradBrId = `casa-copilot-grad-br-${id}`
  const gradBlId = `casa-copilot-grad-bl-${id}`
  const gradSatId = `casa-copilot-grad-sat-${id}`
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
          {/* Top-Left Facet: High-reflection Champagne Silk */}
          <linearGradient id={gradTlId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(255, 253, 248)" />
            <stop offset="60%" stopColor="rgb(249, 234, 203)" />
            <stop offset="100%" stopColor="rgb(230, 200, 124)" />
          </linearGradient>

          {/* Top-Right Facet: Radiant Classic Amber Gold */}
          <linearGradient id={gradTrId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(247, 227, 181)" />
            <stop offset="50%" stopColor="rgb(229, 195, 98)" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" />
          </linearGradient>

          {/* Bottom-Right Facet: Deep Antique Bronze Gold Shadow */}
          <linearGradient id={gradBrId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(212, 175, 55)" />
            <stop offset="50%" stopColor="rgb(184, 142, 40)" />
            <stop offset="100%" stopColor="rgb(122, 91, 40)" />
          </linearGradient>

          {/* Bottom-Left Facet: Warm Mid-Tone Gold */}
          <linearGradient id={gradBlId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(232, 202, 117)" />
            <stop offset="50%" stopColor="rgb(201, 162, 56)" />
            <stop offset="100%" stopColor="rgb(158, 123, 36)" />
          </linearGradient>

          {/* Satellite Starlet Gold Gradient */}
          <linearGradient id={gradSatId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(255, 255, 255)" />
            <stop offset="40%" stopColor="rgb(253, 240, 208)" />
            <stop offset="80%" stopColor="rgb(229, 195, 98)" />
            <stop offset="100%" stopColor="rgb(212, 175, 55)" />
          </linearGradient>

          {/* Specular Shimmer Sheen Ribbon */}
          <linearGradient id={gradSheenId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="rgb(255, 255, 255)" stopOpacity="0" />
            <stop offset="35%" stopColor="rgb(255, 253, 245)" stopOpacity="0.3" />
            <stop offset="50%" stopColor="rgb(255, 255, 255)" stopOpacity="0.95" />
            <stop offset="65%" stopColor="rgb(255, 244, 208)" stopOpacity="0.4" />
            <stop offset="100%" stopColor="rgb(255, 255, 255)" stopOpacity="0" />
          </linearGradient>

          {/* Precise Vector Star Clipping Mask for Internal Shimmer */}
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
          <circle cx="12" cy="12" r="10" stroke={`url(#${gradTrId})`} strokeWidth="0.75" strokeDasharray="3 4" fill="none" opacity="0.6" />
          <circle cx="12" cy="2" r="1" fill="rgb(255, 255, 255)" />
          <circle cx="22" cy="12" r="0.8" fill="rgb(248, 228, 183)" />
          <circle cx="12" cy="22" r="1" fill="rgb(212, 175, 55)" />
        </g>

        {/* The Main 4-Pointed Faceted Star Constellation */}
        <g className="copilot-main-star">
          {/* Facet 1: Top-Left */}
          <path
            className="copilot-facet copilot-facet-tl"
            d="M 12 2 C 12 7.2 7.2 12 3 12 L 12 12 Z"
            fill={`url(#${gradTlId})`}
          />

          {/* Facet 2: Top-Right */}
          <path
            className="copilot-facet copilot-facet-tr"
            d="M 12 2 C 12 7.2 16.8 12 21 12 L 12 12 Z"
            fill={`url(#${gradTrId})`}
          />

          {/* Facet 3: Bottom-Right */}
          <path
            className="copilot-facet copilot-facet-br"
            d="M 12 12 L 21 12 C 16.8 12 12 16.8 12 22 Z"
            fill={`url(#${gradBrId})`}
          />

          {/* Facet 4: Bottom-Left */}
          <path
            className="copilot-facet copilot-facet-bl"
            d="M 12 12 L 12 22 C 12 16.8 7.2 12 3 12 Z"
            fill={`url(#${gradBlId})`}
          />

          {/* Hairline Facet Division Bevel Lines */}
          <g className="copilot-facet-lines">
            <line x1="12" y1="2.2" x2="12" y2="21.8" />
            <line x1="3.2" y1="12" x2="20.8" y2="12" />
          </g>

          {/* Luminous Center Light Aperture Dot */}
          <circle className="copilot-center-core" cx="12" cy="12" r="1.1" />
        </g>

        {/* Companion Satellite Starlet (Top Right) */}
        <path
          className="copilot-satellite-star"
          d="M 19.5 1.5 C 19.5 3.1 18.1 4.5 16.5 4.5 C 18.1 4.5 19.5 5.9 19.5 7.5 C 19.5 5.9 20.9 4.5 22.5 4.5 C 20.9 4.5 19.5 3.1 19.5 1.5 Z"
          fill={`url(#${gradSatId})`}
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
