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
 * - Classical Didot / Cormorant serif 'T' monogram
 */
export default function MaisonCrest({
  size = 38,
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
        <linearGradient id={goldGradId} x1="15%" y1="10%" x2="85%" y2="90%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="30%" stopColor="#D4AF37" />
          <stop offset="65%" stopColor="#B38938" />
          <stop offset="100%" stopColor="#F5D77F" />
        </linearGradient>

        {/* Enamel Background Medallion Gradient (Dark vs. Warm Travertine) */}
        <radialGradient id={bgGradId} cx="50%" cy="50%" r="50%">
          {isWarm ? (
            <>
              <stop offset="0%" stopColor="#FFFFFF" />
              <stop offset="60%" stopColor="#F7F3EC" />
              <stop offset="100%" stopColor="#EAE2D5" />
            </>
          ) : (
            <>
              <stop offset="0%" stopColor="#24344D" />
              <stop offset="60%" stopColor="#172235" />
              <stop offset="100%" stopColor="#0D1522" />
            </>
          )}
        </radialGradient>

        {/* Subtle Crest Glow */}
        <filter id={glowId} x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1" stdDeviation="1.2" floodColor="#C5A059" floodOpacity={isWarm ? "0.2" : "0.4"} />
        </filter>
      </defs>

      {/* ── Main Coin Medallion Outer Shadow ── */}
      <circle
        cx="50"
        cy="52"
        r="42"
        fill={`url(#${bgGradId})`}
        stroke={`url(#${goldGradId})`}
        strokeWidth="2"
      />

      {/* ── Engraved Dotted Inner Bezel ── */}
      <circle
        cx="50"
        cy="52"
        r="37"
        fill="none"
        stroke={`url(#${goldGradId})`}
        strokeWidth="0.85"
        strokeDasharray="2 2.5"
        opacity={isWarm ? "0.6" : "0.55"}
      />

      {/* ── Vector French Fleur-de-lis Crest Crown ── */}
      <g transform="translate(50, 19) scale(0.62)" filter={`url(#${glowId})`}>
        {/* Center spear petal */}
        <path
          d="M 0,-16 C 3,-9 5.5,-3 0,4 C -5.5,-3 -3,-9 0,-16 Z"
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
          x="-6.5"
          y="1"
          width="13"
          height="2.4"
          rx="1.2"
          fill={`url(#${goldGradId})`}
        />
        {/* Bottom base tri-leaf */}
        <path
          d="M 0,3.2 C 2.8,6 3.5,8.5 0,11.5 C -3.5,8.5 -2.8,6 0,3.2 Z"
          fill={`url(#${goldGradId})`}
        />
      </g>

      {/* ── High-Society Classical Serif 'T' Monogram ── */}
      <text
        x="50"
        y="72"
        textAnchor="middle"
        fontFamily="'Cormorant Garamond', 'Playfair Display', Georgia, serif"
        fontSize="34"
        fontWeight="700"
        fill={`url(#${goldGradId})`}
        filter={`url(#${glowId})`}
        letterSpacing="0"
      >
        T
      </text>
    </svg>
  )
}
