import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../utils/cn'
import { buttonClassName, type ButtonSize, type ButtonVariant } from '../../design-system/variants.mjs'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  /** Shows a spinner and disables interaction while keeping the button's footprint stable. */
  loading?: boolean
  /** Icon rendered before the label (hidden while loading). */
  leadingIcon?: ReactNode
  /** Icon rendered after the label (hidden while loading). */
  trailingIcon?: ReactNode
  /** Layout overrides for the label/icon wrapper, useful for rich button content. */
  contentClassName?: string
}

/**
 * Canonical touch-first action button. Density-aware sizing comes from the
 * min-h-control* tokens (44/48px kiosk minimums) — see src/design-system/tokens.mjs.
 * Loading state keeps the button's box size stable so surrounding layout
 * never reflows while an async action is in flight.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, size, fullWidth, loading = false, disabled, leadingIcon, trailingIcon, contentClassName, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClassName({ variant, size, fullWidth, loading }), className)}
      {...rest}
    >
      {loading && (
        <Loader2 size={16} className="absolute animate-spin" aria-hidden="true" />
      )}
      <span className={cn('inline-flex items-center justify-center gap-2', contentClassName, loading && 'invisible')}>
        {leadingIcon}
        {children}
        {trailingIcon}
      </span>
    </button>
  )
})
