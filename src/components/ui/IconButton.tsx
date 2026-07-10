import { forwardRef } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { iconButtonClassName, type IconButtonSize, type IconButtonVariant } from '../../design-system/variants.mjs'

export interface IconButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  variant?: IconButtonVariant
  size?: IconButtonSize
  icon: ReactNode
  /**
   * Required — icon-only controls must always have an accessible name.
   * If a visible tooltip/title is also desired, pass the same string via `title`.
   */
  'aria-label': string
}

/**
 * Square, density-aware icon-only control (uses size-control* tokens so the
 * tap target always meets the 44/48px kiosk minimum, even though the icon
 * itself renders much smaller). Always requires aria-label since there is
 * no visible text label for assistive tech to read.
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant, size, icon, className, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(iconButtonClassName({ variant, size }), className)}
      {...rest}
    >
      {icon}
    </button>
  )
})
