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
    startX.current = e.touches[0].clientX
    moved.current = false
    if (pillRef.current) pillRef.current.style.transition = ''
  }

  function onTouchMove(e: React.TouchEvent) {
    if (startX.current === null || committed.current) return
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
        bgRef.current.style.background = `rgba(34,197,94,${progress * 0.25})`
        bgRef.current.style.borderColor = `rgba(34,197,94,${0.3 + progress * 0.7})`
      } else {
        bgRef.current.style.background = `rgba(239,68,68,${progress * 0.25})`
        bgRef.current.style.borderColor = `rgba(239,68,68,${0.3 + progress * 0.7})`
      }
    }
  }

  function onTouchEnd() {
    if (committed.current) return
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
        bgRef.current.style.borderColor = '#C4893A'
        setTimeout(() => { if (bgRef.current) bgRef.current.style.transition = '' }, 200)
      }
    }
  }

  return (
    <div className="relative" style={{ display: 'inline-flex' }}>
      {/* Action hint icons behind the pill */}
      <div className="absolute inset-0 rounded-full flex items-center justify-between px-3 pointer-events-none" style={{ zIndex: 0 }}>
        <Check size={11} className="text-green-500" />
        <X size={11} className="text-red-400" />
      </div>

      {/* The pill */}
      <div
        ref={pillRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={() => { if (!moved.current) onClick?.() }}
        className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold select-none cursor-pointer"
        style={{
          border: '1.5px solid #C4893A',
          backgroundColor: '#FDFAF4',
          color: '#7A5520',
          willChange: 'transform',
          touchAction: 'pan-y',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Bg overlay that tints on swipe */}
        <div
          ref={bgRef}
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ border: '1.5px solid #C4893A', background: 'transparent', transition: '' }}
        />
        <Bell size={13} style={{ color: '#C4893A' }} className="relative shrink-0" />
        <span className="relative">{title}</span>
        {members.length > 0 && (
          <div className="relative flex gap-0.5 ml-0.5">
            {members.map(m => (
              <span
                key={m.id}
                className="w-4 h-4 rounded-full text-white text-[8px] flex items-center justify-center font-bold border border-white"
                style={{ backgroundColor: m.family_member?.color_hex }}
                title={m.family_member?.name ?? undefined}
              >
                {m.family_member?.name?.[0]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
