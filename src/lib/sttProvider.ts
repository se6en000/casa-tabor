import { useSyncExternalStore } from 'react'

// Which Deepgram model the wall's microphone uses: nova-3 (as it always has), or Flux behind the MT menu's "Try Flux"
// switch (Jake, 2026-09-30: measured, nova-3's words come in 1-second steps; Flux sends one every ~0.25 s of audio and
// decides the end of a sentence itself). Remembered on this device.

const KEY = 'casa-wall-stt-flux'
const listeners = new Set<() => void>()

export type SttProvider = 'nova' | 'flux'

export function sttProvider(): SttProvider {
  try {
    return localStorage.getItem(KEY) === '1' ? 'flux' : 'nova'
  } catch {
    return 'nova'
  }
}

export function setSttFlux(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* private mode: nothing to remember */ }
  listeners.forEach((fn) => fn())
}

export function useSttFlux(): boolean {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    () => sttProvider() === 'flux',
    () => false,
  )
}
