import { useMemo } from 'react'
import { useLiveClock } from './useLiveClock'
import { useTodayEvents, type EventWithDetails } from './useCalendarEvents'
import { useWeekConflicts, useResolveConflict } from './useConflicts'
import {
  usePrepItems,
  useCompletePrepItem,
  useDownvotePrepItem,
  useSnoozePrepItem,
} from './usePrepItems'
import type { SnoozeDuration } from '../utils/snoozeDuration'
import { useAttentionStore } from '../stores/attentionStore'
import { useAppStore } from '../stores/appStore'
import type { PrepItem, Conflict } from '../types'

export interface TurboCanvasPresenterState {
  now: Date
  todayEvents: EventWithDetails[]
  activeConflicts: Conflict[]
  activePrep: PrepItem[]
  highlightedEventId: string | null
  setHighlightedEventId: (id: string | null) => void
  handleResolveConflict: (conflict: Conflict, resolution: string) => void
  handleCompletePrep: (item: PrepItem) => void
  handleDownvotePrep: (item: PrepItem) => void
  handleSnoozePrep: (id: string, period: SnoozeDuration) => void
  setCanvasSubmode: (submode: 'calm' | 'turbo') => void
}

export function useTurboCanvasPresenter(): TurboCanvasPresenterState {
  const { setCanvasSubmode } = useAppStore()
  const now = useLiveClock(10_000)
  const { data: todayEvents = [] } = useTodayEvents(now)
  const { data: conflicts = [] } = useWeekConflicts()
  const { data: prepItems = [] } = usePrepItems()

  const resolveConflict = useResolveConflict()
  const completePrep = useCompletePrepItem()
  const downvotePrep = useDownvotePrepItem()
  const snoozePrep = useSnoozePrepItem()

  const {
    highlightedEventId,
    setHighlightedEventId,
    pendingDismissalIds,
    scheduleUndoableAction,
  } = useAttentionStore()

  // Filter out pending dismissed items optimistically
  const activeConflicts = useMemo(
    () => conflicts.filter((c) => !c.resolved && !pendingDismissalIds.has(`conflict-${c.id}`)),
    [conflicts, pendingDismissalIds]
  )

  const activePrep = useMemo(
    () => prepItems.filter((p) => !p.dismissed && !pendingDismissalIds.has(`prep-${p.id}`)),
    [prepItems, pendingDismissalIds]
  )

  // 1-Click Action Handlers with 4000ms Undo Window
  const handleResolveConflict = (conflict: Conflict, resolution: string) => {
    const toastId = `conflict-${conflict.id}`
    scheduleUndoableAction({
      id: toastId,
      title: 'Resolved conflict',
      actionLabel: resolution,
      onCommit: () => resolveConflict(conflict.id, resolution),
      onUndo: () => {},
    })
  }

  const handleCompletePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Completed task',
      actionLabel: label,
      onCommit: () => completePrep(item.id),
      onUndo: () => {},
    })
  }

  const handleDownvotePrep = (item: PrepItem) => {
    const toastId = `prep-${item.id}`
    const label = item.description || item.event_title || 'Prep Item'
    scheduleUndoableAction({
      id: toastId,
      title: 'Marked not relevant',
      actionLabel: label,
      onCommit: () => downvotePrep(item.id),
      onUndo: () => {},
    })
  }

  const handleSnoozePrep = (id: string, period: SnoozeDuration) => {
    snoozePrep(id, period)
  }

  return {
    now,
    todayEvents,
    activeConflicts,
    activePrep,
    highlightedEventId,
    setHighlightedEventId,
    handleResolveConflict,
    handleCompletePrep,
    handleDownvotePrep,
    handleSnoozePrep,
    setCanvasSubmode,
  }
}
