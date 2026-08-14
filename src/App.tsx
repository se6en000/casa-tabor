import { useState, useEffect, Component, type ReactNode } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useAppUpdater } from './hooks/useAppUpdater'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import LuxuryTopBar from './components/shared/LuxuryTopBar'
import PinGate from './components/shared/PinGate'
import ArtScreensaver from './components/shared/ArtScreensaver'
import QuickCreateSheet from './components/shared/QuickCreateSheet'
import AddEventFab from './components/shared/AddEventFab'
import TouchKeyboard from './components/shared/TouchKeyboard'
import { Button } from './components/ui'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useScreensaverSettings } from './hooks/useScreensaverSettings'
import { useLiveClock } from './hooks/useLiveClock'
import { useRollingEvents } from './hooks/useCalendarEvents'
import { useAppStore } from './stores/appStore'
import SidecarCompanion from './components/shared/SidecarCompanion'
import CanvasUndoToast from './components/canvas/CanvasUndoToast'
import { useTonightDinnerSync } from './hooks/useTonightDinnerSync'

const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="app-shell flex flex-col items-center justify-center bg-casa-bg gap-4 px-page-gutter text-center">
          <p className="font-display text-display-sm">😞</p>
          <p className="font-semibold text-casa-navy">Something went wrong</p>
          <p className="text-casa-muted text-body-sm">{(this.state.error as Error).message}</p>
          <Button variant="ghost"
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-2 px-4 py-2 bg-casa-gold text-white rounded-button text-body-sm font-medium"
          >
            Reload app
          </Button>
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

function AppShell() {
  const { currentZone } = useRoomTone()
  const { setRoomToneZone } = useTheme()
  usePushNotifications()
  useAppUpdater()
  useTonightDinnerSync()

  const { settings } = useScreensaverSettings()
  const ssMs   = settings.enabled && !IS_SAFE_MODE ? settings.screensaverMins * 60_000 : Infinity
  const dispMs = settings.displaySleepEnabled && !IS_SAFE_MODE ? settings.displayOffMins * 60_000 : Infinity
  useIdleTimer(ssMs, dispMs)

  const now = useLiveClock(60_000)
  useRollingEvents(now)

  const [screensaverActive, setScreensaverActive] = useState(false)
  const {
    aiDrawerOpen,
    openEventInSidecar,
    openAiInSidecar,
    experienceMode,
  } = useAppStore()
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const location = useLocation()
  // Grocery page has its own dedicated FAB for adding items.
  const hideFab = location.pathname.startsWith('/settings') || location.pathname.startsWith('/grocery') || screensaverActive

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

  // Global "open this event's details" primitive — opens non-blocking sidecar companion
  useEffect(() => {
    const onOpenEventById = (e: Event) => {
      const eventId = (e as CustomEvent<{ eventId?: string }>).detail?.eventId
      if (!eventId) return
      openEventInSidecar(eventId)
    }
    document.addEventListener('casa:open-event-details', onOpenEventById)
    return () => document.removeEventListener('casa:open-event-details', onOpenEventById)
  }, [openEventInSidecar])

  // Global AI chat dispatcher — opens Copilot tab in sidecar companion
  useEffect(() => {
    const onOpenAi = () => {
      openAiInSidecar()
    }
    document.addEventListener('open-ai-chat', onOpenAi)
    return () => document.removeEventListener('open-ai-chat', onOpenAi)
  }, [openAiInSidecar])

  return (
    <div className="app-shell flex flex-col overflow-hidden bg-casa-bg">
      {/* Full-width luxury top bar — adapts to experience mode */}
      <LuxuryTopBar />

      <div className="app-shell-main flex flex-1 min-h-0 relative overflow-hidden">
        {experienceMode === 'classic' && <TabletSidebar aiDrawerOpen={aiDrawerOpen} />}
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <AnimatedRoutes />
        </div>
        {/* Unified non-blocking Sidecar Companion for Events & AI */}
        <SidecarCompanion
          screensaverActive={screensaverActive}
          safeMode={IS_SAFE_MODE}
          routePath={location.pathname}
          wakeWordEnabled={settings.wakeWordEnabled}
        />
      </div>

      {/* Bottom nav only visible on mobile in classic mode */}
      {experienceMode === 'classic' && <NavBar />}

      {!hideFab && !aiDrawerOpen && experienceMode === 'classic' && (
        <AddEventFab onClick={() => setQuickCreateOpen(true)} visible={!quickCreateOpen} />
      )}

      <QuickCreateSheet
        open={quickCreateOpen}
        onClose={() => setQuickCreateOpen(false)}
      />

      <TouchKeyboard />

      {/* Global Living Canvas Undo Toast */}
      {experienceMode === 'living_canvas' && <CanvasUndoToast />}

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
        <QueryClientProvider client={queryClient}>
          <PinGate>
            <BrowserRouter>
              <AppErrorBoundary>
                <AppShell />
              </AppErrorBoundary>
            </BrowserRouter>
          </PinGate>
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}

