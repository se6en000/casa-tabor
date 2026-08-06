import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { User, X } from 'lucide-react'
import { useSavedContacts } from '../../hooks/useSavedContacts'
import { rankDirectorySuggestions, type DirectorySuggestionCandidate } from '../../utils/directorySuggestions'
import { Button, IconButton, Input } from '../ui'

interface ContactSuggestion extends DirectorySuggestionCandidate {
  phone: string | null
  email: string | null
}

interface SmartContactInputProps {
  value: string
  label: string
  placeholder: string
  autoFocus?: boolean
  onClear?: () => void
  onChange: (name: string) => void
  onSelect?: (contact: { name: string; phone: string | null; email: string | null }) => void
}

export default function SmartContactInput({
  value,
  label,
  placeholder,
  autoFocus = false,
  onClear,
  onChange,
  onSelect,
}: SmartContactInputProps) {
  const listboxId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const { data: savedContacts = [] } = useSavedContacts()

  useEffect(() => {
    if (!focused) return
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setFocused(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [focused])

  const suggestions = useMemo<ContactSuggestion[]>(() => {
    const candidates: ContactSuggestion[] = savedContacts.map((contact) => ({
      id: contact.id,
      primary: contact.name,
      aliases: contact.aliases,
      secondary: contact.phone ?? undefined,
      phone: contact.phone,
      email: contact.email,
    }))
    return rankDirectorySuggestions(candidates, value, 6)
  }, [savedContacts, value])

  const showResults = focused && (suggestions.length > 0 || Boolean(value.trim()))

  const choose = (suggestion: ContactSuggestion) => {
    onChange(suggestion.primary)
    onSelect?.({ name: suggestion.primary, phone: suggestion.phone, email: suggestion.email })
    setFocused(false)
    setActiveIndex(-1)
  }

  return (
    <div ref={rootRef} className="relative">
      <Input
        autoFocus={autoFocus}
        value={value}
        aria-label={label}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={showResults}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
        placeholder={placeholder}
        className="pr-control"
        onFocus={() => setFocused(true)}
        onChange={(event) => {
          onChange(event.target.value)
          setFocused(true)
          setActiveIndex(-1)
        }}
        onKeyDown={(event) => {
          if (!showResults || suggestions.length === 0) return
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActiveIndex((index) => Math.min(index + 1, suggestions.length - 1))
          } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActiveIndex((index) => Math.max(index - 1, 0))
          } else if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault()
            choose(suggestions[activeIndex])
          } else if (event.key === 'Escape') {
            setFocused(false)
          }
        }}
      />
      {value && onClear ? (
        <IconButton
          icon={<X size={15} />}
          aria-label={`Clear ${label.toLowerCase()}`}
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1/2 -translate-y-1/2"
          onPointerDown={(event) => event.preventDefault()}
          onClick={onClear}
        />
      ) : (
        <User size={17} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-casa-muted" />
      )}
      {showResults && (
        <div
          id={listboxId}
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-[calc(100%+6px)] z-popover max-h-72 overflow-y-auto overscroll-contain rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
        >
          {value.trim() && suggestions.length === 0 && (
            <p className="px-3 py-2 text-caption text-casa-muted">
              No saved match · this will be added as a new contact.
            </p>
          )}
          {suggestions.map((suggestion, index) => (
            <Button
              key={suggestion.id}
              id={`${listboxId}-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              variant="ghost"
              fullWidth
              align="start"
              className="min-h-control rounded-button px-3 text-left"
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(suggestion)}
            >
              <User size={16} className="shrink-0 text-casa-gold" />
              <span className="min-w-0 flex-1">
                <span className="truncate text-body-sm font-semibold text-casa-navy">{suggestion.primary}</span>
                {suggestion.phone && (
                  <span className="mt-0.5 block truncate text-caption text-casa-muted">{suggestion.phone}</span>
                )}
              </span>
            </Button>
          ))}
        </div>
      )}
    </div>
  )
}
