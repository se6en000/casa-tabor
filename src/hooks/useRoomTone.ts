/**
 * useRoomTone
 *
 * Implements the Room Tone adaptive display system.
 * Polls the Pi sensor bridge (127.0.0.1:8765) for real AS7343 CCT + lux
 * readings every 3 seconds. Falls back to a time-of-day schedule when the
 * bridge is unreachable (browser dev, sensor not yet wired, etc.).
 *
 * Two layers of control (matching spec):
 *   Layer 1 — Hardware (DDC/CI): ddcutil on Pi — brightness + RGB gains
 *                                (handled by sensor-bridge/main.py)
 *   Layer 2 — Software (CSS): filter: sepia/brightness on #root
 *
 * This hook owns Layer 2. It also exposes the computed state so the
 * DisplaySettings page can show a live preview and manual override UI.
 */

import { useEffect, useCallback, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../lib/supabase'

export type RoomToneZone = 'day' | 'afternoon' | 'evening' | 'night' | 'late-night' | 'manual'

export interface DisplayConfig {
  // Home screen visibility
  show_weather: boolean
  show_briefing_on_home: boolean
  show_conflicts: boolean
  show_prep_alerts: boolean
  calendar_days_ahead: number
  clock_format: '12h' | '24h'

  // Room Tone
  room_tone_enabled: boolean
  // Schedule — hour boundaries (24h, local time)
  schedule_afternoon_hour: number  // default 15 (3pm)
  schedule_evening_hour: number    // default 19 (7pm)
  schedule_night_hour: number      // default 21 (9pm)
  schedule_late_night_hour: number // default 23 (11pm)
  schedule_day_hour: number        // default  7 (7am — end of late-night)

  // Manual override
  manual_override: boolean
  manual_warmth: number     // 0–1  (sepia amount)
  manual_brightness: number // 0–1  (css brightness multiplier, 0.2–1.0)
  override_expires_at: string | null // ISO string — auto-clears after 2h

  // Sensor
  sensor_push_enabled: boolean // whether Pi bridge pushes live readings to Supabase
}

export const DISPLAY_DEFAULTS: DisplayConfig = {
  show_weather: true,
  show_briefing_on_home: true,
  show_conflicts: true,
  show_prep_alerts: true,
  calendar_days_ahead: 7,
  clock_format: '12h',

  room_tone_enabled: true,
  schedule_afternoon_hour: 15,
  schedule_evening_hour: 19,
  schedule_night_hour: 21,
  schedule_late_night_hour: 23,
  schedule_day_hour: 7,

  manual_override: false,
  manual_warmth: 0.15,
  manual_brightness: 0.75,
  override_expires_at: null,

  sensor_push_enabled: false,
}

/** Returns the Room Tone zone for a given hour (0-23) */
export function getZoneForHour(hour: number, cfg: DisplayConfig): RoomToneZone {
  if (cfg.manual_override) return 'manual'
  if (!cfg.room_tone_enabled) return 'day'

  // Wrap-around: late night spans midnight → day_hour
  if (hour >= cfg.schedule_late_night_hour || hour < cfg.schedule_day_hour) return 'late-night'
  if (hour >= cfg.schedule_night_hour)     return 'night'
  if (hour >= cfg.schedule_evening_hour)   return 'evening'
  if (hour >= cfg.schedule_afternoon_hour) return 'afternoon'
  return 'day'
}

/** Human-readable label for a zone */
export const ZONE_LABELS: Record<RoomToneZone, string> = {
  'day':        'Day — crisp & bright',
  'afternoon':  'Afternoon — faint warmth',
  'evening':    'Evening — warm amber',
  'night':      'Night — warm & dim',
  'late-night': 'Late Night — dark painting',
  'manual':     'Manual Override',
}

export const ZONE_COLORS: Record<RoomToneZone, string> = {
  'day':        '#FAF8F5',
  'afternoon':  '#FDF4E7',
  'evening':    '#F5E6CC',
  'night':      '#2A1F0E',
  'late-night': '#120D06',
  'manual':     '#E8D5B0',
}

// CSS filter layer removed — hardware DDC/CI handles brightness and CCT via sensor bridge

/** Maps sensor CCT + lux to a zone (mirrors logic in sensor-bridge/main.py) */
function sensorDataToZone(cct: number, lux: number): RoomToneZone {
  if (lux < 5)         return 'late-night'
  if (lux < 30)        return 'night'
  if (cct < 3200)      return 'evening'
  if (cct < 4500)      return 'afternoon'
  return 'day'
}

const SENSOR_POLL_MS    = 5_000
const SENSOR_ROW_ID     = '00000000-0000-0000-0000-000000000001'

export function useRoomTone() {
  const { data } = useQuery<DisplayConfig | null>({
    queryKey: ['settings', 'display_config'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'display_config').single()
      return data?.value as DisplayConfig | null
    },
    refetchInterval: 60_000,
  })

  const cfg: DisplayConfig = useMemo(
    () => ({ ...DISPLAY_DEFAULTS, ...(data ?? {}) }),
    [data]
  )

  // Read sensor data from Supabase (Pi bridge pushes here every ~3s)
  const { data: sensorData } = useQuery<{
    cct: number; lux: number; zone: string
    brightness: number | null; rgb: [number, number, number] | null
  } | null>({
    queryKey: ['sensor', 'room-tone'],
    queryFn: async () => {
      try {
        const { data: row, error } = await supabase
          .from('sensor_readings')
          .select('cct, lux, zone, brightness, rgb, updated_at')
          .eq('id', SENSOR_ROW_ID)
          .single()
        if (error || !row?.cct) return null
        // Stale if not updated in last 30s
        const age = Date.now() - new Date(row.updated_at).getTime()
        if (age > 30_000) return null
        return row as { cct: number; lux: number; zone: string; brightness: number | null; rgb: [number, number, number] | null }
      } catch {
        return null
      }
    },
    refetchInterval: SENSOR_POLL_MS,
    staleTime: SENSOR_POLL_MS,
  })

  const tick = useCallback(() => {
    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60

    if (cfg.manual_override && cfg.override_expires_at) {
      if (new Date(cfg.override_expires_at) < now) {
        // Silently fall through — settings page handles DB write
      }
    }

    // Zone computed for display purposes only — CSS layer is disabled
    let _zone: RoomToneZone
    if (cfg.manual_override) {
      _zone = 'manual'
    } else if (sensorData?.cct != null && sensorData?.lux != null) {
      _zone = sensorDataToZone(sensorData.cct, sensorData.lux)
    } else {
      _zone = getZoneForHour(Math.floor(hour), cfg)
    }
    void _zone // zone used for UI display in DisplaySettingsPage only
  }, [cfg, sensorData])

  useEffect(() => {
    tick()
    const interval = setInterval(tick, 60_000)
    return () => clearInterval(interval)
  }, [tick])

  const currentHour = new Date().getHours()
  const currentZone: RoomToneZone = cfg.manual_override
    ? 'manual'
    : sensorData?.cct != null && sensorData?.lux != null
      ? sensorDataToZone(sensorData.cct, sensorData.lux)
      : getZoneForHour(currentHour, cfg)

  return { cfg, currentZone, sensorData: sensorData ?? null }
}
