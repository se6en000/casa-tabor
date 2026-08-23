import { useId } from 'react'
import { cn } from '../../utils/cn'

interface MaisonCrestProps {
  size?: number
  isWarm?: boolean
  className?: string
}

/**
 * Maison Tabor Official French-Belgian Luxury Crest
 * Features:
 * - Handcrafted vector French Fleur-de-lis crown
 * - Double gold engraved coin bezel with luxury radial backdrop
 * - High-contrast, bold classical serif 'T' monogram
 */
export default function MaisonCrest({
  size = 46,
  isWarm = false,
  className,
}: MaisonCrestProps) {
  const rawId = useId()
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const goldGradId = `maison-gold-${id}`
  const bgGradId = `maison-bg-${id}`
  const glowId = `maison-glow-${id}`

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn('flex-shrink-0 transition-transform duration-200 ease-out select-none', className)}
      role="img"
      aria-label="Maison Tabor Estate Crest"
    >
      <defs>
        {/* Rich Metallic Brushed Gold Gradient */}
        <linearGradient id={goldGradId} x1="10%" y1="5%" x2="90%" y2="95%">
          <stop offset="0%" stopColor="#FFF2B2" />
          <stop offset="25%" stopColor="#E5C158" />
          <stop offset="60%" stopColor="#C49A32" />
          <stop offset="100%" stopColor="#F9DF88" />
        </linearGradient>

        {/* Enamel Background Medallion Gradient (Dark vs. Warm Travertine) */}
        <radialGradient id={bgGradId} cx="50%" cy="50%" r="50%">
          {isWarm ? (
            <>
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="55%" stopColor="#F6F0E6" />
              <stop offset="100%" stopColor="#E5D9C8" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#283B58" />
              <stop offset="60%" stopColor="#18253A" />
              <stop offset="100%" stopColor="#0A111C" />
            </>
          )}
        </radialGradient>

        {/* Subtle Crest Glow */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.5" floodColor="#C5A059" floodOpacity={isWarm ? "0.25" : "0.5"} />
        </filter>
      </defs>

      {/* ── Main Coin Medallion Outer Ring ── */}
      <circle
        cx="50"
        cy="50"
        r="46"
        fill={`url(#${bgGradId})`}
        stroke={`url(#${goldGradId})`}
        strokeWidth="2.75"
      />

      {/* ── Engraved Dotted Inner Bezel ── */}
      <circle
        cx="50"
        cy="50"
        r="41"
        fill="none"
        stroke={`url(#${goldGradId})`}
        strokeWidth="1"
        strokeDasharray="2.5 3"
        opacity={isWarm ? "0.7" : "0.65"}
      />

      {/* ── Vector French Fleur-de-lis Crest Crown (Heroic Top Apex) ── */}
      <g transform="translate(50, 18) scale(0.78)" filter={`url(#${glowId})`}>
        {/* Center spear petal */}
        <path
          d="M 0,-15 C 3.2,-8 5.5,-2 0,4.5 C -5.5,-2 -3.2,-8 0,-15 Z"
          fill={`url(#${goldGradId})`}
        />
        {/* Left curving wing petal */}
        <path
          d="M -1.5,-0.5 C -7,-2 -13,-6.5 -12,-11 C -10.5,-12.5 -7.5,-11.5 -5.5,-7.5 C -3.8,-3.8 -2,-1.5 -1.5,-0.5 Z"
          fill={`url(#${goldGradId})`}
        />
        {/* Right curving wing petal */}
        <path
          d="M 1.5,-0.5 C 7,-2 13,-6.5 12,-11 C 10.5,-12.5 7.5,-11.5 5.5,-7.5 C 3.8,-3.8 2,-1.5 1.5,-0.5 Z"
          fill={`url(#${goldGradId})`}
        />
        {/* Horizontal gold tie ring */}
        <rect
          x="-7"
          y="1"
          width="14"
          height="2.8"
          rx="1.4"
          fill={`url(#${goldGradId})`}
        />
        {/* Bottom base tri-leaf */}
        <path
          d="M 0,3.2 C 2.8,6 3.5,8.5 0,11.5 C -3.5,8.5 -2.8,6 0,3.2 Z"
          fill={`url(#${goldGradId})`}
        />
      </g>

      {/* ── Bold High-Society Classical Serif 'T' Monogram (Vector Cut) ── */}
      <path
        d="M 23,30 L 77,30 L 77,37.5 C 77,37.5 73,37.5 71.5,37.5 C 69,37.5 68,36 66,35 L 55.5,35 L 55.5,73 L 64.5,73 C 66.5,73 68,71.5 68.5,69.5 L 69,69 L 69,78 L 31,78 L 31,69 L 31.5,69.5 C 32,71.5 33.5,73 35.5,73 L 44.5,73 L 44.5,35 L 34,35 C 32,36 31,37.5 28.5,37.5 C 27,37.5 23,37.5 23,37.5 Z"
        fill={`url(#${goldGradId})`}
        filter={`url(#${glowId})`}
      />
    </svg>
  )
}
