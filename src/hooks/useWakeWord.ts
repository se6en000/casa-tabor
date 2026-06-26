import { useEffect, useRef } from 'react'

const BRIDGE_WS = 'ws://127.0.0.1:8767'
const SCREENSAVER_GRACE_MS = 3000  // ignore wake triggers for 3s after screensaver activates
const DRAWER_CLOSE_GRACE_MS = 5000 // ignore wake triggers for 5s after drawer closes
const RECONNECT_MS = 3000          // backoff before reconnecting WS

function emitWakeDebug(event: string, detail?: string) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent('casa:ai-debug', { detail: { event, detail } }))
}

/**
 * Connects to the STT bridge WebSocket while the AI drawer is closed.
 * Listens for {type: 'wake'} push events — no polling.
 * - If screensaver is active: wake word dismisses screensaver and opens AI drawer
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
      emitWakeDebug('wake_listener_disabled')
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
      return
    }

    if (drawerOpen) {
      // Drawer opened — disconnect WS, we don't need wake detection right now
      emitWakeDebug('wake_listener_paused_drawer_open')
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
      return
    }

    function connect() {
      if (drawerOpenRef.current) return  // drawer opened while we were waiting to reconnect
      if (wsRef.current) return           // already connected
      emitWakeDebug('wake_ws_connect_start')

      const ws = new WebSocket(BRIDGE_WS)
      wsRef.current = ws
      ws.onopen = () => emitWakeDebug('wake_ws_connected')

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data as string)
          if (msg.type !== 'wake') return

          const now = Date.now()
          const wakeScore = typeof msg.score === 'number' ? msg.score : null
          const wakeThreshold = typeof msg.threshold === 'number' ? msg.threshold : null
          if (now - drawerClosedAtRef.current < DRAWER_CLOSE_GRACE_MS) {
            emitWakeDebug('wake_ignored_drawer_grace', `score=${wakeScore ?? 'n/a'} threshold=${wakeThreshold ?? 'n/a'}`)
            return
          }
          if (screensaverActiveRef.current && now - screensaverActiveAtRef.current < SCREENSAVER_GRACE_MS) {
            emitWakeDebug('wake_ignored_screensaver_grace', `score=${wakeScore ?? 'n/a'} threshold=${wakeThreshold ?? 'n/a'}`)
            return
          }
          emitWakeDebug('wake_detected', `score=${wakeScore ?? 'n/a'} threshold=${wakeThreshold ?? 'n/a'}`)

          const wakeDetail = {
            source: 'wake' as const,
            wakeScore,
            wakeThreshold,
            wakeAt: now,
          }

          if (screensaverActiveRef.current) {
            emitWakeDebug('wake_dispatch_wake_kiosk')
            document.dispatchEvent(new CustomEvent('wake-kiosk'))
            // Single wake phrase should both wake screen and start listening.
            setTimeout(() => {
              emitWakeDebug('wake_dispatch_open_ai_chat', 'source=wake,screensaver=1')
              document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: wakeDetail }))
            }, 120)
            return
          }
          emitWakeDebug('wake_dispatch_open_ai_chat', 'source=wake,screensaver=0')
          document.dispatchEvent(new CustomEvent('open-ai-chat', { detail: wakeDetail }))
        } catch { /* ignore */ }
      }

      ws.onerror = () => {
        // Bridge unreachable — back off before retrying
        emitWakeDebug('wake_ws_error')
        bridgeDeadRef.current = true
        setTimeout(() => { bridgeDeadRef.current = false }, 10_000)
      }

      ws.onclose = () => {
        emitWakeDebug('wake_ws_closed')
        wsRef.current = null
        if (!drawerOpenRef.current && !bridgeDeadRef.current) {
          emitWakeDebug('wake_ws_reconnect_scheduled', `${RECONNECT_MS}ms`)
          reconnectTimerRef.current = setTimeout(connect, RECONNECT_MS)
        } else if (!drawerOpenRef.current && bridgeDeadRef.current) {
          // Dead bridge — wait longer before retry
          emitWakeDebug('wake_ws_reconnect_backoff', '10000ms')
          reconnectTimerRef.current = setTimeout(() => {
            bridgeDeadRef.current = false
            connect()
          }, 10_000)
        }
      }
    }

    connect()

    return () => {
      emitWakeDebug('wake_listener_cleanup')
      if (reconnectTimerRef.current) { clearTimeout(reconnectTimerRef.current); reconnectTimerRef.current = null }
      if (wsRef.current) { try { wsRef.current.close() } catch { /* ignore */ } wsRef.current = null }
    }
  }, [drawerOpen, enabled])
}
