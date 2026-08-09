/**
 * Reusable snooze-duration picker, shared across prep items and conflicts
 * (missed reminders keep their own +1h reschedule model — see
 * useReminderNeedsYouActions). Previously every "Snooze" button was a single
 * hardcoded action ("until tomorrow 6am") with no way to pick how long —
 * this replaces that with a small anchored menu offering 15m / 1h / 3h /
 * Tomorrow morning, following the same click-outside-to-close popover
 * pattern already established by PrepAssignPicker in HomeRightPanel.
 *
 * The dropdown itself is rendered through a portal into document.body and
 * positioned with `position: fixed` computed from the trigger's real screen
 * coordinates. Several trigger sites (the Home timeline row's rounded Card,
 * HomeRightPanel's ExpandPanel) wrap their content in `overflow-hidden` for
 * unrelated reasons (the accent bar radius, the grid-rows expand animation);
 * an absolutely-positioned dropdown nested inside those ancestors would be
 * clipped or invisible instead of floating above the page.
 */
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Moon } from 'lucide-react'
import { SNOOZE_DURATIONS, snoozeDurationLabel, type SnoozeDuration } from '../../utils/snoozeDuration'
import { Button } from '../ui'

export default function SnoozeMenu({
  onSnooze,
  triggerLabel = 'Snooze',
  triggerVariant = 'secondary',
  triggerClassName,
  renderTrigger,
  menuPlacement = 'below',
  dueDateIso,
  eventDateIso,
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
  dueDateIso?: string | null
  eventDateIso?: string | null
}) {
  const [open, setOpen] = useState(false)
  const [menuPosition, setMenuPosition] = useState<{ left: number; top?: number; bottom?: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (evt: MouseEvent | TouchEvent) => {
      const target = evt.target as Node
      if (containerRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('touchstart', handlePointerDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
    }
  }, [open])

  useEffect(() => {
    if (!open || !containerRef.current) {
      setMenuPosition(null)
      return
    }
    const updatePosition = () => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      setMenuPosition(
        menuPlacement === 'above'
          ? { left: rect.left, bottom: window.innerHeight - rect.top + 6 }
          : { left: rect.left, top: rect.bottom + 6 },
      )
    }
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open, menuPlacement])

  const toggle = (evt: React.MouseEvent) => { evt.stopPropagation(); setOpen((prev) => !prev) }
  const targetDateIso = dueDateIso ?? eventDateIso
  const showDueDateAlignedSnooze = Boolean(
    targetDateIso && new Date(targetDateIso).getTime() - Date.now() >= 48 * 60 * 60 * 1000,
  )

  return (
    <div className="relative inline-flex" ref={containerRef}>
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
      {createPortal(
        <AnimatePresence>
          {open && menuPosition && (
            <motion.div
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, y: menuPlacement === 'above' ? 4 : -4, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: menuPlacement === 'above' ? 4 : -4, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="fixed z-popover min-w-[168px] overflow-hidden rounded-card border border-casa-border bg-casa-surface p-1.5 shadow-modal"
              style={{ left: menuPosition.left, top: menuPosition.top, bottom: menuPosition.bottom, position: 'fixed' }}
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
              {showDueDateAlignedSnooze && (
                <Button
                  type="button"
                  role="menuitem"
                  variant="ghost"
                  size="sm"
                  fullWidth
                  onClick={(evt) => { evt.stopPropagation(); onSnooze('2d-before'); setOpen(false) }}
                  className="rounded-lg px-2 py-1.5 text-left"
                  contentClassName="w-full justify-start"
                >
                  {snoozeDurationLabel('2d-before')}
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  )
}
