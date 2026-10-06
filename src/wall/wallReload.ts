/** Settings › Maintenance › "Refresh the wall" (canvas 47e) writes this key; the wall reloads within a minute. */
export const WALL_RELOAD_KEY = 'wall_reload_at'

/** Whether a reload asked for at `askedAt` is newer than this page (loaded at `loadedAt`). */
export function reloadAsked(askedAt: string | null | undefined, loadedAt: number): boolean {
  const t = askedAt ? Date.parse(askedAt) : NaN
  return Number.isFinite(t) && t > loadedAt
}
