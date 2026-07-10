import { forwardRef, useId } from 'react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react'
import { Check, Minus } from 'lucide-react'
import { cn } from '../../utils/cn'

type LabeledControlProps = {
  label: ReactNode
  description?: ReactNode
  invalid?: boolean
}

export interface SwitchProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'onChange'>, LabeledControlProps {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, onCheckedChange, label, description, invalid, disabled, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const controlId = id ?? autoId
  return (
    <div className={cn('flex min-h-control items-center justify-between gap-4', className)}>
      <div>
        <label htmlFor={controlId} className="text-body-sm font-semibold text-casa-text">{label}</label>
        {description && <p className="text-caption text-casa-muted">{description}</p>}
      </div>
      <button
        {...rest}
        ref={ref}
        id={controlId}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        onClick={() => onCheckedChange(!checked)}
        className={cn(
          'casa-switch-track relative h-control-sm shrink-0 rounded-pill border p-1 outline-none transition-colors',
          'focus-visible:ring-2 focus-visible:ring-casa-gold focus-visible:ring-offset-2 disabled:opacity-40',
          checked ? 'border-casa-success bg-casa-success' : 'border-casa-control-border bg-casa-toggle-track',
          invalid && 'border-casa-error',
        )}
      >
        <span className={cn(
          'casa-switch-thumb block aspect-square h-full rounded-full bg-casa-surface shadow-card transition-transform',
          checked && 'is-checked',
        )} />
      </button>
    </div>
  )
})

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, LabeledControlProps {
  indeterminate?: boolean
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, invalid, indeterminate, checked, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const controlId = id ?? autoId
  return (
    <label htmlFor={controlId} className={cn('flex min-h-control items-center gap-3', className)}>
      <input ref={ref} id={controlId} type="checkbox" checked={checked} className="peer sr-only" {...rest} />
      <span className={cn(
        'flex size-control-sm shrink-0 items-center justify-center rounded-button border-2 bg-casa-surface text-casa-on-dark',
        'peer-focus-visible:ring-2 peer-focus-visible:ring-casa-gold peer-disabled:opacity-40',
        (checked || indeterminate) ? 'border-casa-navy bg-casa-navy' : 'border-casa-control-border',
        invalid && 'border-casa-error',
      )}>
        {indeterminate ? <Minus size={18} /> : checked ? <Check size={18} /> : null}
      </span>
      <span>
        <span className="block text-body-sm font-semibold text-casa-text">{label}</span>
        {description && <span className="block text-caption text-casa-muted">{description}</span>}
      </span>
    </label>
  )
})

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>, LabeledControlProps {}

export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
  { label, description, invalid, checked, className, id, ...rest },
  ref,
) {
  const autoId = useId()
  const controlId = id ?? autoId
  return (
    <label htmlFor={controlId} className={cn('flex min-h-control items-center gap-3', className)}>
      <input ref={ref} id={controlId} type="radio" checked={checked} className="peer sr-only" {...rest} />
      <span className={cn(
        'flex size-control-sm shrink-0 items-center justify-center rounded-full border-2 bg-casa-surface',
        'peer-focus-visible:ring-2 peer-focus-visible:ring-casa-gold peer-disabled:opacity-40',
        checked ? 'border-casa-navy' : 'border-casa-control-border',
        invalid && 'border-casa-error',
      )}>
        {checked && <span className="casa-radio-dot rounded-full bg-casa-navy" />}
      </span>
      <span>
        <span className="block text-body-sm font-semibold text-casa-text">{label}</span>
        {description && <span className="block text-caption text-casa-muted">{description}</span>}
      </span>
    </label>
  )
})
