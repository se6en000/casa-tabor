---
name: ai-assistant-qa-gate
description: "Run Casa Tabor's periodic Alexa/calendar/grocery regression gate with realistic natural language, STT-like wording, multi-turn context, safe fixture cleanup, and clear pass/fail reporting. Use when validating assistant changes, checking for AI regressions, running periodic QA, or before/after deploying voice and calendar/grocery behavior."
argument-hint: "smoke (default), full, or a specific count"
user-invocable: true
---

# AI Assistant QA Gate

Use this skill to validate Casa's production `ai-assistant` and
`execute-ai-action` paths without manually testing calendar and grocery
conversations.

## Cost and model policy

- This skill can be invoked from a lightweight Copilot/chat model. The runner
  only launches the deterministic script and summarizes structured output;
  reserve a heavier reasoning model for investigating actual failures.
- Default to the **smoke** gate. It runs 12 representative steps.
- Use `gemini-2.5-flash-lite`, the least expensive supported production model.
- Run **full** only before deployment, after assistant-routing changes, or for
  periodic deeper validation.
- Most covered calendar/grocery paths are deterministic and consume no model
  tokens. The override only affects turns that genuinely require an LLM.
- Do not switch to a different provider or unsupported model just to reduce
  cost; that would stop testing the production architecture.

## Commands

### Fast smoke gate

```bash
npm run qa:ai-assistant
```

Acceptance:

- process exits `0`
- `failed` is `0`
- `cleanup.verified` is `true`
- heartbeat output shows natural language for each step

### Full periodic or pre-deploy gate

```bash
npm run qa:ai-assistant:full
```

### Calendar management edge gate

```bash
npm run qa:ai-assistant:calendar-edge
```

This runs ten multi-turn calendar-management conversations covering ambiguous
selection, correction, cancellation, midnight rollover, multi-day shifts,
conflicts, STT ambiguity, recurring-event safety, stale confirmations, and
selective bulk deletion. Assertions target semantic intent, selected entities,
tool safety, execution, and readback—not exact assistant wording.

### Targeted diagnostic sample

```bash
node scripts/ai-assistant-qa-sweep.mjs \
  --mode=full \
  --count=20 \
  --model=gemini-2.5-flash-lite
```

## Procedure

1. Run repository unit tests first:

   ```bash
   npm test
   ```

2. Choose the gate:
   - ordinary code change: smoke
   - assistant/calendar/grocery routing change: full
   - production release: full

3. Watch the heartbeat. Each `start` line must expose:
   - scenario group
   - calendar or grocery surface
   - assistant mode
   - exact natural-language utterance

4. Review the final summary:
   - totals
   - failure taxonomy
   - boundary behavior
   - cleanup counts and verification

5. If any scenario fails:
   - do not rerun until green without investigating
   - query `ai_drawer_debug_events` using the reported `run_id`
   - separate product defects from intentionally unsupported boundary noise
   - add the broken phrase as a regression before fixing routing
   - rerun the smallest reproducing count, then the full gate

6. If cleanup verification fails:
   - treat the gate as failed even if conversations passed
   - identify the tracked fixture IDs and remove only those QA rows
   - never bulk-delete household data by date alone

## Alexa-grade coverage

The gate must retain representative coverage for:

- calendar reads, counts, conflicts, creates, updates, deletes
- grocery reads, adds, checks, removals
- multi-day trips
- active-entity follow-ups
- multi-turn calendar and grocery conversations
- typed shorthand, punctuation, and common misspellings
- STT-like fragments and ambiguous commands
- confirmation-safe tool selection
- action execution, not merely plausible assistant text
- fixture and mutation cleanup

## Professional additions

When extending the gate:

- Prefer a small stable smoke corpus plus a broader rotating full corpus.
- Track pass rate, failure category, P50/P95 latency, model calls, and tokens.
- Keep deterministic-lane scenarios separate from LLM-lane scenarios.
- Add every production incident phrase after removing personal data.
- Test corrections, cancellations, stale confirmations, duplicate requests,
  retries, and partial STT turns.
- Include negative tests proving ambiguous destructive requests do not execute.
- Keep limits explicit: severely garbled, targetless, cross-domain utterances
  should clarify or safely refuse rather than guess.

## Reporting contract

Always report:

1. mode, model, and scenario count
2. pass/fail totals
3. notable natural-language examples
4. failure categories and root causes
5. cleanup verification
6. known limits and recommended next expansion
