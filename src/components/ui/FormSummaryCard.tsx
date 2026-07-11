import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Card } from './Card'

export interface FormSummaryCardProps {
  icon?: ReactNode
  title: ReactNode
  detail?: ReactNode
  action?: ReactNode
  className?: string
}

export function FormSummaryCard({ icon, title, detail, action, className }: FormSummaryCardProps) {
  return (
    <Card padding="sm" tone="subtle" className={cn('flex min-h-control items-center gap-3', className)}>
      {icon && <span className="shrink-0 text-casa-gold">{icon}</span>}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-body font-semibold text-content-heading">{title}</span>
        {detail && <span className="mt-0.5 block truncate text-body-sm text-casa-muted">{detail}</span>}
      </span>
      {action}
    </Card>
  )
}
