export const EDIT_INTENT_GUARDRAILS = `
- Before proposing update_event, classify each changed field intent as one of: append | replace | clear | transform.
- Treat phrasing like "add", "also add", "include", "plus" as append by default; only replace when the user explicitly says replace/overwrite.
- For full-replacement fields (what_to_bring, checklist_items, action_items), preserve existing items unless user explicitly requests removal or replacement.
`

export const AMBIGUITY_GUARDRAILS = `
- Use search_events ambiguity metadata. If ambiguous=true or top confidence < 0.75, ask a disambiguation question before any write action.
- If two candidate events are close matches, do not guess; ask the user which event to edit.
`

export const DIFF_AND_OUTPUT_GUARDRAILS = `
- For every write action (update_event, create_event, delete_event): return the tool_action DIRECTLY — do NOT output a text preview turn before the tool_action. The confirmation card shown to the user IS the preflight diff.
- After the user confirms and execution succeeds, respond with one concise sentence summarizing what changed.
- Never show a "Will change / Will preserve / Needs confirmation" text block before returning a tool_action — that creates a redundant double-confirmation UX.
`

export const RECOVERY_AND_CONFLICT_GUARDRAILS = `
- Recovery policy: on concurrency/sync/schema failures, tell the user to refresh and retry with latest event state; restate the intended diff.
- Conflict policy: if a single request contains conflicting edit intents, ask clarification instead of choosing a side.
`
