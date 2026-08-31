import { useState, useEffect, Component, type ReactNode } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import MobileFloatingDock from './components/layout/MobileFloatingDock'
import { useRoomTone } from './hooks/useRoomTone'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useAppUpdater } from './hooks/useAppUpdater'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import LuxuryTopBar from './components/shared/LuxuryTopBar'
import MobileTopBar from './components/layout/MobileTopBar'
import PinGate from './components/shared/PinGate'
import ArtScreensaver from './components/shared/ArtScreensaver'
import QuickCreateSheet from './components/shared/QuickCreateSheet'
import SyncTriageModal from './components/calendar/SyncTriageModal'
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
import { useHouseholdTodoSync } from './hooks/useHouseholdTodoSync'
import { useReminderNeedsYouActions } from './hooks/useReminderNeedsYouActions'

import { AlertTriangle } from 'lucide-react'

const SAFE_MODE = String(import.meta.env.VITE_SAFE_MODE ?? '').toLowerCase()
const IS_SAFE_MODE = SAFE_MODE === '1' || SAFE_MODE === 'true' || SAFE_MODE === 'yes'

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="app-shell flex flex-col items-center justify-center bg-casa-bg gap-4 px-page-gutter text-center">
          <div className="w-12 h-12 rounded-full bg-casa-gold/10 flex items-center justify-center text-casa-gold">
            <AlertTriangle className="w-6 h-6" />
          </div>
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
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
      retry: 1,
    },
  },
})

