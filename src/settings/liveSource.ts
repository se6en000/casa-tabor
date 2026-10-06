import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'
import { setSetting, settingsQueryKey, useSetting } from '../lib/settingsStore'
import { useFamilyMembers } from '../hooks/useFamilyMembers'
import { useProfileSession } from '../contexts/useProfileSession'
import { useSavedPlaces } from '../hooks/useSavedPlaces'
import { useContactDirectory } from '../hooks/useSavedContacts'
import { useCalendarConnections } from '../hooks/useCalendarConnections'
import { useEmailSettings } from '../wall/useEmailOffers'
import { useScreensaverSettings } from '../hooks/useScreensaverSettings'
import { useChores } from '../wall/useChores'
import { deleteChore, saveChore } from '../wall/saveChore'
import { useKeepFrom } from '../wall/useKeepFrom'
import { faceIdAvailable, hasFaceId, setUpFaceId } from '../signin/passkey'
import { readWallHomeFlag } from '../wall/kioskHome'
import { WALL_RELOAD_KEY } from '../wall/wallReload'
import type { DisplayConfigLite, HealthSummary, MemoryItem, NightlyCheck, SaveResult, SettingsSource, UsageSummary } from './data'

const ok: SaveResult = { ok: true }
const fail = (error: unknown): SaveResult => ({ ok: false, message: error instanceof Error ? error.message : 'That didn’t save.' })

async function memory(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('casa-memory', { body })
  if (error) throw error
  return data as { items?: MemoryItem[]; ok?: boolean; error?: string }
}

