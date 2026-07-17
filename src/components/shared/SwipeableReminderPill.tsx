import { useRef } from 'react'
import { Bell, Check, X } from 'lucide-react'

interface Props {
  id: string
  title: string
  members: { id: string; family_member: { name: string; color_hex: string } | null }[]
  onClick?: () => void
  onComplete: (id: string) => void
  onDismiss: (id: string) => void
}

const THRESHOLD = 60 // px to trigger action

export default function SwipeableReminderPill({ id, title, members, onClick, onComplete, onDismiss }: Props) {
  const pillRef = useRef<HTMLDivElement>(null)
  const bgRef = useRef<HTMLDivElement>(null)
  const startX = useRef<number | null>(null)
  const committed = useRef(false)
  const moved = useRef(false)

  function onTouchStart(e: React.TouchEvent) {
    if (committed.current) return
    e.stopPropagation()
    startX.current = e.touches[0].clientX
    moved.current = false
    if (pillRef.current) pillRef.current.style.transition = ''
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || committed.current) return
    e.stopPropagation()
    const delta = e.touches[0].clientX - startX.current
    if (Math.abs(delta) < 4) return
    moved.current = true

    const clamped = Math.max(-160, Math.min(160, delta))
    const progress = Math.min(1, Math.abs(clamped) / THRESHOLD)

    if (pillRef.current) {
      pillRef.current.style.transform = `translateX(${clamped}px)`
    }

    if (bgRef.current) {
      if (clamped > 0) {
        bgRef.current.style.background = `color-mix(in srgb, var(--color-casa-success) ${progress * 25}%, transparent)`
        bgRef.current.style.borderColor = `color-mix(in srgb, var(--color-casa-success) ${(0.3 + progress * 0.7) * 100}%, transparent)`
      } else {
        bgRef.current.style.background = `color-mix(in srgb, var(--color-casa-error) ${progress * 25}%, transparent)`
        bgRef.current.style.borderColor = `color-mix(in srgb, var(--color-casa-error) ${(0.3 + progress * 0.7) * 100}%, transparent)`
      }
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    if (committed.current) return
    e.stopPropagation()
    const startXVal = startX.current
    startX.current = null
    if (startXVal === null) return

    // Read transform to get current delta
    const transform = pillRef.current?.style.transform ?? ''
    const match = transform.match(/translateX\((-?[\d.]+)px\)/)
    const delta = match ? parseFloat(match[1]) : 0

    if (!moved.current) {
      // Treated as tap
      onClick?.()
      return
    }

    if (delta > THRESHOLD) {
      committed.current = true
      navigator.vibrate?.(20)
      if (pillRef.current) {
        pillRef.current.style.transition = 'transform 0.22s ease, opacity 0.22s ease'
        pillRef.current.style.transform = 'translateX(200px)'
        pillRef.current.style.opacity = '0'
      }
      if (bgRef.current) {
        bgRef.current.style.transition = 'opacity 0.22s ease'
        bgRef.current.style.opacity = '0'
      }
      setTimeout(() => onComplete(id), 230)
    } else if (delta < -THRESHOLD) {
      committed.current = true
      navigator.vibrate?.(20)
      if (pillRef.current) {
        pillRef.current.style.transition = 'transform 0.22s ease, opacity 0.22s ease'
        pillRef.current.style.transform = 'translateX(-200px)'
        pillRef.current.style.opacity = '0'
      }
      if (bgRef.current) {
        bgRef.current.style.transition = 'opacity 0.22s ease'
        bgRef.current.style.opacity = '0'
      }
      setTimeout(() => onDismiss(id), 230)
    } else {
      // Snap back
      if (pillRef.current) {
        pillRef.current.style.transition = 'transform 0.2s cubic-bezier(0.34,1.56,0.64,1)'
        pillRef.current.style.transform = 'translateX(0)'
        setTimeout(() => { if (pillRef.current) pillRef.current.style.transition = '' }, 200)
      }
      if (bgRef.current) {
        bgRef.current.style.transition = 'background 0.2s, border-color 0.2s'
        bgRef.current.style.background = 'transparent'
        bgRef.current.style.borderColor = 'var(--color-casa-gold)'
        setTimeout(() => { if (bgRef.current) bgRef.current.style.transition = '' }, 200)
      }
    }
  }

  return (
    <div className="relative inline-flex">
      {/* Action hint icons behind the pill */}
      <div className="absolute inset-0 z-base rounded-full flex items-center justify-between px-3 pointer-events-none">
        <Check size={11} className="text-green-500" />
        <X size={11} className="text-red-400" />
      </div>

      {/* The pill */}
      <div
        ref={pillRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={(e) => {
          e.stopPropagation()
          if (!moved.current) onClick?.()
        }}
        className="relative z-raised inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border-[1.5px] border-casa-gold bg-casa-accent-soft text-casa-navy text-caption font-semibold select-none cursor-pointer"
        style={{
          willChange: 'transform',
          touchAction: 'pan-y',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Bg overlay that tints on swipe */}
        <div
          ref={bgRef}
          className="absolute inset-0 rounded-full border-[1.5px] border-casa-gold bg-transparent pointer-events-none"
        />
        <Bell size={13} className="relative shrink-0 text-casa-gold" />
        <span className="relative">{title}</span>
        {members.length > 0 && (
          <div className="relative flex gap-0.5 ml-0.5">
            {members.map(m => (
              <span
                key={m.id}
                className="px-1.5 py-0.5 rounded-full text-white text-caption font-bold leading-none whitespace-nowrap"
                style={{ backgroundColor: m.family_member?.color_hex ?? undefined }}
              >
                {m.family_member?.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
