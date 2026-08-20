import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import type { FamilyMember } from '../types'

export interface ConnectionStatus {
  family_member_id: string
  google_email: string
  connected_at: string
  last_sync_at: string | null
  last_sync_error: string | null
  connection_id: string | null
  calendar_id: string | null
  access_mode: 'writable' | 'read_only' | null
  adoption_policy: 'automatic' | 'explicit' | 'none' | null
  is_enabled: boolean | null
  health_status: 'connected' | 'healthy' | 'degraded' | 'reauthorization_required' | 'disabled' | null
  health_checked_at: string | null
  last_success_at: string | null
  last_error_at: string | null
  last_error_code: string | null
  reauthorization_required: boolean
  read_calendar_ids?: string[]
  read_calendar_metadata?: Array<{ id: string; summary: string; backgroundColor?: string }>
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
        (connections ?? []).map((connection: ConnectionStatus) => [connection.family_member_id, connection]),
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

export interface GoogleCalendarItem {
  id: string
  summary: string
  description: string | null
  primary: boolean
  accessRole: string
  backgroundColor: string | null
  foregroundColor?: string | null
  is_selected?: boolean
  is_write_target?: boolean
  is_read_selected?: boolean
  can_write?: boolean
}

export interface GoogleCalendarListResponse {
  ok: boolean
  reauth_required?: boolean
  error?: string
  connection_id?: string
  current_calendar_id?: string
  read_calendar_ids?: string[]
  calendars?: GoogleCalendarItem[]
}

export function useGoogleCalendarList(familyMemberId?: string, enabled = true) {
  return useQuery({
    queryKey: ['google-calendar-list', familyMemberId],
    enabled: Boolean(familyMemberId) && enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<GoogleCalendarListResponse> => {
      const { data, error } = await supabase.functions.invoke('list-google-calendars', {
        body: { family_member_id: familyMemberId },
      })
      if (error) throw error
      return data as GoogleCalendarListResponse
    },
  })
}

export function useSelectGoogleCalendar() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({
      familyMemberId,
      writeCalendarId,
      readCalendarIds,
      readCalendarMetadata,
    }: {
      familyMemberId: string
      writeCalendarId: string
      readCalendarIds?: string[]
      readCalendarMetadata?: Array<{ id: string; summary: string; backgroundColor?: string }>
    }) => {
      const { data, error } = await supabase.functions.invoke('list-google-calendars', {
        body: {
          family_member_id: familyMemberId,
          select_calendar_id: writeCalendarId,
          select_read_calendar_ids: readCalendarIds ?? [],
          read_calendar_metadata: readCalendarMetadata ?? [],
          save_selection: true,
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(data.error)
      return data
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['google-services'] })
      qc.invalidateQueries({ queryKey: ['calendar-connections'] })
      qc.invalidateQueries({ queryKey: ['google-calendar-list', variables.familyMemberId] })
      qc.invalidateQueries({ queryKey: ['events'] })
    },
  })
}

