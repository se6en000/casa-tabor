import { createContext } from 'react'

/**
 * The secret way back to the morning paper (Jake, Oct 8: "can I have a button or a secret touch place to go back to the
 * newspaper?"): the date under the clock, on every face, opens it — as the menu's Morning paper does. Null where there's
 * no going back (the paper itself, a fixture without it).
 */
export const PaperRecall = createContext<(() => void) | null>(null)
