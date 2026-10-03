import { asksForTips, isNewTip, noteTipUsage, pickTip, tipsByTopic } from '../../supabase/functions/_shared/casa-tips.mjs'

// Tips while Casa thinks (P3.19 3c, boards 07e/07f). What this screen's family has already done is
// counted here, on the device (kept for later: tips don't retire for now — Jake, Oct 3: "I need a lot of repeating").

const KEY = 'casa-tip-usage'

export function tipUsage(): Record<string, number> {
  try {
    const raw = window.localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Counts what a person just asked for (called once per question sent). */
export function noteSaid(said: string) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(noteTipUsage(tipUsage(), said)))
  } catch {
    // Storage blocked: tips just don't retire.
  }
}

/** The tip for this question; `seed` keeps it steady while one question is thinking. */
export function tipFor(question: string | null, seed: number) {
  return pickTip({ question, seed }).text
}

export { asksForTips, isNewTip, tipsByTopic }
