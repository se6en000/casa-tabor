import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { segmentedControlClassName, segmentedControlItemClassName } from '../../design-system/variants.mjs'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly SegmentedControlOption<T>[]
  onChange: (value: T) => void
  'aria-label': string
  fullWidth?: boolean
  className?: string
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const enabledOptions = options.filter((option) => !option.disabled)

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentValue: T) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || enabledOptions.length < 2) return
    event.preventDefault()
    const currentIndex = Math.max(0, enabledOptions.findIndex((option) => option.value === currentValue))
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? enabledOptions.length - 1
        : (currentIndex + (event.key === 'ArrowRight' ? 1 : -1) + enabledOptions.length) % enabledOptions.length
    const next = enabledOptions[nextIndex]
    onChange(next.value)
    event.currentTarget.parentElement
      ?.querySelector<HTMLButtonElement>(`[data-segment-value="${CSS.escape(next.value)}"]`)
      ?.focus()
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn(segmentedControlClassName({ fullWidth }), className)}
    >
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            data-segment-value={option.value}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, option.value)}
            className={segmentedControlItemClassName({ selected })}
          >
            {option.icon}
            <span>{option.label}</span>
          </button>
        )
      })}
    </div>
  )
}
