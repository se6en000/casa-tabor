import type { HTMLAttributes } from 'react'
import { User } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface PersonAvatar {
  id: string
  name: string
  color?: string | null
}

export interface PersonAvatarStackProps extends HTMLAttributes<HTMLDivElement> {
  people: PersonAvatar[]
  max?: number
  size?: 'sm' | 'md' | 'lg'
  emptyLabel?: string
  /**
   * Small status dot pinned to the avatar's bottom-right corner (e.g. a `bg-casa-error`
   * urgency tone), matching the existing badge treatment in TabletSidebar/TopBar. Pass a
   * background-color utility class, not a raw color, to stay off the inline-style audit.
   * Only rendered when exactly one avatar is visible — on an overlapping stack the corner
   * position is ambiguous.
   */
  badgeClassName?: string | null
}

const sizeClass = {
  sm: 'size-7 text-caption',
  md: 'size-9 text-body-sm',
  lg: 'size-12 text-body-sm',
} as const

const overlapClass = {
  sm: '-ml-2',
  md: '-ml-2.5',
  lg: '-ml-3',
} as const

const badgeSizeClass = {
  sm: 'size-2.5',
  md: 'size-3',
  lg: 'size-3.5',
} as const

export function PersonAvatarStack({
  people,
  max = 2,
  size = 'md',
  emptyLabel = 'No person assigned',
  badgeClassName,
  className,
  ...rest
}: PersonAvatarStackProps) {
  const visible = people.slice(0, Math.max(1, max))
  const overflow = Math.max(0, people.length - visible.length)
  const label = people.length > 0
    ? people.map((person) => person?.name ?? '').filter(Boolean).join(', ')
    : emptyLabel
  const showBadge = !!badgeClassName && people.length === 1

  return (
    <div
      role="img"
      aria-label={label}
      className={cn('flex items-center', className)}
      {...rest}
    >
      {visible.map((person, index) => (
        <span
          key={person.id}
          aria-hidden="true"
          className={cn(
            'relative flex shrink-0 items-center justify-center rounded-full border-2 border-casa-surface font-bold text-white shadow-card',
            sizeClass[size],
            index > 0 && overlapClass[size],
          )}
          style={{ backgroundColor: person.color || 'var(--color-casa-navy)' }}
        >
          {person?.name?.[0]?.toUpperCase() || '?'}
          {showBadge && (
            <span
              className={cn(
                'absolute -bottom-0.5 -right-0.5 rounded-full border-2 border-casa-surface',
                badgeSizeClass[size],
                badgeClassName,
              )}
            />
          )}
        </span>
      ))}
      {people.length === 0 && (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full border-2 border-casa-surface bg-casa-muted font-bold text-white shadow-card',
            sizeClass[size],
          )}
        >
          <User size={size === 'sm' ? 12 : size === 'md' ? 14 : 16} />
        </span>
      )}
      {overflow > 0 && (
        <span
          aria-hidden="true"
          className={cn(
            'flex shrink-0 items-center justify-center rounded-full border-2 border-casa-surface bg-casa-bg font-bold text-casa-muted shadow-card',
            sizeClass[size],
            overlapClass[size],
          )}
        >
          +{overflow}
        </span>
      )}
    </div>
  )
}
