---
name: pro-fix-playbook
description: "Run a root-cause-first, blast-radius-aware fix workflow with dual-layer remediation (source + UX/data), regression proofing, and runtime verification. Use for any bug or behavior regression that may affect multiple surfaces."
---

# Pro Fix Playbook

Use this skill when a fix must be **correct, durable, and production-safe**.
It is the invokable version of the always-on pro-fix framework.

## When to invoke

- User reports a confusing bug and wants a deep dive.
- The same symptom appears across calendar/home/reminders or multiple pages.
- You suspect mutation/normalization/sync logic is involved.
- A quick patch would hide symptoms but not stop bad data generation.

## Output contract (always deliver in this order)

1. Symptom definition (exact + reproducible)
2. Root cause path (write -> storage -> read -> display)
3. Blast radius map (all affected surfaces)
4. Patch plan (source fix + immediate UX/data shield)
5. Validation evidence (tests/build/runtime checks)
6. Deployment/runtime verification
7. Residual risk + follow-ups

## Execution checklist

### Phase 1: Frame the bug

- Capture exact failing text/state and expected result.
- Identify where user sees it first and where it likely originates.
- Avoid coding before evidence.

### Phase 2: Trace mutation pipeline

- Inspect all transformation points:
  - ingest/enrichment/import/sync functions
  - DB write payloads
  - query hydration/normalization
  - UI render helpers
- Name the first place bad data can be created.

### Phase 3: Blast-radius sweep

- Search for duplicate helpers and inline formatting logic.
- List every surface that reads/derives the affected field.
- Convert repeated logic into one shared utility when possible.

### Phase 4: Dual-layer remediation

Apply both unless intentionally scoped otherwise:

1. **Source-layer fix**: prevent future bad writes.
2. **Read/render-layer fix**: normalize existing records now for UX continuity.

Then decide whether a persistent data backfill is required.

### Phase 5: Regression hardening

- Add focused tests for:
  - the broken case,
  - nearby valid cases,
  - shared-helper behavior.
- Ensure tests guard against reintroduction.

### Phase 6: Verify with repo standards

- Run existing lint/build/test commands.
- Explicitly separate pre-existing failures from change-caused failures.
- Validate behavior in real app/runtime flow.

### Phase 7: Deploy and operational verify

- Deploy changed backend functions when applicable.
- Deploy frontend per repo rules.
- Refresh Pi kiosk session and verify Chromium is running before handoff.

### Phase 8: Incident-grade handoff

Report:
- root cause,
- source-layer fix,
- UX/data mitigation,
- validation commands/results,
- what remains (if anything).

## Right vs wrong pattern

### Wrong

- Patch only one visible component.
- Ignore the upstream transform that keeps generating bad values.
- Declare done without runtime verification.

### Right

- Fix upstream generator and all read/display surfaces.
- Add shared normalization utility to eliminate drift.
- Add regression tests and verify in production runtime path.

## Casa example (possessive bug)

Problem: event titles showed `Owen'S`, `Jake'S`.

Root cause: title-casing with `\b\w` uppercased possessive suffixes after apostrophes.

Playbook application:
- Source fix in `supabase/functions/enrich-event/index.ts` (possessive-safe title casing).
- Immediate UX/data shield in event hydration + shared `cleanEventTitle`.
- Multi-surface cleanup (Home, Day view, Large card, Reminder card, reminder->Needs You flow).
- Regression tests added (`tests/event-title.test.mjs`).
- Full validation + deploy + Pi runtime verification.

## Quick command starter (adapt per issue)

```bash
# 1) Find transform points
rg -n "title|normalize|format|replace|toUpperCase|toLowerCase" src supabase/functions

# 2) Find all display surfaces for target field
rg -n "event.title|cleanEventTitle|Reminder|DayView|HomePage" src

# 3) Validate
npm run test
npm run build
npm run lint
```
