import { useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import {
  segmentedControlClassName,
  segmentedControlItemClassName,
  segmentedControlThumbClassName,
} from '../../design-system/variants.mjs'

export interface SegmentedControlOption<T extends string> {
  value: T
  label: ReactNode
  icon?: ReactNode
  disabled?: boolean
}

export interface SegmentedControlProps<T extends string> {
  value: T
  options: readonly [SegmentedControlOption<T>, SegmentedControlOption<T>, ...SegmentedControlOption<T>[]]
  onChange: (value: T) => void
  'aria-label': string
  fullWidth?: boolean
  disabled?: boolean
  className?: string
}

type SegmentedControlStyle = CSSProperties & {
  '--segment-count': number
  '--segment-position': number
}

export function SegmentedControl<T extends string>({
  value,
  options,
  onChange,
  'aria-label': ariaLabel,
  fullWidth = false,
  disabled = false,
  className,
}: SegmentedControlProps<T>) {
  const [dragPosition, setDragPosition] = useState<number | null>(null)
  const pointerInteraction = useRef<{ pointerId: number; startX: number; dragging: boolean } | null>(null)
  const enabledOptions = disabled ? [] : options.filter((option) => !option.disabled)
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === value))

  const pointerPosition = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return selectedIndex
    return Math.min(
      options.length - 1,
      Math.max(0, ((event.clientX - rect.left) / rect.width) * options.length - 0.5),
    )
  }

  const selectNearestEnabled = (position: number) => {
    if (enabledOptions.length === 0) return
    const nearestEnabled = enabledOptions.reduce((nearest, option) => {
      const optionIndex = options.indexOf(option)
      const nearestIndex = options.indexOf(nearest)
      return Math.abs(optionIndex - position) < Math.abs(nearestIndex - position) ? option : nearest
    })
    if (nearestEnabled.value !== value) onChange(nearestEnabled.value)
  }

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || enabledOptions.length === 0) return
    pointerInteraction.current = { pointerId: event.pointerId, startX: event.clientX, dragging: false }
  }

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteraction.current
    if (!interaction || interaction.pointerId !== event.pointerId) return
    if (!interaction.dragging) {
      if (Math.abs(event.clientX - interaction.startX) < 6) return
      interaction.dragging = true
      try {
        event.currentTarget.setPointerCapture(event.pointerId)
      } catch {
        // Pointer capture can fail in certain synthetic or detached environments
      }
    }
    const position = pointerPosition(event)
    setDragPosition(position)
    selectNearestEnabled(position)
  }

  const releasePointer = (event: PointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // Ignore
      }
    }
    pointerInteraction.current = null
    setDragPosition(null)
  }

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const interaction = pointerInteraction.current
    if (interaction?.dragging) {
      selectNearestEnabled(pointerPosition(event))
    } else if (event.target === event.currentTarget) {
      // Click landed directly on track container padding
      selectNearestEnabled(pointerPosition(event))
    }
    releasePointer(event)
  }

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
      style={{
        '--segment-count': options.length,
        '--segment-position': dragPosition ?? selectedIndex,
      } as SegmentedControlStyle}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={releasePointer}
    >
      <span
        aria-hidden="true"
        className={segmentedControlThumbClassName({ dragging: dragPosition !== null })}
      />
      {options.map((option) => {
        const selected = option.value === value
        const optionDisabled = disabled || option.disabled
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={optionDisabled}
            tabIndex={selected ? 0 : -1}
            data-segment-value={option.value}
            onClick={() => {
              if (!optionDisabled && option.value !== value) {
                onChange(option.value)
              }
            }}
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
