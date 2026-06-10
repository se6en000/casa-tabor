import { useEffect, useRef } from 'react'

const BRIDGE = 'http://127.0.0.1:8766'
const POLL_MS = 500

/**
 * Polls the STT bridge /wake-poll endpoint while the AI drawer is closed.
 * - If screensaver is active: wake word dismisses the screensaver
 * - Otherwise: wake word opens the AI drawer
 * Silently no-ops when the bridge is unreachable (non-Pi environments).
 */
export function useWakeWord(drawerOpen: boolean, screensaverActive: boolean) {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (drawerOpen) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      return
    }

    timerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${BRIDGE}/wake-poll`, { signal: AbortSignal.timeout(400) })
        if (!res.ok) return
        const data = await res.json()
        if (data.triggered) {
          if (screensaverActive) {
            document.dispatchEvent(new CustomEvent('wake-kiosk'))
          } else {
            document.dispatchEvent(new CustomEvent('open-ai-chat'))
          }
        }
      } catch {
        // bridge unreachable — not on Pi, ignore
      }
    }, POLL_MS)

    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null } }
  }, [drawerOpen, screensaverActive])
}

