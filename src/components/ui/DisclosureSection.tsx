import { useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface DisclosureSectionProps {
  title: string
  summary?: ReactNode
  icon?: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
  className?: string
}

export function DisclosureSection({
  title,
  summary,
  icon,
  children,
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  className,
}: DisclosureSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen)
  const open = controlledOpen ?? internalOpen
  const toggle = () => {
    const next = !open
    if (controlledOpen === undefined) setInternalOpen(next)
    onOpenChange?.(next)
  }

  return (
    <section className={cn('border-b border-casa-divider', className)}>
      <button
        type="button"
        className="flex min-h-control w-full items-center gap-3 px-6 py-4 text-left"
        aria-expanded={open}
        onClick={toggle}
      >
        {icon && <span className="shrink-0 text-casa-muted">{icon}</span>}
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-content-heading">{title}</span>
          {summary && <span className="mt-0.5 block truncate text-body-sm text-casa-muted">{summary}</span>}
        </span>
        <ChevronDown size={20} className={cn('shrink-0 text-casa-muted transition-transform', open && 'rotate-180')} />
      </button>
      {open && <div className="px-6 pb-5">{children}</div>}
    </section>
  )
}
