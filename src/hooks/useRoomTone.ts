/**
 * useRoomTone
 *
 * Implements the Room Tone adaptive display system.
 * When the Pi sensor array is wired, this hook will receive real-time
 * lux + CCT readings and apply them directly. Until then, it uses a
 * time-of-day schedule as a proxy for ambient light conditions.
 *
 * Two layers of control (matching spec):
 *   Layer 1 — Hardware (DDC/CI): ddcutil on Pi — brightness + RGB gains
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

const ALL_ZONES: RoomToneZone[] = ['day', 'afternoon', 'evening', 'night', 'late-night', 'manual']

function applyZone(zone: RoomToneZone, cfg: DisplayConfig) {
  const html = document.documentElement
  // Remove all zone classes
  ALL_ZONES.forEach(z => html.classList.remove(`rt-${z}`))
  html.classList.add(`rt-${zone}`)

  // For manual mode, push CSS variables
  if (zone === 'manual') {
    html.style.setProperty('--rt-warmth',     String(cfg.manual_warmth))
    html.style.setProperty('--rt-brightness', String(cfg.manual_brightness))
  } else {
    html.style.removeProperty('--rt-warmth')
    html.style.removeProperty('--rt-brightness')
  }
}

export function useRoomTone() {
  const { data } = useQuery<DisplayConfig | null>({
    queryKey: ['settings', 'display_config'],
    queryFn: async () => {
      const { data } = await supabase.from('settings').select('value').eq('key', 'display_config').single()
      return data?.value as DisplayConfig | null
    },
    refetchInterval: 60_000, // re-check every minute for schedule changes
  })

  const cfg: DisplayConfig = useMemo(
    () => ({ ...DISPLAY_DEFAULTS, ...(data ?? {}) }),
    [data]
  )

  const tick = useCallback(() => {
    const now = new Date()
    const hour = now.getHours() + now.getMinutes() / 60

    // Auto-expire manual override after 2 hours
    if (cfg.manual_override && cfg.override_expires_at) {
      if (new Date(cfg.override_expires_at) < now) {
        // Silently fall through — settings page handles DB write
      }
    }

    const zone = getZoneForHour(Math.floor(hour), cfg)
    applyZone(zone, cfg)
  }, [cfg])

  useEffect(() => {
    tick() // apply immediately
    const interval = setInterval(tick, 60_000) // re-evaluate every minute
    return () => clearInterval(interval)
  }, [tick])

  // Return current zone for the preview in settings
  const currentHour = new Date().getHours()
  const currentZone = getZoneForHour(currentHour, cfg)

  return { cfg, currentZone }
}
