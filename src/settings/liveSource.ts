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
import { useMemberAvailability } from '../hooks/useMemberAvailability'
import { deserializeRoutinesFromAvailabilityRules } from '../lib/familyRoutines'
import { addDayOff, removeDayOff, removeRoutine, saveRoutine } from '../wall/saveRoutine'
import { useGoogleCalendarList, useSelectGoogleCalendar } from '../hooks/useCalendarConnections'
import { invokeHistoryUnlock } from '../lib/assistantConversationHistoryClient'
import type { BugPatch, BugReport, DisplayConfigLite, HealthSummary, LightReading, MemoryItem, NightlyCheck, SaveResult, SettingsSource, UsageSummary } from './data'
import { bugIsOpen, sortBugs } from './model'
import { PERSONA_KEY, cleanPersona, type Persona } from '../../supabase/functions/_shared/house-persona.mjs'

const ok: SaveResult = { ok: true }
const ymd = (iso: string) => {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const fail = (error: unknown): SaveResult => ({ ok: false, message: error instanceof Error ? error.message : 'That didn’t save.' })

async function memory(body: Record<string, unknown>) {
  const { data, error } = await supabase.functions.invoke('casa-memory', { body })
  if (error) throw error
  return data as { items?: MemoryItem[]; ok?: boolean; error?: string }
}

/** The wall's bridges (sensor 8765, voice 8766): on the kiosk only; anywhere else they don't answer. */
async function bridge<T>(port: number, path: string, method: 'GET' | 'POST' = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(method === 'POST' ? 30_000 : 2500) })
  if (!res.ok) throw new Error(`The wall answered ${res.status}`)
  return res.json() as Promise<T>
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
  useMemberEdits: () => {
    const queryClient = useQueryClient()
    const done = (error: unknown) => {
      // The family list is held for the whole session (useFamilyMembers); a change has to refresh it.
      void queryClient.invalidateQueries({ queryKey: ['family-members'] })
      void queryClient.invalidateQueries({ queryKey: ['calendar-connections'] })
      return error ? fail(error) : ok
    }
    return {
      update: async (memberId, patch) => done((await supabase.from('family_members').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', memberId)).error),
      add: async (name, role, canDrive) => {
        // Last in the family's order, so nobody's colour changes. A pet starts off the wall and out of sign-in.
        const { data: last } = await supabase.from('family_members').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle()
        return done((await supabase.from('family_members').insert({ name: name.trim(), role, can_drive: role === 'pet' ? false : canDrive, sort_order: (Number(last?.sort_order) || 0) + 1, show_on_home_sidebar: role !== 'pet' })).error)
      },
      arrange: async (changes) => done(changes.length ? (await supabase.rpc('arrange_family_members', { p_changes: changes })).error : null),
    }
  },
  useHome: () => {
    const { data } = useSetting<{ address?: string; city?: string; state?: string; zip?: string }>('home_config')
    return data ? [data.address, data.city, data.state].filter(Boolean).join(', ') || null : null
  },
  usePlaces: () => useSavedPlaces().data ?? null,
  keepPlace: async (id) => {
    const { error } = await supabase.from('saved_places').update({ confirmed: true }).eq('id', id)
    return error ? fail(error) : ok
  },
  dismissPlace: async (id) => {
    const { error } = await supabase.from('saved_places').update({ dismissed_at: new Date().toISOString() }).eq('id', id)
    return error ? fail(error) : ok
  },
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
  useCalendarChoices: (memberId) => {
    const { data } = useGoogleCalendarList(memberId ?? undefined, Boolean(memberId))
    const select = useSelectGoogleCalendar()
    const writeId = data?.current_calendar_id ?? null
    const calendars = data?.calendars ? data.calendars.map((c) => ({ id: c.id, summary: c.summary, color: c.backgroundColor, primary: c.primary })) : null
    const save = useCallback(async (readIds: string[]) => {
      if (!memberId || !writeId) return { ok: false, message: 'Google didn’t answer.' }
      try {
        const reads = readIds.filter((id) => id !== writeId)
        await select.mutateAsync({ familyMemberId: memberId, writeCalendarId: writeId, readCalendarIds: reads, readCalendarMetadata: (data?.calendars ?? []).filter((c) => reads.includes(c.id)).map((c) => ({ id: c.id, summary: c.summary, backgroundColor: c.backgroundColor ?? undefined })) })
        return ok
      } catch (error) { return fail(error) }
    }, [memberId, writeId, data, select])
    return { calendars, readIds: data?.read_calendar_ids ?? [], writeId, save }
  },
  useEmailReaders: () => {
    const queryClient = useQueryClient()
    const { data } = useQuery({
      queryKey: ['settings-email-readers'],
      queryFn: async () => {
        const { data: rows, error } = await supabase.from('google_connection_status').select('family_member_id, gmail_scan_enabled')
        if (error) throw error
        return Object.fromEntries((rows ?? []).map((r: { family_member_id: string; gmail_scan_enabled: boolean | null }) => [r.family_member_id, r.gmail_scan_enabled === true]))
      },
      staleTime: 60_000,
    })
    const set = useCallback(async (memberId: string, on: boolean) => {
      const { data: res, error } = await supabase.functions.invoke('toggle-gmail-scan', { body: { family_member_id: memberId, enabled: on } })
      void queryClient.invalidateQueries({ queryKey: ['settings-email-readers'] })
      return error || res?.error ? fail(error ?? new Error(res.error)) : ok
    }, [queryClient])
    return { on: data ?? null, set }
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
  useWallLight: () => {
    const onWall = readWallHomeFlag() === '1'
    const { data: today } = useQuery({
      queryKey: ['settings-wall-light'],
      queryFn: async () => {
        const { data, error } = await supabase.rpc('get_wall_light', { p_hours: 24 })
        if (error) throw error
        return data as LightReading[]
      },
      staleTime: 60_000,
      refetchInterval: 5 * 60_000,
    })
    // On the wall itself the sensor answers this second (the Pi's bridge, as the wall's own light code reads it).
    const { data: live } = useQuery({
      queryKey: ['settings-wall-light-live'],
      enabled: onWall,
      queryFn: async () => {
        const res = await fetch('http://127.0.0.1:8765/room-tone', { signal: AbortSignal.timeout(2000) })
        const r = await res.json() as { cct: number | null; lux: number | null; brightness: number | null; rgb: number[] | null; display_on: boolean | null }
        return { at: new Date().toISOString(), cct: r.cct, lux: r.lux, brightness: r.brightness, rgb: r.rgb, display_on: r.display_on } as LightReading
      },
      refetchInterval: 5000,
    })
    return { now: live ?? today?.at(-1) ?? null, today: today ?? null }
  },
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
  usePersona: () => {
    const queryClient = useQueryClient()
    const { data, isLoading } = useSetting<unknown>(PERSONA_KEY)
    const save = useCallback(async (next: Persona) => {
      queryClient.setQueryData(settingsQueryKey(PERSONA_KEY), next)
      const { error } = await setSetting(PERSONA_KEY, next)
      return error ? fail(error) : ok
    }, [queryClient])
    return { persona: isLoading ? null : cleanPersona(data), save }
  },
  useChores: () => {
    const queryClient = useQueryClient()
    return { chores: useChores(), save: (chore) => saveChore(queryClient, chore), remove: (id) => deleteChore(queryClient, id) }
  },
  useRoutines: () => {
    const queryClient = useQueryClient()
    const members = useFamilyMembers().data ?? null
    const ids = (members ?? []).map((m) => m.id)
    const { rules, exceptions } = useMemberAvailability(ids)
    const items = members && rules ? members.flatMap((person) => deserializeRoutinesFromAvailabilityRules(person.id, rules).map((routine) => ({ routine, person }))) : null
    return {
      items,
      dayOffs: (memberId: string) => (exceptions ?? []).filter((d) => d.member_id === memberId && d.override_type === 'day_off' && d.id).map((d) => ({ id: d.id!, start: ymd(d.start_at), end: ymd(d.end_at) })),
      save: async (routine, offs) => {
        await saveRoutine(queryClient, routine, members ?? [])
        for (const day of offs.add) await addDayOff(queryClient, routine.memberId, day)
        for (const id of offs.remove) await removeDayOff(queryClient, id)
      },
      remove: (routine) => removeRoutine(queryClient, routine),
    }
  },
  useVoiceTurns: () => useQuery({
    queryKey: ['settings-voice-turns'],
    queryFn: async () => {
      const { data, error } = await supabase.from('ai_drawer_debug_events').select('received_at, detail, page, correlation_id, payload')
        .eq('event', 'server_ai_assistant_ingress_user_text').order('received_at', { ascending: false }).limit(60)
      if (error) throw error
      // The family's own words only: the nightly check and test scripts name themselves.
      return (data ?? []).filter((r: { correlation_id: string | null; payload: { client_build?: string } | null }) => !/^(nightly-check|which-live|[a-z-]*-eval)/.test(r.correlation_id ?? '') && !/(nightly-check|eval|which-live)/.test(r.payload?.client_build ?? ''))
        .slice(0, 20).map((r: { received_at: string; detail: string | null; page: string | null }) => ({ at: r.received_at, text: r.detail ?? '', page: r.page }))
    },
    staleTime: 60_000,
  }).data ?? null,
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
  useBugBox: () => {
    const qc = useQueryClient()
    const { data } = useQuery({
      queryKey: ['settings-bug-box'],
      queryFn: async () => {
        const { data, error } = await supabase.from('ai_bug_reports')
          .select('id, title, details, severity, status, source, created_at, member_name, page, transcript')
          .order('created_at', { ascending: false }).limit(150)
        if (error) throw error
        return sortBugs((data ?? []) as BugReport[])
      },
      staleTime: 60_000,
    })
    const refresh = () => Promise.all([qc.invalidateQueries({ queryKey: ['settings-bug-box'] }), qc.invalidateQueries({ queryKey: ['settings-bugs'] })])
    const edit = useCallback(async (id: string, patch: BugPatch) => {
      const closing = patch.status && !bugIsOpen(patch.status)
      const { error } = await supabase.from('ai_bug_reports')
        .update({ ...patch, updated_at: new Date().toISOString(), ...(patch.status ? { resolved_at: closing ? new Date().toISOString() : null } : {}) })
        .eq('id', id)
      void refresh()
      return error ? fail(error) : ok
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    const remove = useCallback(async (id: string) => {
      const { error } = await supabase.from('ai_bug_reports').delete().eq('id', id)
      void refresh()
      return error ? fail(error) : ok
    }, []) // eslint-disable-line react-hooks/exhaustive-deps
    return { bugs: data ?? null, edit, remove }
  },
  checkOwnerPin: async (ownerId, pin) => {
    try { await invokeHistoryUnlock(ownerId, pin); return true } catch { return false }
  },
  useWallHardware: () => {
    const onWall = readWallHomeFlag() === '1'
    const { data } = useQuery({
      queryKey: ['settings-wall-hardware'],
      enabled: onWall,
      refetchInterval: 15_000,
      queryFn: async () => {
        const [health, tone, status, wake, panel] = await Promise.allSettled([
          bridge<{ ok: boolean }>(8765, '/health'), bridge<{ error: string | null }>(8765, '/room-tone'),
          bridge<{ ready: boolean; recording: boolean; error: string | null }>(8766, '/status'), bridge<{ score: number }>(8766, '/wake-sensitivity'),
          bridge<{ min?: number; max?: number; panel_min?: number; panel_max?: number }>(8765, '/display/panel-calibration'),
        ])
        const val = <T,>(r: PromiseSettledResult<T>) => (r.status === 'fulfilled' ? r.value : null)
        const st = val(status)
        const p = val(panel)
        return {
          sensorOk: val(health)?.ok === true && !val(tone)?.error,
          listener: st == null ? 'off' as const : st.recording ? 'busy' as const : st.error ? 'off' as const : 'ready' as const,
          wakeScore: val(wake)?.score ?? null,
          panel: p && (p.min ?? p.panel_min) != null ? { min: Number(p.min ?? p.panel_min), max: Number(p.max ?? p.panel_max) } : null,
        }
      },
    })
    return data ?? { sensorOk: null, listener: null, wakeScore: null, panel: null }
  },
  wallDo: async (job) => {
    try {
      if (job === 'reload_here') { window.location.reload(); return ok }
      if (job === 'test_light') await bridge(8765, '/led/confirm', 'POST', {})
      else if (job === 'calibrate_panel') {
        const r = await bridge<{ ok: boolean; error?: string }>(8765, '/display/calibrate-panel', 'POST', {})
        if (!r.ok) throw new Error(r.error ?? 'The screen didn’t answer.')
      } else await bridge(8766, '/wake-sensitivity', 'POST', { score: job.wakeScore })
      return ok
    } catch (error) {
      return fail(error)
    }
  },
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

