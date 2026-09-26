// The Family Wall is "home" (Jake, 2026-09-25): on the kiosk, and on any desktop-
// sized screen, "/" opens the Wall. Phones keep the classic home until the phone
// lens (Phase 4); "/?classic=1" still opens it anywhere. On the kiosk the app also
// returns to the Wall on its own after a few idle minutes (only a browser that
// opened /wall?kiosk=1 is marked for that).

/** Wide enough for the Wall's 1920x1080 stage to be readable: laptops and desktops, not phones. */
export const WALL_HOME_MIN_WIDTH = 900

export const WALL_HOME_KEY = 'casa-wall-home'
export const RETURN_TO_WALL_MS = 5 * 60_000

/** '1' to mark this browser as the wall kiosk, '0' to unmark (rollback URL), null to leave as is. */
export function wallHomeFlagFromUrl(pathname: string, search: string): '1' | '0' | null {
  const params = new URLSearchParams(search)
  if (params.get('wallHome') === '0') return '0'
  if (pathname.startsWith('/wall') && params.get('kiosk') === '1') return '1'
  return null
}

export function shouldSendHomeToWall(pathname: string, search: string, flag: string | null, screen: { wide: boolean } = { wide: false }): boolean {
  if (pathname !== '/' || new URLSearchParams(search).get('classic') === '1') return false
  return flag === '1' || screen.wide
}

export function isWideScreen(): boolean {
  try {
    return window.matchMedia(`(min-width: ${WALL_HOME_MIN_WIDTH}px)`).matches
  } catch {
    return false
  }
}

export function readWallHomeFlag(): string | null {
  try {
    return localStorage.getItem(WALL_HOME_KEY)
  } catch {
    return null
  }
}

export function writeWallHomeFlag(flag: '1' | '0'): void {
  try {
    if (flag === '1') localStorage.setItem(WALL_HOME_KEY, '1')
    else localStorage.removeItem(WALL_HOME_KEY)
  } catch {
    // Storage blocked: the kiosk just won't redirect Home.
  }
}

/** Where "/" goes: the Wall (kiosk, desktops), the phone lens (phones, Phase 4), or nowhere (?classic=1, other paths). */
export function homeRedirect(pathname: string, search: string, flag: string | null, screen: { wide: boolean }): '/wall' | '/phone' | null {
  if (pathname !== '/' || new URLSearchParams(search).get('classic') === '1') return null
  return shouldSendHomeToWall(pathname, search, flag, screen) ? '/wall' : '/phone'
}

/** /wall on a phone-sized screen (not the kiosk) opens the phone view: the wall's 1920x1080 stage would be tiny there. */
export function phoneRedirect(pathname: string, search: string, flag: string | null, screen: { wide: boolean }): '/phone' | null {
  if (pathname !== '/wall' || screen.wide || flag === '1') return null
  if (new URLSearchParams(search).get('kiosk') === '1') return null
  return '/phone'
}
