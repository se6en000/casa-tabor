import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { cn } from '../../utils/cn'

export interface ComboboxOption {
  value: string
  label: string
}

export interface ComboboxProps {
  value: string
  onChange: (value: string) => void
  options: ComboboxOption[]
  label: string
  placeholder?: string
  disabled?: boolean
  className?: string
}

export function Combobox({ value, onChange, options, label, placeholder = 'Search options', disabled, className }: ComboboxProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const selected = options.find((option) => option.value === value)
  const filtered = useMemo(
    () => options.filter((option) => option.label.toLowerCase().includes(query.trim().toLowerCase())),
    [options, query],
  )

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <label className="mb-1.5 block text-body-sm font-medium text-content-heading">{label}</label>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-control w-full items-center justify-between rounded-button border border-casa-border bg-casa-surface px-3 text-body-sm text-casa-text outline-none focus-visible:ring-2 focus-visible:ring-casa-gold disabled:opacity-40"
      >
        <span>{selected?.label ?? placeholder}</span>
        <ChevronDown size={18} />
      </button>
      {open && (
        <div className="absolute left-0 right-0 top-full z-popover mt-2 rounded-card border border-casa-border bg-casa-surface p-2 shadow-modal">
          <div className="flex min-h-control items-center gap-2 rounded-button border border-casa-border bg-casa-bg px-3">
            <Search size={18} className="text-casa-muted" />
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={placeholder}
              className="min-w-0 flex-1 bg-transparent text-body-sm text-casa-text outline-none"
            />
          </div>
          <div id={listboxId} role="listbox" aria-label={label} className="mt-2 max-h-64 overflow-y-auto">
            {filtered.map((option) => (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value)
                  setQuery('')
                  setOpen(false)
                }}
                className="flex min-h-control w-full items-center justify-between rounded-button px-3 text-left text-body-sm text-casa-text hover:bg-casa-bg focus-visible:bg-casa-bg focus-visible:outline-none"
              >
                {option.label}
                {option.value === value && <Check size={18} className="text-casa-success" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="p-3 text-body-sm text-casa-muted">No matching options</p>}
          </div>
        </div>
      )}
    </div>
  )
}
