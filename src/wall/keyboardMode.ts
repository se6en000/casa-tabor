// Which keyboard types into the wall's fields (overnight queue 2; Jake, 2026-09-29: "when opening this
// app on a desktop, I want to use the native keyboard … not the Casa version"). The kiosk keeps Casa's
// on-screen keyboard — its touchscreen can read as a mouse under X11, so the pointer can't tell — and
// every other device types with its own: a desktop's real keyboard, a tablet's system one.

export function usesDeviceKeyboard({ search, kioskFlag, forced }: { search: string; kioskFlag: string | null; forced?: string | null }): boolean {
  const params = new URLSearchParams(search)
  const asked = forced ?? params.get('keyboard')
  if (asked === 'screen') return false
  if (asked === 'device') return true
  if (params.get('kiosk') === '1' || params.get('density') === 'kiosk' || kioskFlag === '1') return false
  return true
}

/** For this browser: the page's address, the kiosk mark, and a fixture's choice (`window.__casaKeyboard`). */
export function deviceKeyboardHere(): boolean {
  if (typeof window === 'undefined') return false
  let flag: string | null = null
  try { flag = localStorage.getItem('casa-wall-home') } catch { /* private mode */ }
  const forced = (window as unknown as { __casaKeyboard?: string }).__casaKeyboard ?? null
  return usesDeviceKeyboard({ search: window.location.search, kioskFlag: flag, forced })
}
