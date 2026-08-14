import { forwardRef } from 'react'
import type { ReactNode } from 'react'
import { motion, type HTMLMotionProps } from 'framer-motion'
import { MapPin } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface MemberColorDot {
  id: string
  name?: string
  color?: string
}

export interface ScheduleStreamItemProps extends Omit<HTMLMotionProps<'div'>, 'title'> {
  /** Time text or range (e.g. "3:30 PM – 4:30 PM", or "All Day"). */
  timeText: string
  /** Main event or task title. */
  title: string
  /** Subtitle or location. */
  location?: string
  /** List of assigned members with color hexes. */
  members?: MemberColorDot[]
  /** Whether the item is currently synchronized/highlighted across panes. */
  isHighlighted?: boolean
  /** Optional icon or category element. */
  icon?: ReactNode
}

/**
 * Canonical Schedule Stream Item for timelines and agenda streams.
 * Features live hover/focus highlight synchronization, member dots,
 * and 44px+ touch targets.
 */
export const ScheduleStreamItem = forwardRef<HTMLDivElement, ScheduleStreamItemProps>(
  function ScheduleStreamItem(
    {
      timeText,
      title,
      location,
      members = [],
      isHighlighted = false,
      icon,
      className,
      onClick,
      ...rest
    },
    ref,
  ) {
    return (
      <motion.div
        ref={ref}
        layout
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
          'p-4 rounded-widget border transition-all cursor-pointer relative group min-h-[52px] flex flex-col justify-center',
          isHighlighted
            ? 'border-casa-navy bg-casa-navy text-white shadow-md'
            : 'border-casa-border/50 bg-casa-bg/50 hover:border-casa-gold hover:bg-casa-surface',
          className,
        )}
        {...rest}
      >
        <div className="flex items-center justify-between mb-1.5 gap-2">
          <span
            className={cn(
              'font-mono text-caption font-semibold truncate',
              isHighlighted ? 'text-casa-gold' : 'text-casa-muted',
            )}
          >
            {timeText}
          </span>

          {members.length > 0 && (
            <div className="flex items-center gap-1.5 shrink-0">
              {members.map((m) => (
                <span
                  key={m.id}
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{
                    backgroundColor: m.color ?? 'var(--color-casa-gold)',
                  }}
                  title={m.name}
                  aria-label={m.name}
                />
              ))}
            </div>
          )}
        </div>

        <h3
          className={cn(
            'text-body-sm font-semibold leading-tight line-clamp-2',
            isHighlighted ? 'text-white' : 'text-casa-navy',
          )}
        >
          {title}
        </h3>

        {(location || icon) && (
          <div
            className={cn(
              'mt-1.5 flex items-center gap-1.5 text-caption font-medium',
              isHighlighted ? 'text-white/70' : 'text-casa-text-secondary',
            )}
          >
            {icon || <MapPin size={13} className="shrink-0 text-casa-gold" />}
            <span className="truncate">{location}</span>
          </div>
        )}
      </motion.div>
    )
  },
)
