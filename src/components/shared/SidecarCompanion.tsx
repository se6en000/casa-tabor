import { useMemo, useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAppStore } from '../../stores/appStore'
import { useRollingEvents, fetchEventDetails, type EventWithDetails } from '../../hooks/useCalendarEvents'
import { useLiveClock } from '../../hooks/useLiveClock'
import { useFamilyMembers } from '../../hooks/useFamilyMembers'
import { useHomeWeather } from '../../hooks/useHomeWeather'
import { cn } from '../../utils/cn'
import LivingFlowSidecar from '../calendar/living-flow/LivingFlowSidecar'
import ActionInspectionSidecar from '../canvas/widgets/ActionInspectionSidecar'
import AIChatDrawer from './AIChatDrawer'

import { usePrepItems, usePrepItemDetails, useCompletePrepItem, useSnoozePrepItem } from '../../hooks/usePrepItems'
import { synthesizeActionAnalysis, extractAmount } from '../../utils/actionInspectionSynthesis'
import type { ActionAiContext } from '../../hooks/useAIAssistant'

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
    aiLaunchContext,
    sidecarTab,
    setSidecarTab,
    selectedSidecarEventId,
    setSelectedSidecarEventId,
    selectedSidecarActionId,
    openActionInSidecar,
    openAiInSidecar,
    closeSidecar,
  } = useAppStore()

  const queryClient = useQueryClient()
  const [focusedActionContext, setFocusedActionContext] = useState<ActionAiContext | null>(null)

  const now = useLiveClock(60_000)
  const { data: rollingEvents = [] } = useRollingEvents(now)
  const { data: family = [] } = useFamilyMembers()
  const { data: weather } = useHomeWeather()

  // Prep items & details for action sidecar context
  const { data: allPrep = [] } = usePrepItems()
  const activePrepItem = useMemo(() => {
    if (!selectedSidecarActionId) return null
    return allPrep.find((p) => p.id === selectedSidecarActionId) || null
  }, [allPrep, selectedSidecarActionId])
  const { data: activePrepDetails } = usePrepItemDetails(activePrepItem)

  const activeActionContext = useMemo<ActionAiContext | null>(() => {
    if (!activePrepItem) return focusedActionContext
    const analysis = synthesizeActionAnalysis(activePrepItem, activePrepDetails)
    const amount = extractAmount(activePrepItem.description) || extractAmount(activePrepItem.event_title)
    return {
      actionId: activePrepItem.id,
      title: activePrepItem.description || activePrepItem.event_title || analysis.subject,
      subject: analysis.subject,
      sender: `${analysis.senderLabel} <${analysis.senderEmail}>`,
      amount,
      urgency: analysis.urgency,
      requiredAction: analysis.requiredAction,
      householdImpact: analysis.householdImpact,
      emailBody: activePrepDetails?.gmailContext?.email_body || analysis.emailBody,
    }
  }, [activePrepItem, activePrepDetails, focusedActionContext])

  // Fetch full details if event is from outside rolling horizon
  const { data: fetchedEvent, isFetching: isFetchingEvent } = useQuery({
    queryKey: ['event-details', selectedSidecarEventId],
    queryFn: () => selectedSidecarEventId ? fetchEventDetails(selectedSidecarEventId) : null,
    enabled: Boolean(selectedSidecarEventId),
    staleTime: 5 * 60_000,
  })

  const selectedEvent = useMemo<EventWithDetails | null>(() => {
    if (!selectedSidecarEventId) return null
    if (fetchedEvent && fetchedEvent.start_time) return fetchedEvent
    const fromRolling = rollingEvents.find((e) => e.id === selectedSidecarEventId)
    if (fromRolling && fromRolling.start_time) return fromRolling

    // Search any active event queries cached in queryClient
    const allEventQueries = queryClient.getQueriesData<EventWithDetails[]>({ queryKey: ['events'] })
    for (const [, cachedList] of allEventQueries) {
      if (Array.isArray(cachedList)) {
        const found = cachedList.find((e) => e?.id === selectedSidecarEventId)
        if (found && found.start_time) return found
      }
    }

    return null
  }, [fetchedEvent, rollingEvents, selectedSidecarEventId, queryClient])

  // Auto-close sidecar if the event was deleted / no longer exists
  useEffect(() => {
    if (sidecarTab === 'event' && selectedSidecarEventId && !selectedEvent && !isFetchingEvent) {
      closeSidecar()
    }
  }, [sidecarTab, selectedSidecarEventId, selectedEvent, isFetchingEvent, closeSidecar])

  const [windowWidth, setWindowWidth] = useState(() => (typeof window !== 'undefined' ? window.innerWidth : 1280))
  const isMobile = windowWidth < 640

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const sidecarWidth = useMemo(() => {
    if (isMobile) return windowWidth
    // Exact 5/16 (31.25%) rail proportion matching Calm page & Casa Tabor design system
    return Math.min(840, Math.max(420, Math.round(windowWidth * 0.3125)))
  }, [isMobile, windowWidth])

  const isCook = routePath.startsWith('/cook')

  // Modeless Contextual Inspector Auto-Dismiss & Hot-Swap Engine
  // Allows full-page scrolling while sidecar is open; dismisses only on outside taps of non-sidecar targets.
  useEffect(() => {
    if (!aiDrawerOpen || isCook) return

    let pointerDownPos: { x: number; y: number; time: number } | null = null

    const handlePointerDown = (e: PointerEvent) => {
      pointerDownPos = { x: e.clientX, y: e.clientY, time: Date.now() }
    }

    const handleClickCapture = (e: MouseEvent) => {
      // Disambiguate scroll/drag gestures vs intentional taps
      if (pointerDownPos) {
        const dx = e.clientX - pointerDownPos.x
        const dy = e.clientY - pointerDownPos.y
        const dist = Math.hypot(dx, dy)
        const duration = Date.now() - pointerDownPos.time
        pointerDownPos = null

        // If user moved more than 8px, it was a drag-scroll/pan gesture — DO NOT CLOSE
        if (dist > 8) return
        // If user performed a long-press hold (> 450ms, e.g. slot create or context menu hold) — DO NOT CLOSE
        if (duration > 450) return
      }

      const target = e.target as HTMLElement | null
      if (!target) return

      // 1. Clicks inside the Sidecar itself: Stay open
      if (
        target.closest('[data-sidecar-companion]') ||
        target.closest('[data-sidecar-content]') ||
        target.closest('.sidecar-flip-viewport') ||
        target.closest('.sidecar-flip-card')
      ) {
        return
      }

      // 2. High-priority modals, overlays, virtual keyboard: Stay open / do not dismiss
      if (
        target.closest('[data-touch-keyboard]') ||
        target.closest('[data-portal-modal]') ||
        target.closest('[data-quick-create]') ||
        target.closest('[data-popover-menu]') ||
        target.closest('#pin-gate') ||
        target.closest('.quick-create-sheet')
      ) {
        return
      }

      // 3. Sidecar-Loadable targets (calendar events, action items, Copilot button, prep items):
      // Keep sidecar open so the element's click handler can hot-swap content in place!
      const isSidecarLoadable = Boolean(
        target.closest('[data-sidecar-loadable]') ||
        target.closest('[data-sidecar-trigger]') ||
        target.closest('[data-calendar-event]') ||
        target.closest('[data-event-block]') ||
        target.closest('[data-event-pill]') ||
        target.closest('[data-event-chip]') ||
        target.closest('[data-action-card]') ||
        target.closest('[data-action-item]') ||
        target.closest('[data-prep-item]') ||
        target.closest('[data-open-sidecar]') ||
        target.closest('[data-ai-trigger]') ||
        target.closest('[data-open-ai]') ||
        target.closest('.sidecar-loadable')
      )

      if (isSidecarLoadable) {
        return
      }

      // 4. Outside tap on canvas background, empty time slots, day headers, or non-sidecar UI:
      // Gracefully slide the sidecar closed
      closeSidecar()
    }

    window.addEventListener('pointerdown', handlePointerDown, { capture: true, passive: true })
    window.addEventListener('click', handleClickCapture, { capture: true })

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, { capture: true })
      window.removeEventListener('click', handleClickCapture, { capture: true })
    }
  }, [aiDrawerOpen, isCook, closeSidecar])

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

  const handleAskAiAboutAction = (actCtx?: ActionAiContext) => {
    if (actCtx) {
      setFocusedActionContext(actCtx)
      openAiInSidecar({
        source: 'action-sidecar',
        launchId: crypto.randomUUID(),
        agent: 'general',
      })
    } else {
      setSidecarTab('ai')
    }
  }

  const completePrepItem = useCompletePrepItem()
  const snoozePrepItem = useSnoozePrepItem()

  const isActionView = sidecarTab === 'action' && Boolean(selectedSidecarActionId)
  const isFlippedToAi = sidecarTab === 'ai'
  const isFrontView = !isFlippedToAi

  const sidecarContent = (
    <div className="flex-1 flex flex-col min-h-0 overflow-hidden relative w-full h-full sidecar-flip-viewport [perspective:1200px]">
      <motion.div
        className="w-full h-full relative sidecar-flip-card"
        initial={false}
        animate={{ rotateY: isFlippedToAi ? 180 : 0 }}
        transition={{ duration: 0.42, ease: [0.34, 1.3, 0.64, 1] }}
      >
        {/* Face 1: Action Inspection or Event Details View (Front Face) */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col min-h-0 overflow-hidden w-full h-full bg-casa-surface sidecar-flip-face-front',
            isFrontView ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'
          )}
          aria-hidden={!isFrontView}
        >
          {isActionView ? (
            <ActionInspectionSidecar
              actionId={selectedSidecarActionId}
              onClose={closeSidecar}
              embedded={true}
              onSwitchToAi={handleAskAiAboutAction}
              onCompleteAction={async (item) => {
                await completePrepItem(item.id)
              }}
              onSnoozeAction={async (item, period) => {
                await snoozePrepItem(item.id, period, item.due_by)
              }}
              onSelectAction={(id) => openActionInSidecar(id)}
              queueItems={allPrep}
            />
          ) : selectedEvent && selectedEvent.start_time ? (
            <LivingFlowSidecar
              key={selectedEvent.id}
              event={selectedEvent}
              onClose={closeSidecar}
              embedded={true}
              onAskAi={handleAskAiAboutEvent}
              onSwitchToAi={() => setSidecarTab('ai')}
            />
          ) : selectedSidecarEventId ? (
            <div className="flex flex-col items-center justify-center h-full p-8 text-center text-casa-muted gap-3">
              <div className="w-8 h-8 rounded-full border-2 border-casa-gold border-t-transparent animate-spin" />
              <p className="text-body-sm font-semibold text-casa-navy">Loading event details…</p>
            </div>
          ) : null}
        </div>

        {/* Face 2: Casa AI Copilot View (Back Face) */}
        <div
          className={cn(
            'absolute inset-0 flex flex-col min-h-0 overflow-hidden w-full h-full bg-casa-surface sidecar-flip-face-back',
            !isFrontView ? 'pointer-events-auto z-10' : 'pointer-events-none z-0'
          )}
          aria-hidden={isFrontView}
        >
          <AIChatDrawer
            open={aiDrawerOpen}
            onClose={closeSidecar}
            launchContext={aiLaunchContext || undefined}
            page={routePath.startsWith('/cook') ? 'cook' : routePath.startsWith('/calendar') ? 'calendar' : routePath.startsWith('/grocery') ? 'grocery' : 'home'}
            events={rollingEvents}
            family={family}
            homeCity={weather?.city}
            onSleepCommand={() => document.dispatchEvent(new CustomEvent('screensaver-on'))}
            focusedEvent={selectedEvent || undefined}
            focusedAction={activeActionContext || undefined}
            onOpenEventDetails={(evt) => {
              setSelectedSidecarEventId(evt.id)
              setSidecarTab('event')
            }}
            onSwitchToEvent={() => {
              if (selectedSidecarActionId) {
                setSidecarTab('action')
              } else if (selectedSidecarEventId || selectedEvent) {
                setSidecarTab('event')
              }
            }}
            embedded={true}
          />
        </div>
      </motion.div>
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
          data-sidecar-companion="true"
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          drag="y"
          dragConstraints={{ top: 0 }}
          dragElastic={{ top: 0, bottom: 0.5 }}
          onDragEnd={(_, info) => {
            if (info.offset.y > 120 || info.velocity.y > 400) {
              closeSidecar()
            }
          }}
          transition={{ type: 'spring', damping: 30, stiffness: 350 }}
          className="fixed inset-x-0 bottom-0 z-modal h-[88vh] max-h-[88vh] bg-casa-surface rounded-t-3xl shadow-2xl flex flex-col overflow-hidden sm:hidden border-t border-casa-border"
        >
          {/* Mobile Drag Dismiss Handle */}
          <div className="w-full flex items-center justify-center pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none select-none shrink-0">
            <div className="w-12 h-1.5 rounded-full bg-casa-muted/30" />
          </div>
          {sidecarContent}
        </motion.div>
      </AnimatePresence>
    )
  }

  return (
    <motion.aside
      key="sidecar-desktop-companion"
      data-sidecar-companion="true"
      initial={{ width: 0, opacity: 0 }}
      animate={{ width: sidecarWidth, opacity: 1 }}
      exit={{ width: 0, opacity: 0 }}
      transition={{ duration: 0.26, ease: [0.32, 0.72, 0, 1] }}
      className="hidden sm:flex flex-col flex-shrink-0 h-full overflow-hidden border-l border-casa-border bg-casa-surface relative z-10 shadow-lg"
      data-panel-overlay
      data-touch-keyboard="ignore"
    >
      <div className="h-full w-full flex flex-col flex-shrink-0" data-sidecar-content="true">
        {sidecarContent}
      </div>
    </motion.aside>
  )
}
