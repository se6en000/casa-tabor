import { lazy, type ComponentType } from 'react'

// A route chunk can fail to load after a fresh deploy replaces the built
// asset files a stale-loaded index.html still references ("Failed to fetch
// dynamically imported module") -- the same class of build-versioning risk
// this repo has hit before (see scripts/ship.sh's own history of the
// __BUILD_ID__/version.json reload-loop incident). Reload ONCE to pick up
// the new build rather than crashing to a raw error boundary; the
// sessionStorage guard prevents an infinite reload loop if the failure is a
// genuine, persistent problem (e.g. really offline) rather than a stale chunk.
export function lazyWithReload<P>(
  importer: () => Promise<{ default: ComponentType<P> }>,
  chunkName: string,
) {
  return lazy(() =>
    importer().catch((error) => {
      const reloadKey = `casa-tabor-chunk-reload-${chunkName}`
      if (!sessionStorage.getItem(reloadKey)) {
        sessionStorage.setItem(reloadKey, '1')
        window.location.reload()
        // Never resolves — the reload is already underway.
        return new Promise<{ default: ComponentType<P> }>(() => {})
      }
      throw error
    }),
  )
}
