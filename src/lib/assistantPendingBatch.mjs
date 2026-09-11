// Pure logic extracted so it's testable without pulling in React/Supabase
// client deps (see assistantConfirmation.mjs / assistantConversationState.mjs
// for the same pattern in this repo).
//
// Mirrors pendingAction (derived from message.toolAction) but for a batch
// proposal -- without this, the planner has no signal that several items
// are already sitting on screen awaiting the user's own confirm tap, and
// (since additive_write mode forces some function call every turn) a purely
// conversational follow-up like "great job." caused it to silently
// reconstruct and re-propose the whole batch from conversation history.
// See the 2026-09-11 bug report this closes.
export function derivePendingBatchAction(messages) {
  const message = [...(Array.isArray(messages) ? messages : [])].reverse().find((m) =>
    m?.role === 'assistant' &&
    Array.isArray(m.toolActionBatch?.actions) &&
    m.toolActionBatch.actions.some((action) => action?.status === 'proposed')
  )
  const titles = message?.toolActionBatch?.actions
    .filter((action) => action?.status === 'proposed')
    .map((action) => String(action.args?.title ?? 'event'))
  if (!titles || titles.length === 0) return undefined
  return { count: titles.length, titles }
}
