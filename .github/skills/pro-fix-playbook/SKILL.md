---
name: pro-fix-playbook
description: "Run an opt-in, risk-tiered, root-cause-first engineering workflow. Use when the user explicitly invokes /pro-fix-playbook for production incidents, destructive data repair, migrations, authentication, recurrence/sync bugs, complex cross-system regressions, or genuinely ambiguous UX behavior."
argument-hint: "Describe the high-risk bug, incident, migration, or complex change"
disable-model-invocation: true
---

# Pro Fix Playbook

Apply rigor in proportion to risk. This skill is for work where a narrow default
workflow is not enough; it is not a requirement for every bug or feature.

Do not invoke subagents. Use repository and runtime tools directly.

## 1. Classify risk first

Choose the highest applicable tier:

| Tier | Typical work | Required proof |
| --- | --- | --- |
| 0 | Docs, copy, comments | Diff review; docs check if one exists |
| 1 | Isolated component or helper | Focused regression; changed-file lint; relevant type-check |
| 2 | Shared UI, state, API, or multiple consumers | Focused tests; type-check; relevant build; full suite once before release |
| 3 | Schema, production data, sync, recurrence, auth, destructive or cross-system behavior | Full playbook, focused and full tests, build, runtime fixture, deployment verification |

If the task is Tier 0-1 and has no meaningful ambiguity, use the concise path:
inspect, fix, focused validation, handoff. Do not manufacture ceremony.

## 2. Discover only what can change the solution

Before editing:

- Capture the exact symptom/outcome and expected behavior.
- Inspect the first visible surface and likely source.
- For a bug, trace only as far as needed to find the first incorrect mutation.
- Search for shared helpers and directly coupled writers/readers.
- Separate facts, inferences, and unresolved product decisions.
- Do not ask questions tools or repository conventions can answer.

Investigation budget for Tier 0-2:

- Begin with one batched search/read pass.
- Prefer directly relevant files and shared helpers.
- Reassess after roughly six files.
- Expand to storage, logs, production data, or parallel surfaces only when
  evidence implicates them.
- Summarize large command output instead of retaining full logs.

Tier 3 may expand beyond this budget when evidence requires it. Load
[the incident checklist](./references/incident-checklist.md) only then.

## 3. Clarify conditionally

Ask one question at a time only when an unresolved choice materially changes
behavior, architecture, data compatibility, risk, or acceptance criteria.

Proceed without a confirmation round when evidence and repository conventions
establish one safe implementation. Require explicit shared-understanding
confirmation only for destructive operations, migrations/backfills, ambiguous
product behavior, or material scope choices.

Do not silently make a new consequential product decision during implementation.

## 4. Plan and track proportionally

Keep the active plan limited to:

- current objective;
- established root cause;
- decisions and non-goals;
- affected files/systems;
- remaining work;
- validation status.

Use dependency-aware todos only when work spans multiple systems, needs
migration/deployment, has at least three independently verifiable phases, or may
continue across sessions. Otherwise, work directly without ceremonial todos.

## 5. Implement root-cause-first

- Correct the authoritative source of behavior.
- Add a read/UX compatibility shield only when existing bad data can remain.
- Backfill only when persistent repair is necessary and guarded.
- Reuse shared helpers and preserve established payload/type boundaries.
- Keep failures explicit; do not add silent success-shaped fallbacks.

## 6. Validate by risk

During implementation, run focused checks first. Expand only when the change,
dependency graph, or a failure justifies it.

- Run the full test suite once at the release boundary for Tier 2-3.
- Do not rerun unchanged full gates after every edit.
- Build only when compilation, bundling, generated output, or release readiness
  is relevant.
- Deploy only when the user requested deployment or production-sensitive work
  must be made live.
- After deployment, verify the exact revision and real affected runtime path.

Use [the validation strategy](./references/validation-strategy.md) to select
checks and escalation rules.

## 7. Handoff concisely

Report:

1. Root cause or implementation outcome.
2. What changed at the source.
3. Compatibility/data remediation, if any.
4. Validation actually run.
5. Deployment/runtime status, if applicable.
6. Residual risks or intentionally deferred work.

Do not include empty sections or a file-by-file inventory.

## Attribution

The conditional one-question-at-a-time technique is adapted from Matt Pocock's
MIT-licensed `grilling` skill:
https://github.com/mattpocock/skills/blob/main/skills/productivity/grilling/SKILL.md

Copyright (c) 2026 Matt Pocock. Used and adapted under the MIT License.
