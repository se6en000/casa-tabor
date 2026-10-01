import { useSyncExternalStore } from 'react'

// The new listener (canvas row 17) behind a switch, to try on the wall with a real voice before it's final:
// the MT menu's "Try the new listener", remembered on this device; `?listener=2` turns it on for a visit.

const KEY = 'casa-wall-listener-v2'
const listeners = new Set<() => void>()

export function listenerV2On(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get('listener') === '2') return true
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setListenerV2(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch { /* private mode: nothing to remember */ }
  listeners.forEach((fn) => fn())
}

export function useListenerV2(): boolean {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn) },
    listenerV2On,
    () => false,
  )
}
