import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { cn } from '../../utils/cn'
import { StatusDot } from './StatusDot'

export interface HeroCardProps extends Omit<HTMLMotionProps<'div'>, 'title' | 'children'> {
  /** Text or element displayed in the top status badge (e.g. "Starts in 15m", "Happening Now", "Leave in 18m"). */
  statusText?: string
  /** Variant of the status dot indicator. */
  statusVariant?: 'active' | 'warning' | 'gold' | 'neutral' | 'info'
  /** Time badge on top right (e.g. "3:30 PM" or "All Day"). */
  timeBadge?: ReactNode
  /** Main event or hero title. */
  title: ReactNode
  /** Subtitle or location line. */
  subtitle?: ReactNode
  /** Slot for progress / timeline bar (e.g. JourneyProgressBar). */
  timeline?: ReactNode
  /** Slot for passenger/member avatars. */
  avatars?: ReactNode
  /** Slot for action buttons (e.g. "Leave Now", "Directions"). */
  actions?: ReactNode
  /** Whether the card shows the ambient gold blur reflection. */
  ambientGlow?: boolean
  /** Optional custom child content. */
  children?: ReactNode
}

/**
 * Luxury Hero Focus Card — established in the Calm Kiosk for high-priority
 * next-up appointments and ambient focus. Features dark slate gradient,
 * gold ambient glow blur, and responsive touch layout.
 */
export const HeroCard = forwardRef<HTMLDivElement, HeroCardProps>(function HeroCard(
  {
    statusText,
    statusVariant = 'active',
    timeBadge,
    title,
    subtitle,
    timeline,
    avatars,
    actions,
    ambientGlow = true,
    className,
    children,
    onClick,
    ...rest
  },
  ref,
) {
  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                e.currentTarget.click()
              }
            }
          : undefined
      }
      className={cn(
        'w-full rounded-container p-6 sm:p-7 bg-gradient-to-br from-casa-navy via-slate-900 to-slate-950 text-white border border-white/10 shadow-hero-dark relative overflow-hidden group',
        onClick && 'cursor-pointer transition-all duration-200 hover:border-white/20',
        className,
      )}
      {...rest}
    >
      {/* Background ambient glow */}
      {ambientGlow && (
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-96 h-96 bg-casa-gold/10 rounded-full blur-3xl pointer-events-none"
        />
      )}

      <div className="relative z-10">
        {/* Top bar: Status dot + label + Time badge */}
        {(statusText || timeBadge) && (
          <div className="flex items-center justify-between gap-2 mb-4">
            {statusText && (
              <div className="flex items-center gap-2">
                <StatusDot variant={statusVariant} size="md" />
                <span className="text-caption font-bold uppercase tracking-widest text-casa-gold">
                  {statusText}
                </span>
              </div>
            )}
            {timeBadge && (
              <span className="text-caption text-white/80 font-mono bg-white/10 px-3 py-1 rounded-full border border-white/10">
                {timeBadge}
              </span>
            )}
          </div>
        )}

        {/* Title */}
        <h2 className="font-display text-display-md sm:text-display-lg font-bold tracking-tight text-white casa-heading-on-dark mb-2 leading-tight">
          {title}
        </h2>

        {/* Subtitle / Location */}
        {subtitle && (
          <div className="text-body-sm sm:text-body text-white/80 mb-4 font-normal flex items-center gap-2 flex-wrap">
            {subtitle}
          </div>
        )}

        {/* Journey / Ambient Timeline Progress Bar */}
        {timeline && (
          <div className="mb-5">
            {timeline}
          </div>
        )}

        {/* Bottom bar: Avatars + Action buttons or custom children */}
        {(avatars || actions || children) && (
          <div className="pt-4 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            {avatars && <div className="flex items-center gap-3">{avatars}</div>}
            {actions && <div className="flex items-center gap-2">{actions}</div>}
            {children}
          </div>
        )}
      </div>
    </motion.div>
  )
})
