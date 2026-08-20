import { create } from 'zustand'

export interface UndoToastItem {
  id: string
  title: string
  actionLabel: string
  timeoutId: ReturnType<typeof setTimeout>
  onUndo: () => void
  onCommit: () => void
}

interface AttentionStore {
  // Cross-pane highlighting
  highlightedEventId: string | null
  highlightedPrepId: string | null
  highlightedConflictId: string | null
  setHighlightedEventId: (id: string | null) => void
  setHighlightedPrepId: (id: string | null) => void
  setHighlightedConflictId: (id: string | null) => void

  // Optimistic pending removals for Attention cards
  pendingDismissalIds: Set<string>
  addPendingDismissal: (id: string) => void
  removePendingDismissal: (id: string) => void

  // Active Undo Toast queue
  activeToast: UndoToastItem | null
  scheduleUndoableAction: (params: {
    id: string
    title: string
    actionLabel: string
    onUndo: () => void
    onCommit: () => void
    delayMs?: number
  }) => void
  triggerUndo: () => void
  dismissToast: () => void
}

export const useAttentionStore = create<AttentionStore>((set, get) => ({
  highlightedEventId: null,
  highlightedPrepId: null,
  highlightedConflictId: null,
  setHighlightedEventId: (highlightedEventId) => set({ highlightedEventId }),
  setHighlightedPrepId: (highlightedPrepId) => set({ highlightedPrepId }),
  setHighlightedConflictId: (highlightedConflictId) => set({ highlightedConflictId }),

  pendingDismissalIds: new Set<string>(),
  addPendingDismissal: (id) => {
    set((state) => {
      const next = new Set(state.pendingDismissalIds)
      next.add(id)
      return { pendingDismissalIds: next }
    })
  },
  removePendingDismissal: (id) => {
    set((state) => {
      const next = new Set(state.pendingDismissalIds)
      next.delete(id)
      return { pendingDismissalIds: next }
    })
  },

  activeToast: null,

  scheduleUndoableAction: ({ id, title, actionLabel, onUndo, onCommit, delayMs = 4000 }) => {
    // If there is an existing toast, commit it immediately before replacing
    const currentToast = get().activeToast
    if (currentToast) {
      clearTimeout(currentToast.timeoutId)
      try {
        currentToast.onCommit()
      } catch (err) {
        console.error('Error committing previous action:', err)
      }
    }

    get().addPendingDismissal(id)

    const timeoutId = setTimeout(() => {
      try {
        onCommit()
      } catch (err) {
        console.error('Error committing action:', err)
      }
      set({ activeToast: null })
      get().removePendingDismissal(id)
    }, delayMs)

    set({
      activeToast: {
        id,
        title,
        actionLabel,
        timeoutId,
        onUndo: () => {
          clearTimeout(timeoutId)
          get().removePendingDismissal(id)
          try {
            onUndo()
          } catch (err) {
            console.error('Error executing undo:', err)
          }
          set({ activeToast: null })
        },
        onCommit: () => {
          clearTimeout(timeoutId)
          try {
            onCommit()
          } catch (err) {
            console.error('Error committing action:', err)
          }
          set({ activeToast: null })
          get().removePendingDismissal(id)
        },
      },
    })
  },

  triggerUndo: () => {
    const toast = get().activeToast
    if (toast) {
      toast.onUndo()
    }
  },

  dismissToast: () => {
    const toast = get().activeToast
    if (toast) {
      toast.onCommit()
    }
  },
}))
