import { useEffect, useRef } from 'react'
import {
  fetchTodoCompletions,
  subscribeToTodoSync,
} from '../utils/todoCompletionsSync.ts'

/**
 * Global hook to initialize the household todo completions sync channel
 * and keep all devices in sync on mount, focus, and network reconnect.
 */
export function useHouseholdTodoSync() {
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    // 1. Initial reconcile from cloud
    const reconcile = async () => {
      try {
        await fetchTodoCompletions()
      } catch (err) {
        console.warn('[useHouseholdTodoSync] Reconcile error:', err)
      }
    }

    void reconcile()

    // 2. Subscribe to realtime broadcast channel
    const unsubscribe = subscribeToTodoSync(() => {
      // Handled by active components listening to the sync pipeline
    })

    // 3. Wake / focus catch-up sync
    const handleWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void reconcile()
      }
    }

    document.addEventListener('visibilitychange', handleWakeOrFocus)
    window.addEventListener('focus', handleWakeOrFocus)
    window.addEventListener('online', handleWakeOrFocus)

    return () => {
      isMountedRef.current = false
      unsubscribe()
      document.removeEventListener('visibilitychange', handleWakeOrFocus)
      window.removeEventListener('focus', handleWakeOrFocus)
      window.removeEventListener('online', handleWakeOrFocus)
    }
  }, [])
}
