/**
 * Catching up on what the live feed missed (Jake, Oct 3: appointments added on the kiosk weren't on his phone 20
 * minutes later, "until I started adding a new appointment then all of a sudden they showed up"). The phone's lists
 * follow the live feed and never re-read on their own; on an iPhone in the background the feed drops, and what changed
 * meanwhile was never fetched. Two moments now re-read: coming back to the app after being away, and the feed
 * reconnecting after a drop.
 */

/** Back after at least `minAwayMs` hidden (once per return); a blink away doesn't count. */
export function resumeGate(minAwayMs = 10_000) {
  let hiddenAt: number | null = null
  return {
    hidden(now: number) { hiddenAt ??= now },
    visible(now: number): boolean {
      const away = hiddenAt !== null && now - hiddenAt >= minAwayMs
      hiddenAt = null
      return away
    },
  }
}

/** The feed's status: true when it's connected again after a drop (not its first connection). */
export function reconnectGate() {
  let ever = false
  let connected = false
  return {
    status(status: string): boolean {
      if (status !== 'SUBSCRIBED') { connected = false; return false }
      if (connected) return false
      connected = true
      if (!ever) { ever = true; return false }
      return true
    },
  }
}

/**
 * Calls `onResume` when the page comes back after being away (hidden ≥ `minAwayMs`, restored from the back-forward
 * cache, or back online). Returns the unsubscribe.
 */
export function onResume(onResume: () => void, minAwayMs = 10_000): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}
  const gate = resumeGate(minAwayMs)
  if (document.visibilityState === 'hidden') gate.hidden(Date.now())
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') gate.hidden(Date.now())
    else if (gate.visible(Date.now())) onResume()
  }
  const onPageShow = (event: PageTransitionEvent) => { if (event.persisted) onResume() }
  const onOnline = () => onResume()
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pageshow', onPageShow)
  window.addEventListener('online', onOnline)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pageshow', onPageShow)
    window.removeEventListener('online', onOnline)
  }
}

/**
 * At most one catch-up per `minGapMs` (Oct 5: the kiosk's feed flapped all night and every reconnect re-read the whole
 * calendar, ~80 reads a minute, until the database stopped answering and the phone wouldn't load).
 */
export function catchUpLimit(minGapMs = 60_000) {
  let last: number | null = null
  return {
    allow(now: number): boolean {
      if (last !== null && now - last < minGapMs) return false
      last = now
      return true
    },
  }
}

/** How long to wait before reconnecting the feed: 3 s, doubling after each drop up to a minute; 3 s again once a
 *  connection has held for a minute. */
export function reconnectBackoff(firstMs = 3_000, maxMs = 60_000, heldMs = 60_000) {
  let wait = firstMs
  let connectedAt: number | null = null
  return {
    connected(now: number) { connectedAt = now },
    next(now: number): number {
      if (connectedAt !== null && now - connectedAt >= heldMs) wait = firstMs
      connectedAt = null
      const out = wait
      wait = Math.min(maxMs, wait * 2)
      return out
    },
  }
}
