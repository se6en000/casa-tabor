import { useEffect, useRef } from 'react'

// How often to check for a new deploy. 60s keeps the kiosk within a minute of the
// latest push without hammering the network. We also check on tab focus/visibility
// so a phone that's been backgrounded picks up the new build the moment it returns.
const POLL_MS = 60_000

// Where the build id lives in the deployed output (emitted by vite.config.ts).
const VERSION_URL = '/version.json'

/**
 * Auto-refresh every connected browser when a new build is deployed.
 *
 * The running bundle bakes in __BUILD_ID__ at build time. We poll the deployed
 * version.json; when its `version` no longer matches ours, a newer build is live,
 * so we reload to pick it up. Reloading is deferred when the user is actively
 * typing or a dialog is open, so we never interrupt an interaction — we retry on
 * the next poll / focus.
 */
export function useAppUpdater() {
  const reloadingRef = useRef(false)

  useEffect(() => {
    const runningVersion = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : null

    const isBusy = () => {
      const el = document.activeElement as HTMLElement | null
      if (el) {
        const tag = el.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable) {
          return true
        }
      }
      // Any open modal/dialog/sheet — don't reload mid-flow.
      return Boolean(document.querySelector('[role="dialog"], [aria-modal="true"]'))
    }

    let cancelled = false

    const check = async () => {
      if (cancelled || reloadingRef.current || !runningVersion) return
      try {
        const res = await fetch(`${VERSION_URL}?ts=${Date.now()}`, { cache: 'no-store' })
        if (!res.ok) return
        const data = (await res.json()) as { version?: string }
        const deployed = data?.version
        if (!deployed || deployed === runningVersion) return
        if (isBusy()) return // try again next tick when the user is idle
        reloadingRef.current = true
        window.location.reload()
      } catch {
        // Offline / transient — ignore and retry on the next interval.
      }
    }

    const interval = window.setInterval(check, POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') check()
    }
    document.addEventListener('visibilitychange', onVisible)
    document.addEventListener('wake-kiosk', check)
    window.addEventListener('focus', check)
    window.addEventListener('online', check)
    // Initial check shortly after mount (covers a client that loaded an old cached
    // shell right as a deploy landed).
    const kickoff = window.setTimeout(check, 4_000)

    return () => {
      cancelled = true
      window.clearInterval(interval)
      window.clearTimeout(kickoff)
      document.removeEventListener('visibilitychange', onVisible)
      document.removeEventListener('wake-kiosk', check)
      window.removeEventListener('focus', check)
      window.removeEventListener('online', check)
    }
  }, [])
}
