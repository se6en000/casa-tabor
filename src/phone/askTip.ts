/**
 * "Hold me to ask" (canvas 41b): a tip above the Ask button on the first few opens of the app, until the button has been
 * held once or the tip is dismissed ("Got it"). Counted once per opening of the app.
 */
export const ASK_TIP_OPENS = 3

interface Store { getItem(k: string): string | null; setItem(k: string, v: string): void }

/** A tip shown on the first few opens of the app until it's been done once or dismissed ("Got it"). */
export function firstOpensTip(name: string, opens: number) {
  const seen = `casa.${name}.opens`
  const done = `casa.${name}.done`
  return {
    /** Called once when the app opens: whether to show the tip this time (and counts this opening). */
    thisOpen(store: Store | null): boolean {
      try {
        if (!store || store.getItem(done) === '1') return false
        const n = Number(store.getItem(seen) ?? '0') || 0
        if (n >= opens) return false
        store.setItem(seen, String(n + 1))
        return true
      } catch {
        return false
      }
    },
    /** Done once, or "Got it": never again. */
    done(store: Store | null): void {
      try { store?.setItem(done, '1') } catch { /* private mode */ }
    },
  }
}

const ask = firstOpensTip('askTip', ASK_TIP_OPENS)
export const askTipThisOpen = ask.thisOpen
export const askTipDone = ask.done

/** "Swipe to finish" (Jake, Oct 5: "add a tool tip to this as well, like the AI call out"): over the first to-do or chore
 *  on Today, until one has been swiped or the tip dismissed. */
export const swipeTip = firstOpensTip('swipeTip', ASK_TIP_OPENS)
