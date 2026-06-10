import { useState, useEffect, Component, type ReactNode } from 'react'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import NavBar from './components/shared/NavBar'
import AnimatedRoutes from './components/shared/AnimatedRoutes'
import TabletSidebar from './components/layout/TabletSidebar'
import { useRoomTone } from './hooks/useRoomTone'
import { useTravelScan } from './hooks/useTravelScan'
import { usePushNotifications } from './hooks/usePushNotifications'
import { ThemeProvider } from './contexts/ThemeContext'
import { TopBarC } from './components/shared/TopBar'
import PinGate from './components/shared/PinGate'
import AIChatDrawer from './components/shared/AIChatDrawer'
import ArtScreensaver from './components/shared/ArtScreensaver'
import { useRollingEvents } from './hooks/useCalendarEvents'
import { useFamilyMembers } from './hooks/useFamilyMembers'
import { useHomeWeather } from './hooks/useHomeWeather'
import { useLiveClock } from './hooks/useLiveClock'
import { useWakeWord } from './hooks/useWakeWord'
import { useIdleTimer } from './hooks/useIdleTimer'

const IDLE_SCREENSAVER_MS = 5  * 60 * 1000  // 5 min → art screensaver
const IDLE_DISPLAY_OFF_MS = 10 * 60 * 1000  // 10 min → monitor sleep

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null }
  static getDerivedStateFromError(error: Error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div className="flex flex-col items-center justify-center h-screen bg-casa-bg gap-4 px-8 text-center">
          <p className="text-2xl">😞</p>
          <p className="font-semibold text-casa-navy">Something went wrong</p>
          <p className="text-casa-muted text-sm">{(this.state.error as Error).message}</p>
          <button
            onClick={() => { this.setState({ error: null }); window.location.reload() }}
            className="mt-2 px-4 py-2 bg-casa-gold text-white rounded-button text-sm font-medium"
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

function GlobalAIDrawer({ screensaverActive }: { screensaverActive: boolean }) {
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<{ right: number; top: number } | undefined>()
  const now = useLiveClock(60_000)
  const { data: events = [] } = useRollingEvents(now)
  const { data: family = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()
  useWakeWord(open, screensaverActive)

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail) setAnchor(detail)
      setOpen(true)
    }
    document.addEventListener('open-ai-chat', handler)
    return () => document.removeEventListener('open-ai-chat', handler)
  }, [])

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
    />
  )
}

function AppShell() {
  useRoomTone()
  useTravelScan()
  usePushNotifications()
  useIdleTimer(IDLE_SCREENSAVER_MS, IDLE_DISPLAY_OFF_MS)

  const [screensaverActive, setScreensaverActive] = useState(false)

  useEffect(() => {
    const onSleep = () => setScreensaverActive(true)
    const onWake  = () => setScreensaverActive(false)
    document.addEventListener('screensaver-on', onSleep)
    document.addEventListener('wake-kiosk', onWake)
    return () => {
      document.removeEventListener('screensaver-on', onSleep)
      document.removeEventListener('wake-kiosk', onWake)
    }
  }, [])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-casa-bg">
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

      {/* Global AI drawer — opens from TopBar sparkle or wake word */}
      <GlobalAIDrawer screensaverActive={screensaverActive} />

      {/* Art screensaver overlay */}
      {screensaverActive && (
        <ArtScreensaver onDismiss={() => setScreensaverActive(false)} />
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
