import { useState, useEffect, Component, type ReactNode } from 'react'
import { BrowserRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { useTravelScan } from './hooks/useTravelScan'
import { usePushNotifications } from './hooks/usePushNotifications'
import { useAppUpdater } from './hooks/useAppUpdater'
import { ThemeProvider, useTheme } from './contexts/ThemeContext'
import { TopBarC } from './components/shared/TopBar'
import PinGate from './components/shared/PinGate'
import AIChatDrawer from './components/shared/AIChatDrawer'
import ArtScreensaver from './components/shared/ArtScreensaver'
import QuickCreateSheet from './components/shared/QuickCreateSheet'
import AddEventFab from './components/shared/AddEventFab'
import TouchKeyboard from './components/shared/TouchKeyboard'
import { useRollingEvents } from './hooks/useCalendarEvents'
import type { EventWithDetails } from './hooks/useCalendarEvents'
import { useFamilyMembers } from './hooks/useFamilyMembers'
import { Button } from './components/ui'
import { useHomeWeather } from './hooks/useHomeWeather'
import { useLiveClock } from './hooks/useLiveClock'
import { useWakeWord } from './hooks/useWakeWord'
import { useIdleTimer } from './hooks/useIdleTimer'
import { useScreensaverSettings } from './hooks/useScreensaverSettings'
import EventDetailPanel from './components/calendar/EventDetailPanel'

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

type LaunchAgent = 'general' | 'chef'

interface AIDrawerLaunchContext {
  launchId: string
  prompt?: string
  autoSend?: boolean
  source?: string
  page?: string
  agent?: LaunchAgent
  traceId?: string
  wakeAt?: number
}

type OpenAIChatDetail = {
  right?: number
  top?: number
  anchor?: { right: number; top: number }
  prompt?: string
  autoSend?: boolean
  source?: string
  page?: string
  agent?: LaunchAgent
  traceId?: string
  wakeAt?: number
}

function GlobalAIDrawer({
  screensaverActive,
  open,
  setOpen,
  safeMode,
  routePath,
  wakeWordEnabled,
  onOpenEventDetails,
}: {
  screensaverActive: boolean
  open: boolean
  setOpen: (open: boolean) => void
  safeMode: boolean
  routePath: string
  wakeWordEnabled: boolean
  onOpenEventDetails: (event: EventWithDetails) => void
}) {
  const [anchor, setAnchor] = useState<{ right: number; top: number } | undefined>()
  const [launchContext, setLaunchContext] = useState<AIDrawerLaunchContext | undefined>()
  const now = useLiveClock(60_000)
  const { data: events = [] } = useRollingEvents(now)
  const { data: family = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()
  useWakeWord(open, screensaverActive, !safeMode && wakeWordEnabled)

  const routePage = routePath.startsWith('/calendar')
    ? 'calendar'
    : routePath.startsWith('/grocery')
      ? 'grocery'
      : routePath.startsWith('/cook')
        ? 'cook'
        : routePath.startsWith('/briefing')
          ? 'briefing'
          : routePath === '/'
            ? 'home'
            : 'app'

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = ((e as CustomEvent<OpenAIChatDetail>).detail ?? {}) as OpenAIChatDetail
      const anchorFromEvent = detail.anchor ?? (
        typeof detail.right === 'number' && typeof detail.top === 'number'
          ? { right: detail.right, top: detail.top }
          : undefined
      )
      if (anchorFromEvent) setAnchor(anchorFromEvent)
      const inferredAgent: LaunchAgent = detail.agent ?? (routePage === 'cook' ? 'chef' : 'general')
      setLaunchContext({
        launchId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        prompt: detail.prompt,
        autoSend: detail.autoSend,
        source: detail.source,
        page: detail.page ?? routePage,
        agent: inferredAgent,
        traceId: detail.traceId,
        wakeAt: detail.wakeAt,
      })
      setOpen(true)
    }
    document.addEventListener('open-ai-chat', handler)
    return () => document.removeEventListener('open-ai-chat', handler)
  }, [routePage, setOpen])

  return (
    <AIChatDrawer
      open={open}
      onClose={() => setOpen(false)}
      anchor={anchor}
      page={launchContext?.page ?? routePage}
      events={events}
      family={family}
      homeCity={weather?.city}
      onSleepCommand={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
      launchContext={launchContext}
      onOpenEventDetails={onOpenEventDetails}
    />
  )
}

function AppShell() {
  const { currentZone } = useRoomTone()
  const { setRoomToneZone } = useTheme()
  useTravelScan()
  usePushNotifications()
  useAppUpdater()

  const { settings } = useScreensaverSettings()
  const ssMs   = settings.enabled && !IS_SAFE_MODE ? settings.screensaverMins * 60_000 : Infinity
  const dispMs = settings.displaySleepEnabled && !IS_SAFE_MODE ? settings.displayOffMins * 60_000 : Infinity
  useIdleTimer(ssMs, dispMs)

  const [screensaverActive, setScreensaverActive] = useState(false)
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [selectedDrawerEvent, setSelectedDrawerEvent] = useState<EventWithDetails | null>(null)
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

  const openEventDetailsFromAssistant = (event: EventWithDetails) => {
    document.dispatchEvent(new CustomEvent('casa:close-event-details'))
    setAiDrawerOpen(false)
    setSelectedDrawerEvent(event)
  }

  return (
    <div className="app-shell flex flex-col overflow-hidden bg-casa-bg">
      {/* Full-width top bar — sticky, never scrolls */}
      <TopBarC />

      <div className="app-shell-main flex flex-1 min-h-0">
        <TabletSidebar />
        <div className="flex-1 min-w-0 overflow-hidden h-full">
          <AnimatedRoutes />
        </div>
      </div>

      {/* Bottom nav only visible on mobile */}
      <NavBar />

      {!hideFab && (
        <AddEventFab onClick={() => setQuickCreateOpen(true)} visible={!quickCreateOpen} />
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
        routePath={location.pathname}
        wakeWordEnabled={settings.wakeWordEnabled}
        onOpenEventDetails={openEventDetailsFromAssistant}
      />

      <EventDetailPanel
        event={selectedDrawerEvent}
        onClose={() => setSelectedDrawerEvent(null)}
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
