import { useEffect, useRef } from 'react'

const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SCREENSAVER_GRACE_MS = 3000  // ignore wake triggers for 3s after screensaver activates
const DRAWER_CLOSE_GRACE_MS = 5000 // ignore wake triggers for 5s after drawer closes
const RECONNECT_MS = 3000          // backoff before reconnecting WS

/**
 * Connects to the STT bridge WebSocket while the AI drawer is closed.
 * Listens for {type: 'wake'} push events — no polling.
 * - If screensaver is active: wake word dismisses the screensaver
 * - Otherwise: wake word opens the AI drawer
 * Silently no-ops when the bridge is unreachable (non-Pi environments).
 */
export function useWakeWord(drawerOpen: boolean, screensaverActive: boolean, enabled = true) {
  const wsRef = useRef<WebSocket | null>(null)
  const screensaverActiveAtRef = useRef<number>(0)
  const drawerClosedAtRef = useRef<number>(0)
  const bridgeDeadRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Keep refs current so WS callbacks never capture stale closure values
  const drawerOpenRef = useRef(drawerOpen)
  const screensaverActiveRef = useRef(screensaverActive)
  useEffect(() => { drawerOpenRef.current = drawerOpen }, [drawerOpen])
  useEffect(() => { screensaverActiveRef.current = screensaverActive }, [screensaverActive])

  // Track when screensaver became active
  useEffect(() => {
    if (screensaverActive) {
      screensaverActiveAtRef.current = Date.now()
    }
  }, [screensaverActive])

  // Track when drawer closes
  useEffect(() => {
    if (!drawerOpen) {
      drawerClosedAtRef.current = Date.now()
    }
  }, [drawerOpen])

  useEffect(() => {
    if (!enabled) {
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
      return
    }

    if (drawerOpen) {
      // Drawer opened — disconnect WS, we don't need wake detection right now
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
      return
    }

    function connect() {
      if (drawerOpenRef.current) return  // drawer opened while we were waiting to reconnect
      if (wsRef.current) return           // already connected

      const ws = new WebSocket(BRIDGE_WS)
      wsRef.current = ws

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.type !== 'wake') return

          const now = Date.now()
          if (now - drawerClosedAtRef.current < DRAWER_CLOSE_GRACE_MS) return
          if (screensaverActiveRef.current && now - screensaverActiveAtRef.current < SCREENSAVER_GRACE_MS) return

          if (screensaverActiveRef.current) {
            document.dispatchEvent(new CustomEvent('wake-kiosk'))
          } else {
            document.dispatchEvent(new CustomEvent('open-ai-chat'))
          }
        } catch { /* ignore */ }
      }

      ws.onerror = () => {
        // Bridge unreachable — back off before retrying
        bridgeDeadRef.current = true
        setTimeout(() => { bridgeDeadRef.current = false }, 10_000)
      }

      ws.onclose = () => {
        wsRef.current = null
        if (!drawerOpenRef.current && !bridgeDeadRef.current) {
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS)
        } else if (!drawerOpenRef.current && bridgeDeadRef.current) {
          // Dead bridge — wait longer before retry
          reconnectTimerRef.current = setTimeout(() => {
            bridgeDeadRef.current = false
            connect()
          }, 10_000)
        }
      }
    }

    connect()

    return () => {
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
    }
  }, [drawerOpen, enabled])
}
