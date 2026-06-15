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
  const startY = useRef<number | null>(null)
  const committed = useRef(false)
  const moved = useRef(false)
  const axis = useRef<'x' | 'y' | null>(null)
  const pointerId = useRef<number | null>(null)
  const usingPointer = useRef(false)

  function beginDrag(x: number, y: number) {
    if (committed.current) return
    startX.current = x
    startY.current = y
    axis.current = null
    moved.current = false
    if (pillRef.current) pillRef.current.style.transition = ''
  }

  function updateDrag(delta: number) {
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

  function onTouchStart(e: React.TouchEvent) {
    if (usingPointer.current) return
    beginDrag(e.touches[0].clientX, e.touches[0].clientY)
  }

  function onTouchMove(e: React.TouchEvent) {
    if (usingPointer.current) return
    if (startX.current === null || startY.current === null || committed.current) return
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (axis.current === null) {
      if (adx < 6 && ady < 6) return
      axis.current = adx > ady ? 'x' : 'y'
    }
    if (axis.current !== 'x') return
    e.preventDefault()
    moved.current = true
    updateDrag(dx)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (e.pointerType === 'mouse') return
    usingPointer.current = true
    pointerId.current = e.pointerId
    pillRef.current?.setPointerCapture?.(e.pointerId)
    beginDrag(e.clientX, e.clientY)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!usingPointer.current || pointerId.current !== e.pointerId) return
    if (startX.current === null || startY.current === null || committed.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    const adx = Math.abs(dx)
    const ady = Math.abs(dy)
    if (axis.current === null) {
      if (adx < 6 && ady < 6) return
      axis.current = adx > ady ? 'x' : 'y'
    }
    if (axis.current !== 'x') return
    e.preventDefault()
    moved.current = true
    updateDrag(dx)
  }

  function readCurrentDelta() {
    const transform = pillRef.current?.style.transform ?? ''
    const match = transform.match(/translateX\((-?[\d.]+)px\)/)
    return match ? parseFloat(match[1]) : 0
  }

  function endDrag() {
    if (committed.current) return
    const startXVal = startX.current
    startX.current = null
    startY.current = null
    axis.current = null
    if (startXVal === null) return

    const delta = readCurrentDelta()

    if (!moved.current) {
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

  function onTouchEnd() {
    if (usingPointer.current) return
    endDrag()
  }

  function onTouchCancel() {
    if (usingPointer.current) return
    endDrag()
  }

  function onPointerUp(e: React.PointerEvent) {
    if (!usingPointer.current || pointerId.current !== e.pointerId) return
    endDrag()
    pointerId.current = null
    usingPointer.current = false
  }

  function onPointerCancel(e: React.PointerEvent) {
    if (!usingPointer.current || pointerId.current !== e.pointerId) return
    endDrag()
    pointerId.current = null
    usingPointer.current = false
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
        onTouchCancel={onTouchCancel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onClick={() => { if (!moved.current) onClick?.() }}
        className="relative z-10 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-caption font-semibold select-none cursor-pointer"
        style={{
          border: '1.5px solid #C4893A',
          backgroundColor: '#FDFAF4',
          color: '#7A5520',
          willChange: 'transform',
          touchAction: 'pan-y pinch-zoom',
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
                className="px-1.5 py-0.5 rounded-full text-white text-[9px] font-bold leading-none whitespace-nowrap"
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
