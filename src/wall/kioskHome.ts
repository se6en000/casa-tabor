// On the wall kiosk the Family Wall is "home": the rest of the app's Home
// button (which goes to "/") leads back to it, and the app returns to it on its
// own after a few idle minutes. Only a browser that opened /wall?kiosk=1 is
// marked this way; phones and laptops are unaffected.

export const WALL_HOME_KEY = 'casa-wall-home'
export const RETURN_TO_WALL_MS = 5 * 60_000

/** '1' to mark this browser as the wall kiosk, '0' to unmark (rollback URL), null to leave as is. */
export function wallHomeFlagFromUrl(pathname: string, search: string): '1' | '0' | null {
  const params = new URLSearchParams(search)
  if (params.get('wallHome') === '0') return '0'
  if (pathname.startsWith('/wall') && params.get('kiosk') === '1') return '1'
  return null
}

export function shouldSendHomeToWall(pathname: string, search: string, flag: string | null): boolean {
  if (flag !== '1' || pathname !== '/') return false
  return new URLSearchParams(search).get('classic') !== '1'
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
