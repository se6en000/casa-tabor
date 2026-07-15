import { useState, useEffect, useCallback } from 'react'

export interface AIMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  imageDataUrl?: string
  streaming?: boolean
  conversationState?:
    | {
        activeEntityType: 'event'
        activeEventId: string
        activeEventUpdatedAt?: string | null
        eventType?: 'event' | 'reminder'
        expectedFollowUp: 'event_follow_up'
        establishedAt: string
      }
    | {
        activeEntityType: 'grocery_item'
        activeGroceryItemId: string
        expectedFollowUp: 'grocery_follow_up'
        establishedAt: string
      }
    | {
        activeEntityType: 'calendar_clarification'
        candidateEvents: Array<{
          id: string
          title: string
          start: string | null
          version: string | null
          eventType?: 'event' | 'reminder'
        }>
        pendingMutation: {
          tool: 'select_event' | 'update_event' | 'delete_event' | 'complete_reminder'
          args: Record<string, unknown>
          semanticTurn?: Record<string, unknown>
        }
        expectedFollowUp: 'calendar_clarification'
        establishedAt: string
      }
    | {
        activeEntityType: 'none'
        expectedFollowUp: 'none'
        establishedAt: string
      }
  toolAction?: {
    tool: string
    args: Record<string, unknown>
    displayText: string
    status: 'pending' | 'loading' | 'done' | 'error' | 'cancelled'
    actionId?: string
    errorMsg?: string
    resultEventId?: string
    syncWarning?: string
    syncStatus?: 'synced' | 'queued' | 'failed'
    undoStatus?: 'idle' | 'loading' | 'done' | 'error'
    undoErrorMsg?: string
  }
}

export interface AISession {
  id: string
  created_at: string
  ended_at?: string
  messages: AIMessage[]
}

const STORAGE_KEY = 'casa_tabor_ai_session'
const IDLE_TIMEOUT_MS = 12 * 60 * 60 * 1000 // 12 hours

function normalizeInterruptedMessages(messages: AIMessage[]): { messages: AIMessage[]; changed: boolean } {
  let changed = false
  const normalized = messages.map((message) => {
    if (!message.toolAction) return message

    let nextToolAction = message.toolAction
    if (nextToolAction.status === 'loading') {
      changed = true
      nextToolAction = {
        ...nextToolAction,
        status: 'error',
        errorMsg: nextToolAction.errorMsg ?? 'Previous action was interrupted. Please retry.',
      }
    }

    if (nextToolAction.undoStatus === 'loading') {
      changed = true
      nextToolAction = {
        ...nextToolAction,
        undoStatus: 'error',
        undoErrorMsg: nextToolAction.undoErrorMsg ?? 'Undo was interrupted. Tap Undo again to retry.',
      }
    }

    return nextToolAction === message.toolAction ? message : { ...message, toolAction: nextToolAction }
  })

  return { messages: normalized, changed }
}

function readStorage(): AISession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as AISession
  } catch { return null }
}

function writeStorage(session: AISession | null) {
  try {
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session))
    else localStorage.removeItem(STORAGE_KEY)
  } catch { /* storage full */ }
}

function genId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)
}

export function useAISession() {
  const [session, setSessionState] = useState<AISession | null>(null)
  const [loading, setLoading] = useState(true)

  // Write-through helper
  const setSession = useCallback((s: AISession | null) => {
    writeStorage(s)
    setSessionState(s)
  }, [])

  useEffect(() => {
    const stored = readStorage()
    if (stored && !stored.ended_at) {
      const age = Date.now() - new Date(stored.created_at).getTime()
      if (age > IDLE_TIMEOUT_MS) {
        writeStorage(null)
        setSessionState(null)
      } else {
        const normalized = normalizeInterruptedMessages(stored.messages ?? [])
        const hydrated = normalized.changed ? { ...stored, messages: normalized.messages } : stored
        if (normalized.changed) writeStorage(hydrated)
        setSessionState(hydrated)
      }
    } else {
      setSessionState(null)
    }
    setLoading(false)
  }, [])

  const startNewSession = useCallback((): AISession => {
    const newSession: AISession = {
      id: genId(),
      created_at: new Date().toISOString(),
      messages: [],
    }
    setSession(newSession)
    return newSession
  }, [setSession])

  const endSession = useCallback(() => {
    writeStorage(null)
    setSessionState(null)
  }, [])

  const saveMessages = useCallback((_sessionId: string, messages: AIMessage[]) => {
    setSessionState(prev => {
      if (!prev) return prev
      // Strip large image data before saving to avoid localStorage quota issues
      const toSave = messages.map(m => ({
        ...m,
        imageDataUrl: undefined, // don't persist images
        toolAction: m.toolAction ? {
          ...m.toolAction,
          // keep tool action state so user can see history of what was done
        } : undefined,
      }))
      const updated = { ...prev, messages: toSave }
      writeStorage(updated)
      return updated
    })
  }, [])

  return { session, loading, startNewSession, endSession, saveMessages, setSession }
}
