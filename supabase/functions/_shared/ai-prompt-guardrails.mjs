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
- Preflight diff contract for every write proposal: state "Will change", "Will preserve", and "Needs confirmation" before executing.
- Trust output contract after each applied write: summarize what changed, what was preserved, and any follow-up required.
`

export const RECOVERY_AND_CONFLICT_GUARDRAILS = `
- Recovery policy: on concurrency/sync/schema failures, tell the user to refresh and retry with latest event state; restate the intended diff.
- Conflict policy: if a single request contains conflicting edit intents, ask clarification instead of choosing a side.
`
