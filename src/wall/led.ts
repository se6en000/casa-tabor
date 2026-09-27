import type { BandState } from './assistant'

// The LED strip under the wall (P3.14, the Pi's sensor bridge drives it): it follows the
// assistant band — gold by day, dim amber at night — and at night, while nobody's talking to
// Casa, a faint candle glow (Settings → Hardware Controls → Night glow). Pure, so it's tested.

export type LedMode = 'listening' | 'processing' | 'waiting' | 'glow' | 'off'

/** The wall's evening: 7 PM to 6 AM (the same hours as its evening face). */
export function isLedNight(now: Date): boolean {
  const hour = now.getHours()
  return hour >= 19 || hour < 6
}

export function wallLedMode(input: { bandOpen: boolean; bandState: BandState | null; micOpen: boolean; night: boolean; glowEnabled: boolean }): LedMode {
  const idle: LedMode = input.night && input.glowEnabled ? 'glow' : 'off'
  if (!input.bandOpen) return idle
  if (input.bandState === 'NEEDS A YES') return 'waiting'
  if (input.bandState === 'THINKING') return 'processing'
  if (input.bandState === 'LISTENING' || input.micOpen) return 'listening'
  return idle
}
