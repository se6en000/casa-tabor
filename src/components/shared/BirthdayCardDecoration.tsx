import { cn } from '../../utils/cn'

/**
 * Festive balloon + confetti decoration for birthday event cards.
 * Purely decorative (aria-hidden, pointer-events-none) — must be placed
 * inside a `relative overflow-hidden` card container as the first child,
 * with sibling content given `relative z-10` so it paints on top.
 */
export function BirthdayCardDecoration({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-0 z-0 overflow-hidden', className)}
    >
      <svg
        className="absolute -right-3 -top-4 h-[140%] w-36 opacity-90"
        viewBox="0 0 140 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <ellipse cx="34" cy="26" rx="14" ry="18" fill="#F4A6C6" />
        <path d="M34 44 L32 68" stroke="#F4A6C6" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="64" cy="16" rx="12" ry="16" fill="#8FD3E8" />
        <path d="M64 32 L62 58" stroke="#8FD3E8" strokeWidth="1.5" strokeLinecap="round" />
        <ellipse cx="93" cy="30" rx="13" ry="17" fill="#FFD873" />
        <path d="M93 47 L95 70" stroke="#FFD873" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="18" cy="78" r="2.5" fill="#F4A6C6" />
        <circle cx="50" cy="92" r="2" fill="#8FD3E8" />
        <circle cx="76" cy="100" r="2.5" fill="#FFD873" />
        <circle cx="105" cy="66" r="2" fill="#B7E4C7" />
        <circle cx="115" cy="96" r="2.5" fill="#F4A6C6" />
        <rect x="28" y="106" width="4.5" height="4.5" rx="1" fill="#8FD3E8" transform="rotate(20 28 106)" />
        <rect x="86" y="116" width="4.5" height="4.5" rx="1" fill="#FFD873" transform="rotate(-15 86 116)" />
        <rect x="60" y="128" width="4" height="4" rx="1" fill="#F4A6C6" transform="rotate(35 60 128)" />
      </svg>
    </div>
  )
}
