/**
 * The loading mark (canvas 39a; index.html draws it from the first paint on /phone). It ends once the day is on the
 * screen: the mark finishes, fades and is gone. Safe to call more than once, or where there's no mark.
 */
export function finishSplash(win: { __thSplashDone?: () => void } = globalThis as { __thSplashDone?: () => void }): void {
  win.__thSplashDone?.()
}
