import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { usePageVisibility } from './usePageVisibility'

export interface Notification {
  id: string
  type:
    | 'event_added'
    | 'event_updated'
    | 'event_enriched'
    | 'gmail_import'
    | 'conflict'
    | 'briefing_ready'
    | 'policy_conflict'
    | 'policy_prep'
    | 'directory_suggestions'
    | 'push_event_30'
    | 'push_event_5'
    | 'push_reminder_30'
    | 'push_reminder_5'
    | 'push_action_done'
    | 'push_action_snooze'
    | 'push_action_thumbs_down'
    | 'rate_limit_warning'
  title: string
  body: string | null
  event_id: string | null
  source: string | null
  read: boolean
  created_at: string
  event: { start_time: string; title: string } | null
}

export function useNotifications() {
  const qc = useQueryClient()
  const isPageVisible = usePageVisibility()

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*, event:events(start_time, title)')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as unknown as Notification[]
    },
    refetchInterval: isPageVisible ? 60_000 : false, // stop background polling when the page is hidden
    staleTime: 30_000,
  })

  const unreadCount = notifications.filter(n => !n.read).length

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      await supabase.from('notifications').update({ read: true }).eq('id', id)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const markAllRead = useMutation({
    mutationFn: async () => {
      await supabase.from('notifications').update({ read: true }).eq('read', false)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const clearAll = useMutation({
    mutationFn: async () => {
      // Never bulk-delete unread conflict/policy_conflict rows — those are the "Needs Your
      // Attention" bucket and must be explicitly acknowledged, not swept away with routine
      // activity-log noise.
      await supabase
        .from('notifications')
        .delete()
        .gte('created_at', '2000-01-01')
        .or('read.eq.true,type.not.in.(conflict,policy_conflict)')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const addNotification = useCallback(async (n: Omit<Notification, 'id' | 'read' | 'created_at'>) => {
    await supabase.from('notifications').insert(n)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])

  return { notifications, unreadCount, isLoading, markRead, markAllRead, clearAll, addNotification }
}
