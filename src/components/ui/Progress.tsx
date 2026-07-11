export interface ProgressProps {
  value?: number
  max?: number
  label?: string
  'aria-label'?: string
  showValue?: boolean
  className?: string
}

export function Progress({ value, max = 100, label, 'aria-label': ariaLabel, showValue = false, className }: ProgressProps) {
  const determinate = typeof value === 'number'
  const percent = determinate ? Math.min(100, Math.max(0, (value / max) * 100)) : 0
  return (
    <div className={className}>
      {(label || showValue) && (
        <div className="mb-2 flex justify-between gap-3 text-body-sm font-semibold text-casa-text-secondary">
          <span>{label}</span>
          {showValue && determinate && <span>{Math.round(percent)}%</span>}
        </div>
      )}
      <progress
        aria-label={ariaLabel ?? label}
        value={determinate ? value : undefined}
        max={max}
        className="casa-progress block h-3 w-full overflow-hidden rounded-pill"
      />
    </div>
  )
}
