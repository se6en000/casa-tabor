import type { HTMLAttributes, ReactNode } from 'react'
import { Card, Heading, Text } from '../ui'
import { cn } from '../../utils/cn'

export interface SettingsSectionProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
}

export function SettingsSection({ title, description, action, children, className, ...rest }: SettingsSectionProps) {
  return (
    <Card className={cn('space-y-4', className)} {...rest}>
      {(title || description || action) && (
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            {title && <Heading role="heading">{title}</Heading>}
            {description && <Text role="body-sm" muted>{description}</Text>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Card>
  )
}
