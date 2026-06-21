import { useState, useEffect, useCallback, Component, type ReactNode } from 'react'
import { BrowserRouter, useLocation, useNavigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { useTravelScan } from './hooks/useTravelScan'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { TopBarC } from './components/shared/TopBar'
import PinGate from './components/shared/PinGate'
import AIChatDrawer from './components/shared/AIChatDrawer'
import ArtScreensaver from './components/shared/ArtScreensaver'
import QuickCreateSheet from './components/shared/QuickCreateSheet'
import AddEventFab from './components/shared/AddEventFab'
import TouchKeyboard from './components/shared/TouchKeyboard'
import { useRollingEvents } from './hooks/useCalendarEvents'
import { useFamilyMembers } from './hooks/useFamilyMembers'
import { useHomeWeather } from './hooks/useHomeWeather'
import { useLiveClock } from './hooks/useLiveClock'
import { useWakeWord } from './hooks/useWakeWord'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useScreensaverSettings } from './hooks/useScreensaverSettings'
import { supabase } from './lib/supabase'

const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-casa-bg gap-4 px-8 text-center">
          <p className="font-display text-display-sm">😞</p>
          <p className="font-semibold text-casa-navy">Something went wrong</p>
          <p className="text-casa-muted text-body-sm">{(this.state.error as Error).message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-2 px-4 py-2 bg-casa-gold text-white rounded-button text-body-sm font-medium"
          >
            Reload app
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 2,
    },
  },
})

function GlobalAIDrawer({
  screensaverActive,
  open,
  setOpen,
  safeMode,
}: {
  screensaverActive: boolean
  open: boolean
  setOpen: (open: boolean) => void
  safeMode: boolean
}) {
  const [anchor, setAnchor] = useState<{ right: number; top: number } | undefined>()
  const [launchRequest, setLaunchRequest] = useState<{ prompt: string; autoSend: boolean; nonce: string } | null>(null)
  const [wakeSessionNonce, setWakeSessionNonce] = useState<string | undefined>(undefined)
  const now = useLiveClock(60_000)
  const { data: events = [] } = useRollingEvents(now)
  const { data: family = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()
  useWakeWord(open, screensaverActive, !safeMode)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ right?: number; top?: number; prompt?: string; autoSend?: boolean; source?: string } | undefined>).detail
      if (detail && typeof detail.right === 'number' && typeof detail.top === 'number') {
        setAnchor({ right: detail.right, top: detail.top })
      }
      setWakeSessionNonce(detail?.source === 'wake' ? crypto.randomUUID() : undefined)
      if (detail?.prompt) {
        setLaunchRequest({
          prompt: detail.prompt,
          autoSend: detail.autoSend ?? false,
          nonce: crypto.randomUUID(),
        })
      } else {
        setLaunchRequest(null)
      }
      setOpen(true)
    }
    document.addEventListener('open-ai-chat', handler)
    return () => document.removeEventListener('open-ai-chat', handler)
  }, [setOpen])

  return (
    <AIChatDrawer
      open={open}
      onClose={() => setOpen(false)}
      anchor={anchor}
      page="app"
      events={events}
      family={family}
      homeCity={weather?.city}
      onSleepCommand={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
      launchRequest={launchRequest ?? undefined}
      wakeSessionNonce={wakeSessionNonce}
    />
  )
}

