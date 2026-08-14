import { useEffect, useRef } from 'react'
import { useAppStore } from '../stores/appStore.ts'
import {
  fetchTonightDinnerPlan,
  subscribeToTonightDinnerPlan,
  isValidDinnerPlan,
} from '../utils/dinnerPlanSync.ts'
import type { DinnerPlan } from '../types'

/**
 * Global hook to keep Tonight's Dinner plan synchronized across all connected
 * Casa Tabor devices in real time using Supabase Realtime broadcasts and cloud persistence.
 */
export function useTonightDinnerSync() {
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true

    // 1. Reconcile from remote Supabase on initial mount
    const reconcileFromCloud = async () => {
      try {
        const cloudPlan = await fetchTonightDinnerPlan()
        if (cloudPlan && isValidDinnerPlan(cloudPlan) && isMountedRef.current) {
          const currentLocal = useAppStore.getState().dinnerPlan
          // Update store if different or remote is newer
          const isDifferent =
            currentLocal.title !== cloudPlan.title ||
            currentLocal.mode !== cloudPlan.mode ||
            currentLocal.targetTime !== cloudPlan.targetTime ||
            currentLocal.subtitle !== cloudPlan.subtitle ||
            currentLocal.chefOrDriver !== cloudPlan.chefOrDriver ||
            currentLocal.statusBadge !== cloudPlan.statusBadge

          if (isDifferent) {
            useAppStore.getState().setDinnerPlan(cloudPlan, { localOnly: true })
          }
        }
      } catch (err) {
        console.warn('[useTonightDinnerSync] Initial fetch error:', err)
      }
    }

    void reconcileFromCloud()

    // 2. Subscribe to real-time broadcasts from other connected devices
    const unsubscribe = subscribeToTonightDinnerPlan((incomingPlan: DinnerPlan) => {
      if (!isMountedRef.current) return
      useAppStore.getState().setDinnerPlan(incomingPlan, { localOnly: true })
    })

    // 3. Re-check on visibility change, focus, or online reconnect (e.g. tablet waking up)
    const handleWakeOrFocus = () => {
      if (document.visibilityState === 'visible') {
        void reconcileFromCloud()
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
