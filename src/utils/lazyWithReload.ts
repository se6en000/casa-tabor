import { lazy, type ComponentType } from 'react'

// A route chunk can fail to load after a fresh deploy replaces the built
// asset files a stale-loaded index.html still references ("Failed to fetch
// dynamically imported module") -- the same class of build-versioning risk
// this repo has hit before (see scripts/ship.sh's own history of the
// __BUILD_ID__/version.json reload-loop incident). Reload to pick up the new
// build rather than crashing to a raw error boundary. The sessionStorage guard
// allows one reload per gap, so a genuine, persistent problem (e.g. really
// offline) can't loop tightly -- but a kiosk tab that lives for days still
// recovers from every later deploy, not just the first (2026-09-26: the wall
// sat on "Failed to fetch … WallRoot" after a ship until someone tapped Reload).

export const CHUNK_RELOAD_GAP_MS = 30_000

/** Whether it's time to reload again, given when this chunk last reloaded the page (ms, as stored). */
export function chunkReloadDue(stored: string | null, now: number): boolean {
  const last = Number(stored)
  // The old guard stored "1" (once per session); any value that isn't a recent time allows a reload.
  return !stored || !Number.isFinite(last) || last < 1_000_000_000 || now - last > CHUNK_RELOAD_GAP_MS
}

/** A module chunk that didn't arrive (Chromium, Safari, Firefox wordings), as opposed to a real crash. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : ''
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk .* failed/i.test(message)
}

export function lazyWithReload<P>(
  importer: () => Promise<{ default: ComponentType<P> }>,
  chunkName: string,
) {
  return lazy(() =>
    importer().catch((error) => {
      const reloadKey = `casa-tabor-chunk-reload-${chunkName}`
      let due = false
      try {
        due = chunkReloadDue(sessionStorage.getItem(reloadKey), Date.now())
        if (due) sessionStorage.setItem(reloadKey, String(Date.now()))
      } catch {
        // Storage blocked: no guard, so leave it to the error screen's timed retry.
        due = false
      }
      if (due) {
        window.location.reload()
        // Never resolves — the reload is already underway.
        return new Promise<{ default: ComponentType<P> }>(() => {})
      }
      throw error
    }),
  )
}