function AppShell() {
  const { currentZone } = useRoomTone()
  const { setRoomToneZone } = useTheme()
  useTravelScan()

  const { settings } = useScreensaverSettings()
  const ssMs   = settings.enabled && !IS_SAFE_MODE ? settings.screensaverMins * 60_000 : Infinity
  const dispMs = settings.displaySleepEnabled && !IS_SAFE_MODE ? settings.displayOffMins * 60_000 : Infinity
  useIdleTimer(ssMs, dispMs)

  const [screensaverActive, setScreensaverActive] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const location = useLocation()
  const hideFab = location.pathname.startsWith('/settings') || screensaverActive
  const navigate = useNavigate()

  const handlePushAction = useCallback(async (action: string, eventId?: string | null, url?: string, prepItemId?: string | null) => {
    if (action === 'open') {
      if (eventId) {
        navigate(`/?event_id=${encodeURIComponent(eventId)}`)
      } else if (url) {
        window.location.assign(url)
      }
      return
    }
    // For other actions (done, snooze), invoke the backend
    if (!eventId && !prepItemId) return
    await supabase.functions.invoke('notification-action', {
      body: { action, event_id: eventId, prep_item_id: prepItemId },
    }).catch(() => {})
  }, [navigate])

  useEffect(() => {
    setRoomToneZone(currentZone)
  }, [currentZone, setRoomToneZone])

  useEffect(() => {
    const onSleep = () => setScreensaverActive(true)
    const onSleepIdle = () => {
      if (aiDrawerOpen) return
      setScreensaverActive(true)
    }
    const onWake  = () => setScreensaverActive(false)
    document.addEventListener('screensaver-on', onSleep)
    document.addEventListener('screensaver-idle-on', onSleepIdle)
    document.addEventListener('wake-kiosk', onWake)
    return () => {
      document.removeEventListener('screensaver-on', onSleep)
      document.removeEventListener('screensaver-idle-on', onSleepIdle)
      document.removeEventListener('wake-kiosk', onWake)
    }
  }, [aiDrawerOpen])

  useEffect(() => {
    fetch('http://127.0.0.1:8766/wake-sensitivity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ score: settings.wakeWordSensitivity }),
    }).catch(() => {})
  }, [settings.wakeWordSensitivity])

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; action?: string; eventId?: string | null; prepItemId?: string | null; url?: string } | null
      if (!data || data.type !== 'PUSH_NOTIFICATION_ACTION') return
      handlePushAction(data.action ?? 'open', data.eventId ?? null, data.url, data.prepItemId ?? null)
    }
    navigator.serviceWorker?.addEventListener('message', onMessage)
    return () => navigator.serviceWorker?.removeEventListener('message', onMessage)
  }, [handlePushAction])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const action = params.get('push_action')
    const eventId = params.get('event_id')
    const prepItemId = params.get('prep_item_id')
    if (!action) return
    handlePushAction(action, eventId, undefined, prepItemId)
    params.delete('push_action')
    params.delete('event_id')
    params.delete('prep_item_id')
    const next = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ''}${window.location.hash}`
    window.history.replaceState({}, '', next)
  }, [handlePushAction])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-casa-main">
      {/* Full-width top bar — sticky, never scrolls */}
      <TopBarC />

      <div className="flex flex-1 min-h-0 pb-[--spacing-nav-height] lg:pb-0">
        <TabletSidebar />
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <AnimatedRoutes />
        </div>
      </div>

      {/* Bottom nav only visible on mobile */}
      <NavBar />

      {!hideFab && (
        <AddEventFab onClick={() => setQuickCreateOpen(true)} />
      )}

      <QuickCreateSheet
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
      />

      <TouchKeyboard />

      {/* Global AI drawer — opens from TopBar sparkle or wake word */}
      <GlobalAIDrawer
        screensaverActive={screensaverActive}
        open={aiDrawerOpen}
        setOpen={setAiDrawerOpen}
        safeMode={IS_SAFE_MODE}
      />

      {/* Art screensaver overlay — always available when triggered manually; idle auto-fire respects settings.enabled */}
      {screensaverActive && (
        <ArtScreensaver
          onDismiss={() => setScreensaverActive(false)}
          rotationMins={settings.rotationMins}
          minArtWidthVw={settings.minArtWidthVw}
          artDimOffset={settings.artDimOffset}
        />
      )}
    </div>
  )
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <PinGate>
          <QueryClientProvider client={queryClient}>
            <BrowserRouter>
              <AppErrorBoundary>
                <AppShell />
              </AppErrorBoundary>
            </BrowserRouter>
          </QueryClientProvider>
        </PinGate>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
