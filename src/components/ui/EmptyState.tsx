import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Heading, Text } from './Typography'

export interface EmptyStateProps {
  icon?: ReactNode
  title: ReactNode
  description?: ReactNode
  action?: ReactNode
  tone?: 'empty' | 'error'
  className?: string
}

export function EmptyState({ icon, title, description, action, tone = 'empty', className }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center rounded-card border border-dashed p-8 text-center', tone === 'error' ? 'border-casa-error/40 bg-casa-error/5' : 'border-casa-border bg-casa-bg', className)}>
      {icon && <div className={cn('mb-3 text-casa-muted', tone === 'error' && 'text-casa-error')}>{icon}</div>}
      <Heading role="heading">{title}</Heading>
      {description && <Text role="body-sm" muted className="mt-1 max-w-lg">{description}</Text>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
