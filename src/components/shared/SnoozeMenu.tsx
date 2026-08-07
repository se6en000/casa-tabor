/**
 * Reusable snooze-duration picker, shared across prep items and conflicts
 * (missed reminders keep their own +1h reschedule model — see
 * useReminderNeedsYouActions). Previously every "Snooze" button was a single
 * hardcoded action ("until tomorrow 6am") with no way to pick how long —
 * this replaces that with a small anchored menu offering 15m / 1h / 3h /
 * Tomorrow morning, following the same click-outside-to-close popover
 * pattern already established by PrepAssignPicker in HomeRightPanel.
 */
import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Moon } from 'lucide-react'
import { cn } from '../../utils/cn'
import { SNOOZE_DURATIONS, snoozeDurationLabel, type SnoozeDuration } from '../../utils/snoozeDuration'
import { Button } from '../ui'

export default function SnoozeMenu({
  onSnooze,
  triggerLabel = 'Snooze',
  triggerVariant = 'secondary',
  triggerClassName,
  renderTrigger,
  menuPlacement = 'below',
}: {
  onSnooze: (duration: SnoozeDuration) => void
  triggerLabel?: string
  triggerVariant?: 'secondary' | 'ghost'
  triggerClassName?: string
  /** Escape hatch for icon-only triggers (e.g. the detail-panel footer's IconButton row)
   * that can't use the default labeled Button. Receives the same open/toggle wiring. */
  renderTrigger?: (props: { open: boolean; onClick: (evt: React.MouseEvent) => void }) => React.ReactNode
  /** 'above' for triggers anchored to a bottom footer, so the menu opens upward
   * instead of getting clipped by the sheet's edge. */
  menuPlacement?: 'below' | 'above'
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (evt: MouseEvent | TouchEvent) => {
      if (!containerRef.current || containerRef.current.contains(evt.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  const toggle = (evt: React.MouseEvent) => { evt.stopPropagation(); setOpen((prev) => !prev) }

  return (
    <div className={cn('relative inline-flex', open && 'z-popover')} ref={containerRef}>
      {renderTrigger ? (
        renderTrigger({ open, onClick: toggle })
      ) : (
        <Button
          type="button"
          variant={triggerVariant}
          size="sm"
          leadingIcon={<Moon size={13} strokeWidth={2.1} />}
          onClick={toggle}
          className={triggerClassName}
          title="Snooze"
          aria-haspopup="menu"
          aria-expanded={open}
        >
          {triggerLabel}
        </Button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            initial={{ opacity: 0, y: menuPlacement === 'above' ? 4 : -4, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: menuPlacement === 'above' ? 4 : -4, scale: 0.96 }}
            transition={{ duration: 0.12 }}
            className={cn(
              'absolute left-0 z-popover min-w-[168px] overflow-hidden rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal',
              menuPlacement === 'above' ? 'bottom-[calc(100%+6px)]' : 'top-[calc(100%+6px)]',
            )}
          >
            {SNOOZE_DURATIONS.map((duration) => (
              <Button
                key={duration}
                type="button"
                role="menuitem"
                variant="ghost"
                size="sm"
                fullWidth
                onClick={(evt) => { evt.stopPropagation(); onSnooze(duration); setOpen(false) }}
                className="rounded-lg px-2 py-1.5 text-left"
                contentClassName="w-full justify-start"
              >
                {snoozeDurationLabel(duration)}
              </Button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
