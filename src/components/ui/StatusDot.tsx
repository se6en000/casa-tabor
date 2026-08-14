import type { HTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import {
  statusDotClassName,
  type StatusDotSize,
  type StatusDotVariant,
} from '../../design-system/variants.mjs'

export interface StatusDotProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: StatusDotVariant
  size?: StatusDotSize
  pulse?: boolean
  label?: string
}

/**
 * Canonical live indicator dot for status and presence.
 * Supports active (emerald pulse), warning (amber pulse), gold (AI copilot),
 * neutral (muted), and info (teal) variants.
 */
export function StatusDot({
  variant = 'active',
  size = 'md',
  pulse = true,
  label,
  className,
  ...rest
}: StatusDotProps) {
  return (
    <span
      role={label ? 'status' : undefined}
      aria-label={label}
      className={cn(statusDotClassName({ variant, size, pulse }), className)}
      {...rest}
    />
  )
}
