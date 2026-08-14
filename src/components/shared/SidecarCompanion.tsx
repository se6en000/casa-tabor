import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAppStore } from '../../stores/appStore'
import { useRollingEvents, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { cn } from '../../utils/cn'
import EventDetailPanel from '../calendar/EventDetailPanel'
import AIChatDrawer from './AIChatDrawer'

interface SidecarCompanionProps {
  screensaverActive: boolean
  safeMode: boolean
  routePath: string
  wakeWordEnabled: boolean
}

export default function SidecarCompanion({
  routePath,
}: SidecarCompanionProps) {
  const {
    aiDrawerOpen,
    sidecarTab,
    setSidecarTab,
    selectedSidecarEventId,
    setSelectedSidecarEventId,
    closeSidecar,
  } = useAppStore()

  const now = useLiveClock(60_000)
  const { data: events = [] } = useRollingEvents(now)
  const { data: family = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()

  const selectedEvent = useMemo(
    () => (selectedSidecarEventId ? events.find((e) => e.id === selectedSidecarEventId) || ({ id: selectedSidecarEventId } as EventWithDetails) : null),
    [events, selectedSidecarEventId]
  )

  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  const isMobile = windowWidth < 640

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const sidecarWidth = useMemo(() => {
    if (isMobile) return windowWidth
    // Scale proportionally: ~35% of viewport width, comfortably bounded between 400px (laptops/tablets) and 840px (1080p+ kiosks)
    return Math.min(840, Math.max(400, Math.round(windowWidth * 0.35)))
  }, [isMobile, windowWidth])

  const isCook = routePath.startsWith('/cook')

  useEffect(() => {
    if (aiDrawerOpen && !isMobile && !isCook) {
      document.documentElement.style.setProperty('--ai-sidecar-width', `${sidecarWidth}px`)
    } else {
      document.documentElement.style.setProperty('--ai-sidecar-width', '0px')
    }
    return () => {
      document.documentElement.style.setProperty('--ai-sidecar-width', '0px')
    }
  }, [aiDrawerOpen, isMobile, isCook, sidecarWidth])

  if (!aiDrawerOpen || isCook) return null

  const handleAskAiAboutEvent = (promptText?: string) => {
    setSidecarTab('ai')
    if (promptText) {
      document.dispatchEvent(
        new CustomEvent('open-ai-chat', {
          detail: {
            prompt: promptText,
            autoSend: true,
            source: 'event-sidecar',
          },
        })
      )
    }
  }

  const isEventView = sidecarTab === 'event' && Boolean(selectedEvent)

  const sidecarContent = (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative w-full h-full">
      {/* Event Details View (Kept mounted in DOM to preserve edit state and draft forms) */}
      <div className={cn(
        'flex-1 flex flex-col min-h-0 overflow-hidden w-full h-full',
        isEventView ? 'flex' : 'hidden'
      )}>
        {selectedEvent && (
          <EventDetailPanel
            event={selectedEvent}
            onClose={closeSidecar}
            embedded={true}
            onAskAi={handleAskAiAboutEvent}
          />
        )}
      </div>

      {/* Casa AI Copilot View (Kept mounted in DOM to preserve conversation stream) */}
      <div className={cn(
        'flex-1 flex flex-col min-h-0 overflow-hidden w-full h-full',
        !isEventView ? 'flex' : 'hidden'
      )}>
        <AIChatDrawer
          open={aiDrawerOpen}
          onClose={closeSidecar}
          page={routePath.startsWith('/cook') ? 'cook' : routePath.startsWith('/calendar') ? 'calendar' : 'home'}
          events={events}
          family={family}
          homeCity={weather?.city}
          onSleepCommand={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
          focusedEvent={selectedEvent || undefined}
          onOpenEventDetails={(evt) => {
            setSelectedSidecarEventId(evt.id)
            setSidecarTab('event')
          }}
          embedded={true}
        />
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          key="sidecar-mobile-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-modal bg-casa-navy/20 backdrop-blur-xs sm:hidden"
          onClick={closeSidecar}
        />
        <motion.div
          key="sidecar-mobile-sheet"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="fixed inset-x-0 bottom-0 z-modal h-[88vh] max-h-[88vh] bg-casa-surface rounded-t-3xl shadow-2xl flex flex-col overflow-hidden sm:hidden border-t border-casa-border"
        >
          {sidecarContent}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <motion.aside
      key="sidecar-desktop-companion"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: sidecarWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
      className="hidden sm:flex flex-col flex-shrink-0 h-full overflow-hidden border-l border-casa-border bg-casa-surface relative z-10 shadow-lg"
      data-panel-overlay
      data-touch-keyboard="ignore"
    >
      <div className="h-full w-full flex flex-col flex-shrink-0">
        {sidecarContent}
      </div>
    </motion.aside>
  )
}