/** The real thing: the app's own hooks and the server. */
export const liveSource: SettingsSource = {
  now: () => new Date(),
  onWall: readWallHomeFlag() === '1',
  useMembers: () => useFamilyMembers().data ?? null,
  useViewer: () => {
    const { profile, signOut } = useProfileSession()
    return { id: profile?.memberId ?? null, name: profile?.memberName ?? null, token: profile?.token ?? null, signOut }
  },
  useFaceId: () => {
    const { profile } = useProfileSession()
    const [available, setAvailable] = useState(false)
    const [here, setHere] = useState(() => (profile ? hasFaceId(profile.memberId) : false))
    useEffect(() => { void faceIdAvailable().then(setAvailable) }, [])
    const setUp = useCallback(async () => {
      if (!profile) return false
      const done = await setUpFaceId(profile.memberId, profile.token)
      if (done) setHere(true)
      return done
    }, [profile])
    return { here, available, setUp: profile ? setUp : null }
  },
  setCanDrive: async (memberId, canDrive) => {
    const { error } = await supabase.from('family_members').update({ can_drive: canDrive }).eq('id', memberId)
    return error ? fail(error) : ok
  },
  useHome: () => {
    const { data } = useSetting<{ address?: string; city?: string; state?: string; zip?: string }>('home_config')
    return data ? [data.address, data.city, data.state].filter(Boolean).join(', ') || null : null
  },
  usePlaces: () => useSavedPlaces().data ?? null,
  useContacts: () => (useContactDirectory().data ?? null) as ReturnType<SettingsSource['useContacts']>,
  renamePlace: async (id, name) => {
    const { error } = await supabase.from('saved_places').update({ name: name.trim() }).eq('id', id)
    return error ? fail(error) : ok
  },
  deletePlace: async (id) => {
    const { error } = await supabase.from('saved_places').delete().eq('id', id)
    return error ? fail(error) : ok
  },
  useConnections: () => useCalendarConnections().data ?? null,
  connectGoogle: async (memberId) => {
    // Google comes back to /settings/google, which opens Calendars and email.
    const { data, error } = await supabase.functions.invoke('google-oauth-start', { body: { family_member_id: memberId, return_url: `${window.location.origin}/settings/google` } })
    if (error || !data?.url) throw error ?? new Error('Google didn’t answer.')
    window.open(data.url as string, '_self')
  },
  useEmail: () => {
    const { data, change } = useEmailSettings()
    return { data, change }
  },
  useDisplay: () => {
    const queryClient = useQueryClient()
    const { data } = useSetting<DisplayConfigLite>('display_config')
    const save = useCallback(async (patch: DisplayConfigLite) => {
      // Merged into what's there: the Pi's sensor bridge reads the rest of display_config.
      const key = settingsQueryKey('display_config')
      const current = (queryClient.getQueryData<Record<string, unknown> | null>(key)) ?? {}
      const next = { ...current, ...patch, updated_at: new Date().toISOString() }
      queryClient.setQueryData(key, next)
      const { error } = await setSetting('display_config', next)
      if (error) { queryClient.setQueryData(key, current); return fail(error) }
      return ok
    }, [queryClient])
    return { config: data ?? null, save }
  },
  useScreen: () => useScreensaverSettings(),
  useMemory: () => {
    const queryClient = useQueryClient()
    const { data } = useQuery({ queryKey: ['settings-memory'], queryFn: async () => (await memory({ action: 'list' })).items ?? [], staleTime: 30_000 })
    const act = useCallback(async (action: 'forget' | 'confirm', id: string) => {
      try {
        queryClient.setQueryData<MemoryItem[]>(['settings-memory'], (items) => (items ?? []).flatMap((i) => (i.id !== id ? [i] : action === 'forget' ? [] : [{ ...i, confidence: 'sure' as const }])))
        await memory({ action, id })
        return ok
      } catch (error) {
        void queryClient.invalidateQueries({ queryKey: ['settings-memory'] })
        return fail(error)
      }
    }, [queryClient])
    return { items: data ?? null, forget: (id: string) => act('forget', id), confirm: (id: string) => act('confirm', id) }
  },
  usePrivateOnWall: () => {
    const queryClient = useQueryClient()
    const { data } = useSetting<boolean>('memory_private_on_wall')
    const set = useCallback(async (hide: boolean) => {
      queryClient.setQueryData(settingsQueryKey('memory_private_on_wall'), hide)
      const { error } = await setSetting('memory_private_on_wall', hide)
      return error ? fail(error) : ok
    }, [queryClient])
    return [data === true, set]
  },
  useChores: () => {
    const queryClient = useQueryClient()
    return { chores: useChores(), save: (chore) => saveChore(queryClient, chore), remove: (id) => deleteChore(queryClient, id) }
  },
  useKeptCount: () => Object.values(useKeepFrom().keep ?? {}).filter((ids) => Array.isArray(ids) && ids.length > 0).length,
  useUsage: () => useQuery({
    queryKey: ['settings-usage'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_settings_usage', { p_days: 7 })
      if (error) throw error
      return data as UsageSummary
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  }).data ?? null,
  useHealth: () => {
    const queryClient = useQueryClient()
    const { data } = useQuery({
      queryKey: ['settings-health'],
      queryFn: async () => {
        const { data: summary, error } = await supabase.rpc('get_system_health_summary')
        if (error) throw error
        return summary as HealthSummary
      },
      staleTime: 30_000,
      refetchInterval: 60_000,
    })
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['settings-health'] })
    const setPaused = useCallback(async (paused: boolean) => {
      const { error } = await supabase.rpc('set_ai_circuit_breaker', { p_paused: paused, p_scope: 'all' })
      void refresh()
      return error ? fail(error) : ok
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const setCaps = useCallback(async (hourly: number, daily: number) => {
      // One merge in the database (like pausing): a trip the breaker writes meanwhile is never undone.
      const { error } = await supabase.rpc('set_ai_circuit_breaker_caps', { p_hourly_usd: hourly, p_daily_usd: daily })
      void refresh()
      return error ? fail(error) : ok
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    return { summary: data ?? null, setPaused, setCaps }
  },
  useChecks: () => useQuery({
    queryKey: ['settings-checks'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_nightly_checks', { p_days: 14 })
      if (error) throw error
      return data as NightlyCheck[]
    },
    staleTime: 5 * 60_000,
  }).data ?? null,
  useBugs: () => useQuery({
    queryKey: ['settings-bugs'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_bug_reports').select('created_at').in('status', ['open', 'in_progress', 'blocked']).order('created_at', { ascending: false })
      if (error) throw error
      return { open: data?.length ?? 0, newest: data?.[0]?.created_at ?? null }
    },
    staleTime: 5 * 60_000,
  }).data ?? null,
  run: async (job) => {
    try {
      if (job === 'sync_calendars') {
        const { error } = await supabase.functions.invoke('sync-calendars', { body: {} })
        if (error) throw error
      } else if (job === 'refresh_wall') {
        const { error } = await setSetting(WALL_RELOAD_KEY, new Date().toISOString())
        if (error) throw error
      }
      return ok
    } catch (error) {
      return fail(error)
    }
  },
}

