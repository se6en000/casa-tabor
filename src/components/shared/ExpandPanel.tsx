/**
 * Shared expand/collapse wrapper for Needs You cards (Home rail + Action Hub).
 * Always mounts its children — never conditionally renders them — so the CSS
 * grid-template-rows transition below can animate open/closed instead of
 * popping content in/out instantly. `fr`-unit grid rows animate to the
 * content's real height without needing to measure it in JS, so this works
 * for the conflict chip list, the directory suggestion entries, and the prep
 * snooze/not-relevant row alike, regardless of how tall each one is.
 */
import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export default function ExpandPanel({ isOpen, children }: { isOpen: boolean; children: ReactNode }) {
  return (
    <div
      className={cn(
        'grid transition-[grid-template-rows] duration-200 ease-out',
        isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]',
      )}
    >
      <div className="overflow-hidden">
        <div className={cn('transition-opacity duration-150', isOpen ? 'opacity-100 delay-75' : 'opacity-0')}>
          {children}
        </div>
      </div>
    </div>
  )
}
