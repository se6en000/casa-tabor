// "Show me the grocery list" (Jake, Oct 3: "alexa should be able to open/show the grocery list page"): asking to see a
// page opens it at once — the words never go to Casa. A question about the list ("what's on the grocery list?",
// "do we need milk?") still goes to Casa.

export type PageAsk = 'grocery'

const SHOW = /^(?:(?:hey |ok )?(?:alexa|casa)[, ]*)?(?:can you |could you |please )?(?:show|open|bring up|pull up|go to|let me see|take me to|switch to)(?: me)? (?:the |my |our )?(?:grocery|groceries|shopping)(?: list| page)?(?: please)?$/

export function pageAsked(said: string): PageAsk | null {
  const s = String(said ?? '').toLowerCase().replace(/[^a-z' ,]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/[ ,]+$/, '')
  return SHOW.test(s) ? 'grocery' : null
}
