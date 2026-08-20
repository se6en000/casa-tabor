import { forwardRef } from 'react'
import type { ElementType, HTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, Trash2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { Alert } from './Alert'
import { Button } from './Button'
import { Card } from './Card'
import { EmptyState } from './EmptyState'
import { Modal } from './Modal'
import { SkeletonRow } from './Skeleton'
import { Heading, Text } from './Typography'

export interface PageHeaderProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  icon?: ElementType
  actions?: ReactNode
}

export function PageHeader({ title, description, eyebrow, icon: Icon, actions, className, ...rest }: PageHeaderProps) {
  return (
    <header className={cn('flex min-w-0 flex-col items-stretch gap-3 sm:flex-row sm:items-start sm:justify-between', className)} {...rest}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon && (
          <span className="flex size-control shrink-0 items-center justify-center rounded-full border border-casa-border bg-surface-page text-action-accent">
            <Icon size={18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && <Text role="caption" className="font-semibold uppercase tracking-wide text-content-muted">{eyebrow}</Text>}
          {title && <Heading role="display-sm">{title}</Heading>}
          {description && <Text role="body-sm" muted className="mt-1">{description}</Text>}
        </div>
      </div>
      {actions && <div className="flex min-w-0 flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  )
}

export interface SectionHeaderProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode
  description?: ReactNode
  icon?: ElementType
  action?: ReactNode
  compact?: boolean
}

export function SectionHeader({ title, description, icon: Icon, action, compact = false, className, ...rest }: SectionHeaderProps) {
  return (
    <div className={cn('flex min-w-0 items-start justify-between gap-3', className)} {...rest}>
      <div className={cn('flex min-w-0 items-start', compact ? 'gap-2' : 'gap-3')}>
        {Icon && (
          <span className={cn(
            'flex shrink-0 items-center justify-center text-action-accent',
            compact ? 'size-control-sm' : 'size-control rounded-full border border-casa-border bg-surface-page',
          )}>
            <Icon size={compact ? 15 : 18} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {compact
            ? <Text role="caption" className="font-semibold uppercase tracking-wide text-content-muted">{title}</Text>
            : <Heading role="heading">{title}</Heading>}
          {description && <Text role="body-sm" muted>{description}</Text>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}

export interface ContentSectionProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  children: ReactNode
  density?: 'standard' | 'dense'
  surface?: 'card' | 'plain'
}

export function ContentSection({
  title,
  description,
  action,
  children,
  density = 'standard',
  surface = 'card',
  className,
  ...rest
}: ContentSectionProps) {
  const content = (
    <>
      {(title || description || action) && (
        <SectionHeader title={title} description={description} action={action} compact={density === 'dense'} />
      )}
      <div className={cn(density === 'dense' ? 'divide-y divide-casa-divider' : 'space-y-4')}>{children}</div>
    </>
  )

  if (surface === 'plain') {
    return <section className={cn(density === 'dense' ? 'space-y-2' : 'space-y-4', className)} {...rest}>{content}</section>
  }

  return (
    <Card role="region" padding={density === 'dense' ? 'sm' : 'md'} className={cn(density === 'dense' ? 'space-y-2' : 'space-y-4', className)} {...rest}>
      {content}
    </Card>
  )
}

export interface ThreeRailLayoutProps extends HTMLAttributes<HTMLDivElement> {
  navigation: ReactNode
  primary: ReactNode
  secondary: ReactNode
}

export function ThreeRailLayout({ navigation, primary, secondary, className, ...rest }: ThreeRailLayoutProps) {
  return (
    <div className={cn('flex h-full min-w-0 overflow-hidden bg-surface-page', className)} {...rest}>
      <div className="hidden basis-1/5 lg:block">{navigation}</div>
      <div className="min-w-0 flex-1">{primary}</div>
      <div className="hidden basis-1/4 lg:block">{secondary}</div>
    </div>
  )
}

export const PrimaryRail = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(function PrimaryRail({ className, ...rest }, ref) {
  return <div ref={ref} className={cn('min-w-0 flex-1', className)} {...rest} />
})

export function SecondaryRail({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <aside className={cn('hidden basis-5/16 min-w-0 shrink-0 lg:flex', className)} {...rest} />
}

export interface MasterDetailLayoutProps extends HTMLAttributes<HTMLDivElement> {
  master: ReactNode
  detail: ReactNode
  showMasterOnMobile?: boolean
  showDetailOnMobile?: boolean
  masterClassName?: string
  detailClassName?: string
}

export function MasterDetailLayout({
  master,
  detail,
  showMasterOnMobile = true,
  showDetailOnMobile = true,
  masterClassName,
  detailClassName,
  className,
  ...rest
}: MasterDetailLayoutProps) {
  return (
    <div className={cn('flex h-full min-w-0 flex-1 overflow-hidden', className)} {...rest}>
      <aside className={cn(
        'w-full shrink-0 flex-col overflow-hidden border-r border-casa-border bg-surface-raised md:flex md:w-64 lg:w-72',
        showMasterOnMobile ? 'flex' : 'hidden',
        masterClassName,
      )}>
        {master}
      </aside>
      <div className={cn(
        'min-w-0 flex-1 flex-col overflow-hidden md:flex',
        showDetailOnMobile ? 'flex' : 'hidden',
        detailClassName,
      )}>
        {detail}
      </div>
    </div>
  )
}

type PageFeedbackProps = {
  state: 'loading' | 'empty' | 'error' | 'success'
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  icon?: ReactNode
  rows?: number
  className?: string
}

export function PageFeedback({ state, title, description, action, icon, rows = 3, className }: PageFeedbackProps) {
  if (state === 'loading') {
    return (
      <div role="status" aria-label={typeof title === 'string' ? title : 'Loading'} className={cn('space-y-3 rounded-card border border-casa-border bg-surface-raised p-card-padding', className)}>
        {Array.from({ length: rows }, (_, index) => <SkeletonRow key={index} />)}
      </div>
    )
  }

  if (state === 'success') {
    return (
      <Alert tone="success" title={title ?? 'Complete'} className={className}>
        {description}
        {action && <div className="mt-3">{action}</div>}
      </Alert>
    )
  }

  return (
    <EmptyState
      tone={state}
      icon={icon}
      title={title ?? (state === 'error' ? 'Could not load' : 'Nothing here yet')}
      description={description}
      action={action}
      className={className}
    />
  )
}

export interface WorkflowActionsProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

export function WorkflowActions({ children, className, ...rest }: WorkflowActionsProps) {
  return <div className={cn('flex flex-col-reverse gap-2 border-t border-casa-divider pt-4 sm:flex-row sm:justify-end', className)} {...rest}>{children}</div>
}

export interface ConfirmationDialogProps {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  title: ReactNode
  description?: ReactNode
  confirmLabel?: ReactNode
  cancelLabel?: ReactNode
  destructive?: boolean
  loading?: boolean
  error?: ReactNode
  icon?: ReactNode
}

export function ConfirmationDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  loading = false,
  error,
  icon,
}: ConfirmationDialogProps) {
  const defaultIcon = destructive ? (
    <Trash2 size={22} className="text-action-danger" aria-hidden="true" />
  ) : (
    <AlertTriangle size={22} className="text-action-accent" aria-hidden="true" />
  )

  const renderedIcon = icon !== undefined ? icon : defaultIcon

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={typeof title === 'string' ? title : 'Confirm'}
      showHeader={false}
      closeOnBackdrop={!loading}
      closeOnEscape={!loading}
      size="sm"
      panelClassName="overflow-hidden border border-casa-border/80 bg-surface-raised p-6 shadow-modal rounded-modal sm:max-w-md"
      contentClassName="p-0"
    >
      <div className="flex flex-col items-center text-center sm:items-start sm:text-left">
        {renderedIcon && (
          <div
            className={cn(
              'mb-4 flex size-12 shrink-0 items-center justify-center rounded-full',
              destructive
                ? 'bg-action-danger/10 text-action-danger ring-4 ring-action-danger/5'
                : 'bg-surface-subtle text-action-accent ring-4 ring-surface-subtle/50',
            )}
          >
            {renderedIcon}
          </div>
        )}
        <h3 className="font-display text-display-sm font-medium text-content-heading leading-tight">
          {title}
        </h3>
        {description && (
          <p className="mt-2 text-body-sm text-content-muted leading-relaxed">
            {description}
          </p>
        )}
        {error && (
          <p role="alert" className="mt-3 text-body-sm font-medium text-action-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button
            variant="secondary"
            onClick={onClose}
            disabled={loading}
            className="w-full sm:w-auto min-w-[100px]"
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            className="w-full sm:w-auto min-w-[120px]"
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

