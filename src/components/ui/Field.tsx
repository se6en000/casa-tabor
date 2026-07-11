import { cloneElement, forwardRef, isValidElement, useId } from 'react'
import type { AriaAttributes, InputHTMLAttributes, ReactElement, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'
import { cn } from '../../utils/cn'
import { fieldControlClassName } from '../../design-system/variants.mjs'

/**
 * Minimal prop contract every Field-compatible control (Input/Textarea/
 * Select) must accept. Reuses React's own AriaAttributes type for the aria-*
 * keys so this stays structurally identical to InputHTMLAttributes et al.
 * (avoids a TS2320 "not identical" conflict when those interfaces extend
 * both this contract and the native *HTMLAttributes).
 */
interface FieldControlProps extends Pick<AriaAttributes, 'aria-invalid' | 'aria-describedby'> {
  id?: string
  invalid?: boolean
}

export interface FieldProps {
  label?: ReactNode
  hint?: ReactNode
  error?: ReactNode
  required?: boolean
  /** Overrides the auto-generated (useId) id shared between label/control/hint/error. */
  htmlFor?: string
  className?: string
  children: ReactElement<FieldControlProps>
}

/**
 * Accessible label + control + hint/error wrapper. Wires id/aria-invalid/
 * aria-describedby onto its single child control automatically via
 * cloneElement, so callers just write:
 *   <Field label="Name" error={errors.name}><Input ... /></Field>
 * The child must accept the FieldControlProps contract — Input/Textarea/
 * Select below already do.
 */
export function Field({ label, hint, error, required, htmlFor, className, children }: FieldProps) {
  const autoId = useId()
  const id = children.props.id ?? htmlFor ?? autoId
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        invalid: error ? true : children.props.invalid,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': [children.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
      })
    : children

  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <label htmlFor={id} className="block text-body-sm font-medium text-content-heading">
          {label}
          {required && <span className="text-casa-error ml-0.5">*</span>}
        </label>
      )}
      {control}
      {hint && <p id={hintId} className="text-caption text-casa-muted">{hint}</p>}
      {error && <p id={errorId} className="text-caption text-casa-error">{error}</p>}
    </div>
  )
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldControlProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid}
      className={cn(fieldControlClassName({ invalid }), className)}
      {...rest}
    />
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldControlProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ invalid, className, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid}
      className={cn(fieldControlClassName({ invalid }), 'resize-none py-3 min-h-0', className)}
      {...rest}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, FieldControlProps {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ invalid, className, ...rest }, ref) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid}
      className={cn(fieldControlClassName({ invalid }), className)}
      {...rest}
    />
  )
})
