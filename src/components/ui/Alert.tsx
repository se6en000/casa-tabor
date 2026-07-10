import type { HTMLAttributes, ReactNode } from 'react'
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { cn } from '../../utils/cn'
import { IconButton } from './IconButton'

export type AlertTone = 'info' | 'success' | 'warning' | 'danger'

const TONE_CLASSES: Record<AlertTone, string> = {
  info: 'border-casa-info/35 bg-casa-info-soft text-casa-info-strong',
  success: 'border-casa-success/35 bg-casa-success-soft text-casa-success-strong',
  warning: 'border-casa-warning/35 bg-casa-warning/10 text-casa-warning',
  danger: 'border-casa-error/35 bg-casa-error/10 text-casa-error',
}

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertCircle }

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone
  title: ReactNode
  onDismiss?: () => void
}

export function Alert({ tone = 'info', title, onDismiss, children, className, ...rest }: AlertProps) {
  const Icon = ICONS[tone]
  return (
    <div role={tone === 'danger' ? 'alert' : 'status'} className={cn('flex items-start gap-3 rounded-card border p-4', TONE_CLASSES[tone], className)} {...rest}>
      <Icon size={22} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="text-body-sm font-bold">{title}</p>
        {children && <div className="mt-1 text-body-sm text-casa-text-secondary">{children}</div>}
      </div>
      {onDismiss && <IconButton icon={<X size={18} />} aria-label="Dismiss alert" size="sm" variant="ghost" onClick={onDismiss} />}
    </div>
  )
}
