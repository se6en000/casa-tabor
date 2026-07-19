import { useCallback, useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

const LONG_PRESS_MS = 550
const MOVE_TOLERANCE_PX = 12

interface CalendarQuickCreateGestureOptions<T> {
  resolveStart: (context: T, clientX: number, clientY: number) => Date
  onCreate: (start: Date) => void
  ignoreSelector?: string
}

export function useCalendarQuickCreateGesture<T>({
  resolveStart,
  onCreate,
  ignoreSelector = '[data-calendar-event]',
}: CalendarQuickCreateGestureOptions<T>) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const originRef = useRef<{ x: number; y: number; context: T } | null>(null)

  const cancel = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    originRef.current = null
  }, [])

  useEffect(() => cancel, [cancel])

  const shouldIgnore = useCallback((target: EventTarget | null) => (
    target instanceof Element && Boolean(target.closest(ignoreSelector))
  ), [ignoreSelector])

  const onPointerDown = useCallback((event: ReactPointerEvent, context: T) => {
    if (event.pointerType === 'mouse' || shouldIgnore(event.target)) return
    originRef.current = { x: event.clientX, y: event.clientY, context }
    timerRef.current = setTimeout(() => {
      const origin = originRef.current
      timerRef.current = null
      originRef.current = null
      if (!origin) return
      navigator.vibrate?.(30)
      onCreate(resolveStart(origin.context, origin.x, origin.y))
    }, LONG_PRESS_MS)
  }, [onCreate, resolveStart, shouldIgnore])

  const onPointerMove = useCallback((event: ReactPointerEvent) => {
    const origin = originRef.current
    if (!origin) return
    if (Math.hypot(event.clientX - origin.x, event.clientY - origin.y) > MOVE_TOLERANCE_PX) cancel()
  }, [cancel])

  const onDoubleClick = useCallback((event: React.MouseEvent, context: T) => {
    if (shouldIgnore(event.target)) return
    event.preventDefault()
    onCreate(resolveStart(context, event.clientX, event.clientY))
  }, [onCreate, resolveStart, shouldIgnore])

  return {
    cancel,
    onPointerDown,
    onPointerMove,
    onPointerUp: cancel,
    onPointerCancel: cancel,
    onDoubleClick,
  }
}