function AppShell() {
  const queryClient = useQueryClient()
  const { currentZone } = useRoomTone()
  const { setRoomToneZone } = useTheme()
  usePushNotifications()
  useAppUpdater()
  useTonightDinnerSync()
  useHouseholdTodoSync()

  const { settings } = useScreensaverSettings()
  const ssMs   = settings.enabled && !IS_SAFE_MODE ? settings.screensaverMins * 60_000 : Infinity
  const dispMs = settings.displaySleepEnabled && !IS_SAFE_MODE ? settings.displayOffMins * 60_000 : Infinity
  useIdleTimer(ssMs, dispMs)

  const now = useLiveClock(60_000)
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { queueMissedReminders } = useReminderNeedsYouActions()

  useEffect(() => {
    if (rollingEvents.length > 0) {
      void queueMissedReminders(rollingEvents, now).catch(() => {})
    }
  }, [rollingEvents, now, queueMissedReminders])

  const [screensaverActive, setScreensaverActive] = useState(false)
  const {
    aiDrawerOpen,
    openEventInSidecar,
    openActionInSidecar,
    openAiInSidecar,
    experienceMode,
    quickCreateOpen,
    quickCreateInitialStart,
    quickCreateInitialQuery,
    openQuickCreate,
    closeQuickCreate,
  } = useAppStore()
  const location = useLocation()

  // Global keyboard shortcut ('C' or 'N' to open rapid intake)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (screensaverActive || quickCreateOpen || aiDrawerOpen) return
      // Ignore if user is actively typing in a form control
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable ||
          target.closest('[role="dialog"]') ||
          target.closest('[data-touch-keyboard]'))
      ) {
        return
      }

      if (e.key === 'c' || e.key === 'C' || e.key === 'n' || e.key === 'N') {
        if (!e.metaKey && !e.ctrlKey && !e.altKey) {
          e.preventDefault()
          openQuickCreate()
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [screensaverActive, quickCreateOpen, aiDrawerOpen, openQuickCreate])

  // Global "open quick create" custom event
  useEffect(() => {
    const onOpenQuickCreate = (e: Event) => {
      const detail = (e as CustomEvent<{ initialStart?: Date; initialQuery?: string }>).detail
      openQuickCreate(detail?.initialStart, detail?.initialQuery)
    }
    document.addEventListener('casa:open-quick-create', onOpenQuickCreate)
    return () => document.removeEventListener('casa:open-quick-create', onOpenQuickCreate)
  }, [openQuickCreate])

  useEffect(() => {
    setRoomToneZone(currentZone)
  }, [currentZone, setRoomToneZone])

  useEffect(() => {
    const triggerCatchUpSync = () => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
      void queryClient.invalidateQueries({ queryKey: ['grocery'] })
      void queryClient.invalidateQueries({ queryKey: ['notifications'] })
      void queryClient.invalidateQueries({ queryKey: ['conflicts'] })
    }

    const onSleep = () => setScreensaverActive(true)
    const onSleepIdle = () => {
      if (aiDrawerOpen) return
      setScreensaverActive(true)
    }
    const onWake  = () => {
      setScreensaverActive(false)
      triggerCatchUpSync()
    }
    const onVisibilityOrFocus = () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') {
        triggerCatchUpSync()
      }
    }

    document.addEventListener('screensaver-on', onSleep)
    document.addEventListener('screensaver-idle-on', onSleepIdle)
    document.addEventListener('wake-kiosk', onWake)
    document.addEventListener('visibilitychange', onVisibilityOrFocus)
    window.addEventListener('focus', onVisibilityOrFocus)
    window.addEventListener('online', onVisibilityOrFocus)

    return () => {
      document.removeEventListener('screensaver-on', onSleep)
      document.removeEventListener('screensaver-idle-on', onSleepIdle)
      document.removeEventListener('wake-kiosk', onWake)
      document.removeEventListener('visibilitychange', onVisibilityOrFocus)
      window.removeEventListener('focus', onVisibilityOrFocus)
      window.removeEventListener('online', onVisibilityOrFocus)
    }
  }, [aiDrawerOpen, queryClient])

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

  // Global "open this action's details" primitive — opens non-blocking sidecar companion
  useEffect(() => {
    const onOpenActionById = (e: Event) => {
      const actionId = (e as CustomEvent<{ actionId?: string }>).detail?.actionId
      if (!actionId) return
      openActionInSidecar(actionId)
    }
    document.addEventListener('casa:open-action-details', onOpenActionById)
    return () => document.removeEventListener('casa:open-action-details', onOpenActionById)
  }, [openActionInSidecar])

  // Global AI chat dispatcher — opens Copilot tab in sidecar companion
  useEffect(() => {
    const onOpenAi = (e: Event) => {
      const customEvent = e as CustomEvent<import('./stores/appStore').AIChatLaunchContext | undefined>
      const detail = customEvent.detail
      openAiInSidecar(detail || undefined)
    }
    document.addEventListener('open-ai-chat', onOpenAi)
    return () => document.removeEventListener('open-ai-chat', onOpenAi)
  }, [openAiInSidecar])

  return (
    <div className="app-shell flex flex-col overflow-hidden bg-casa-bg">
      {/* Full-width luxury top bar — adapts to experience mode (desktop >= lg) */}
      <LuxuryTopBar />

      {/* Global luxury concierge top bar (< lg) */}
      <MobileTopBar />

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

      {/* Dynamic Floating Navigation Capsule on mobile viewports (< lg) */}
      {!screensaverActive && (
        <MobileFloatingDock onOpenQuickCreate={() => openQuickCreate()} />
      )}

      <QuickCreateSheet
        open={quickCreateOpen}
        onClose={closeQuickCreate}
        initialStart={quickCreateInitialStart}
        initialQuery={quickCreateInitialQuery}
      />

      <SyncTriageModal />

      <TouchKeyboard />

      {/* Global Undo Toast */}
      <CanvasUndoToast />

      {/* Art screensaver overlay — always available when triggered manually; idle auto-fire respects settings.enabled */}
      {screensaverActive && (
        <ArtScreensaver
          onDismiss={() => setScreensaverActive(false)}
          rotationMins={settings.rotationMins}
          minArtWidthVw={settings.minArtWidthVw}
          artDimOffset={settings.artDimOffset}
          shuffle={settings.shuffle}
          plaqueMode={settings.plaqueMode}
          matPreset={settings.matPreset}
          aspectRatioMode={settings.aspectRatioMode}
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

