---
description: Root-cause-first fix framework for all bug and UX remediation work
applyTo: "**"
---

# Pro Fix Framework (Always-On)

Use this workflow for all fixes so solutions are durable, user-trustworthy, and production-safe.

## 1) Frame the symptom precisely

- Capture exact user-facing symptom(s), where they appear, and expected behavior.
- Reproduce (or trace) before changing code.
- Prefer evidence over intuition: logs, actual payloads, exact rendering surfaces.

## 2) Identify the true source of mutation

- Trace the full path end-to-end:
  1. Write path (creation/enrichment/sync/import),
  2. Storage shape (database values),
  3. Read path (queries/hydration/transforms),
  4. Display path (all UI surfaces and derived text).
- Fix the **origin** (root cause), not only a downstream symptom.

## 3) Perform blast-radius review before patching

- Search for duplicated helpers and parallel code paths.
- Enumerate all affected surfaces (pages, cards, sheets, derived pipelines, automation jobs).
- Prefer a shared helper/util to prevent divergent behavior across views.

## 4) Apply dual-layer remediation when needed

When bad data may already exist, do both:

1. **Source fix**: stop producing new bad values at write-time.
2. **Immediate UX shield**: normalize at read/render-time so existing data looks correct now.

Then decide whether persistent backfill is required based on risk and scope.

## 5) Regression-proof the fix

- Add focused tests that capture the exact failure mode and key edge cases.
- Include at least:
  - broken-case regression,
  - valid-case non-regression,
  - shared-helper behavior.

## 6) Verify with repo standards

- Run existing test/build/lint commands.
- If lint/test has pre-existing failures unrelated to the change, state this explicitly.
- Confirm final behavior in the real runtime path (not only unit tests).

## 7) Deploy and runtime verification discipline

- For backend function changes: deploy the affected function(s).
- For frontend changes: follow repo deployment rules, refresh Pi kiosk session, and verify Chromium is running before handoff.
- Never claim done without operational verification.

## 8) Communicate like an incident engineer

Always report:
- root cause,
- what was fixed at source,
- what was fixed for current UX/data,
- what was validated,
- what remains (if anything).

## Concrete pattern from this repo

- Avoid naive title-casing patterns like `\\b\\w` for user text with apostrophes; they can turn possessives into `Owen'S`.
- Use possessive-safe normalization and centralize it in a shared utility reused by all event/reminder surfaces.
