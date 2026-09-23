import { useEffect, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { drainQueue } from '../lib/offlineWriteQueue'
import { useOnlineStatus } from './useOnlineStatus'
import { supabase } from '../lib/supabase'

// Drains the offline write queue the moment connectivity returns. Mounted
// once at the app shell (see App.tsx) so it runs regardless of which page is
// open when the household reconnects.
export function useOfflineWriteQueue() {
  const isOnline = useOnlineStatus()
  const queryClient = useQueryClient()
  const wasOffline = useRef(false)

  useEffect(() => {
    if (!isOnline) {
      wasOffline.current = true
      return
    }
    if (!wasOffline.current) return // don't drain on the very first mount if we were already online
    wasOffline.current = false

    void drainQueue({
      upsert_event_bundle: async (payload) => {
        const { error } = await supabase.rpc('upsert_event_bundle', { p_payload: payload })
        if (error) throw error
      },
    }).then(() => {
      void queryClient.invalidateQueries({ queryKey: ['events'] })
    })
  }, [isOnline, queryClient])
}
