import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { chipClassName, type ChipSize, type ChipTone } from '../../design-system/variants.mjs'

type ChipBaseProps = {
  tone?: ChipTone
  size?: ChipSize
  selected?: boolean
  icon?: ReactNode
  children: ReactNode
  className?: string
}

export type ChipProps =
  | (ChipBaseProps & { onClick: NonNullable<ButtonHTMLAttributes<HTMLButtonElement>['onClick']> } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, keyof ChipBaseProps | 'onClick'>)
  | (ChipBaseProps & { onClick?: undefined } & Omit<HTMLAttributes<HTMLSpanElement>, keyof ChipBaseProps>)

/**
 * Small pill used for filters, status badges, and selectable tags.
 * Renders a <button> (with focus-visible + selected ring) when `onClick`
 * is provided, otherwise a plain <span> badge — so static/interactive usage
 * both stay semantically correct without a separate component.
 */
export function Chip({ tone, size, selected, icon, children, className, onClick, ...rest }: ChipProps) {
  const cls = cn(chipClassName({ tone, size, selected, interactive: !!onClick }), className)

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={selected}
        className={cls}
        {...(rest as ButtonHTMLAttributes<HTMLButtonElement>)}
      >
        {icon}
        {children}
      </button>
    )
  }

  return (
    <span className={cls} {...(rest as HTMLAttributes<HTMLSpanElement>)}>
      {icon}
      {children}
    </span>
  )
}
