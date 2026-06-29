import { useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export interface Notification {
  id: string
  type: 'event_added' | 'event_updated' | 'event_enriched' | 'gmail_import' | 'conflict' | 'briefing_ready'
  title: string
  body: string | null
  event_id: string | null
  source: string | null
  read: boolean
  created_at: string
}

export function useNotifications() {
  const qc = useQueryClient()

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)
      if (error) throw error
      return data as Notification[]
    },
    refetchInterval: 60_000, // poll every 60s — avoids realtime StrictMode issues
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
      await supabase.from('notifications').delete().gte('created_at', '2000-01-01')
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })

  const addNotification = useCallback(async (n: Omit<Notification, 'id' | 'read' | 'created_at'>) => {
    await supabase.from('notifications').insert(n)
    qc.invalidateQueries({ queryKey: ['notifications'] })
  }, [qc])

  return { notifications, unreadCount, isLoading, markRead, markAllRead, clearAll, addNotification }
}

