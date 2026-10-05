/**
 * "Hold me to ask" (canvas 41b): a tip above the Ask button on the first few opens of the app, until the button has been
 * held once or the tip is dismissed ("Got it"). Counted once per opening of the app.
 */
const SEEN = 'casa.askTip.opens'
const DONE = 'casa.askTip.done'
export const ASK_TIP_OPENS = 3

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** Called once when the app opens: whether to show the tip this time (and counts this opening). */
export function askTipThisOpen(store: Store | null): boolean {
  try {
    if (!store || store.getItem(DONE) === '1') return false
    const opens = Number(store.getItem(SEEN) ?? '0') || 0
    if (opens >= ASK_TIP_OPENS) return false
    store.setItem(SEEN, String(opens + 1))
    return true
  } catch {
    return false
  }
}

/** Held once, or "Got it": never again. */
export function askTipDone(store: Store | null): void {
  try { store?.setItem(DONE, '1') } catch { /* private mode */ }
}
