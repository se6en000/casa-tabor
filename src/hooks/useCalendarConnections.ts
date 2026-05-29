import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'

export interface ConnectionStatus {
  family_member_id: string
  google_email: string
  connected_at: string
  last_sync_at: string | null
  last_sync_error: string | null
}

export interface MemberWithConnection extends FamilyMember {
  connection: ConnectionStatus | null
}

export function useCalendarConnections() {
  return useQuery({
    queryKey: ['calendar-connections'],
    staleTime: 0,
    queryFn: async (): Promise<MemberWithConnection[]> => {
      const [{ data: members, error: mErr }, { data: connections, error: cErr }] =
        await Promise.all([
          supabase.from('family_members').select('*').order('sort_order'),
          supabase.from('google_connection_status').select('*'),
        ])

      if (mErr) throw mErr
      if (cErr) throw cErr

      const byId = new Map(
        (connections ?? []).map((c: any) => [c.family_member_id as string, c as ConnectionStatus]),
      )
      return (members ?? []).map((m: FamilyMember) => ({
        ...m,
        connection: byId.get(m.id) ?? null,
      }))
    },
  })
}

export function useStartConnect() {
  return useMutation({
    mutationFn: async (familyMemberId: string) => {
      const { data, error } = await supabase.functions.invoke('google-oauth-start', {
        body: { family_member_id: familyMemberId },
      })
      if (error) {
        console.error('[useStartConnect] invoke error:', error)
        throw error
      }
      console.log('[useStartConnect] response data:', data)
      if (!data?.url) throw new Error('No consent URL returned')
      window.open(data.url as string, '_self')
    },
    onError: (err) => {
      console.error('[useStartConnect] mutation error:', err)
    },
  })
}

export function useSyncNow() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (familyMemberId?: string) => {
      const { data, error } = await supabase.functions.invoke('sync-calendars', {
        body: familyMemberId ? { family_member_id: familyMemberId } : {},
      })
      if (error) throw error
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['calendar-connections'] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

export function useDisconnect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (familyMemberId: string) => {
      const { data, error } = await supabase.functions.invoke('disconnect-calendar', {
        body: { family_member_id: familyMemberId },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      console.log('[useDisconnect] deleted rows:', data?.deleted)
    },
    // Optimistically remove the connection from the cache immediately
    onMutate: async (familyMemberId: string) => {
      await qc.cancelQueries({ queryKey: ['calendar-connections'] })
      const previous = qc.getQueryData<MemberWithConnection[]>(['calendar-connections'])
      qc.setQueryData<MemberWithConnection[]>(['calendar-connections'], (old) =>
        old?.map(m => m.id === familyMemberId ? { ...m, connection: null } : m) ?? []
      )
      return { previous }
    },
    onError: (_err, _id, ctx) => {
      // Roll back on error
      if (ctx?.previous) qc.setQueryData(['calendar-connections'], ctx.previous)
    },
    onSettled: async () => {
      await qc.invalidateQueries({ queryKey: ['calendar-connections'] })
      await qc.refetchQueries({ queryKey: ['calendar-connections'] })
    },
  })
}
