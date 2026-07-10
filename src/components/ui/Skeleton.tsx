import type { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'

export function Skeleton({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-button bg-casa-divider', className)} {...rest} />
}

export function SkeletonRow() {
  return (
    <div className="flex min-h-control items-center gap-3" aria-label="Loading row">
      <Skeleton className="size-control rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-5 w-2/3" />
        <Skeleton className="h-4 w-1/3" />
      </div>
    </div>
  )
}
