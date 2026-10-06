import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLedStrip } from '../hooks/useLedStrip'
import type { DisplayConfig } from '../hooks/useRoomTone'
import { getSetting, settingsQueryKey } from '../lib/settingsStore'
import type { BandState } from './assistant'
import { isLedNight, wallLedMode } from './led'

export interface BandLed {
  state: BandState | null
  micOpen: boolean
  /** The follow-up window's last seconds: the light fades. */
  closing?: boolean
}

/**
 * The LED strip for the whole wall (P3.14): the one place that drives it, so the band and the
 * idle wall never fight over it. The band reports its state and its outcomes; at night, idle,
 * the strip holds a faint candle glow unless Settings → Hardware Controls → Night glow is off.
 */
export function useWallLed(bandOpen: boolean, now: Date) {
  const led = useLedStrip()
  const [band, setBand] = useState<BandLed>({ state: null, micOpen: false })
  const { data: config } = useQuery<Partial<DisplayConfig> | null>({
    queryKey: settingsQueryKey('display_config'),
    queryFn: async () => (await getSetting<DisplayConfig>('display_config')).data,
    staleTime: 60_000,
    // The kiosk never reloads or refocuses, so without this a change in Settings (night glow, sleep, brightness —
    // they share this query) reached the wall only at its next reload (Jake, Oct 6: "does the night glow actually work?").
    refetchInterval: 60_000,
  })
  const night = isLedNight(now)
  const mode = wallLedMode({ bandOpen, bandState: band.state, micOpen: band.micOpen, closing: band.closing, night, glowEnabled: config?.led_night_glow !== false })
  useEffect(() => {
    led.setNight(night)
    led[mode]()
  }, [led, mode, night])
  return { onBandLed: setBand, onOutcome: (kind: 'confirm' | 'cancel') => (kind === 'confirm' ? led.confirm() : led.cancel()) }
}
