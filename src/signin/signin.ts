/**
 * Signing in, in Tabor House (canvas row 40, Jake Oct 5: "love all this, also include the manage/add a pin screen").
 * The rules behind the screens: who is offered, the greeting, the phone remembering its person, and what a wrong PIN says.
 */

export const PIN_LENGTH = 6
export const LAST_MEMBER_KEY = 'casa.signin.lastMember'

interface Person { id: string; name: string; role?: string | null; show_on_home_sidebar?: boolean | null; sort_order?: number | null }

/** People only, in the family's order: the Tabor Family mailbox and Milo (switched off the wall) aren't offered. */
export function signInPeople<T extends Person>(members: T[]): T[] {
  return members
    .filter((m) => m.show_on_home_sidebar !== false)
    .sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999) || a.name.localeCompare(b.name))
}

export function greeting(name: string, now: Date): string {
  const h = now.getHours()
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'
  return `Good ${part}, ${name}`
}

/** What the server's refusal means to the person at the keypad. */
export function wrongPinText(serverMessage: string, resetters: string[]): string {
  if (/too many attempts/i.test(serverMessage)) {
    const who = resetters.length ? `${resetters.join(' or ')} can reset it in Family PINs.` : 'It can be reset in Family PINs.'
    return `Too many tries. Try again in 15 minutes — or ${who}`
  }
  if (/not been set up/i.test(serverMessage)) {
    return resetters.length ? `No PIN yet — ${resetters.join(' or ')} can set one in Family PINs.` : 'No PIN yet — one can be set in Family PINs.'
  }
  if (/invalid|incorrect|not match|pin/i.test(serverMessage)) return 'That’s not it. Try again.'
  return serverMessage || 'That didn’t work. Try again.'
}

/** Typing a new PIN in Family PINs: first, then once more to be sure. */
export type NewPinStep = { stage: 'first'; first: '' } | { stage: 'again'; first: string }
export function nextNewPin(step: NewPinStep, typed: string): { step: NewPinStep; done: string | null; mismatch: boolean } {
  if (typed.length < PIN_LENGTH) return { step, done: null, mismatch: false }
  if (step.stage === 'first') return { step: { stage: 'again', first: typed }, done: null, mismatch: false }
  if (typed === step.first) return { step, done: typed, mismatch: false }
  return { step: { stage: 'first', first: '' }, done: null, mismatch: true }
}

interface KeyValueStore { getItem(k: string): string | null; setItem(k: string, v: string): void }
export function rememberedMember(store: KeyValueStore | null): string | null {
  try { return store?.getItem(LAST_MEMBER_KEY) ?? null } catch { return null }
}
export function rememberMember(store: KeyValueStore | null, memberId: string): void {
  try { store?.setItem(LAST_MEMBER_KEY, memberId) } catch { /* private mode: the picker next time */ }
}
