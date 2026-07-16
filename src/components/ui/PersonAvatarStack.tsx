import type { HTMLAttributes } from 'react'
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

export function PersonAvatarStack({
  people,
  max = 2,
  size = 'md',
  emptyLabel = 'No person assigned',
  className,
  ...rest
}: PersonAvatarStackProps) {
  const visible = people.slice(0, Math.max(1, max))
  const overflow = Math.max(0, people.length - visible.length)
  const label = people.length > 0
    ? people.map((person) => person.name).join(', ')
    : emptyLabel

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
            'flex shrink-0 items-center justify-center rounded-full border-2 border-casa-surface font-bold text-white shadow-card',
            sizeClass[size],
            index > 0 && overlapClass[size],
          )}
          style={{ backgroundColor: person.color || 'var(--color-casa-navy)' }}
        >
          {person.name[0]?.toUpperCase() || '?'}
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
          ?
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
