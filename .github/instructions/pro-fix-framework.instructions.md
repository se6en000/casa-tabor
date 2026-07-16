---
description: Concise engineering baseline for source-code changes
applyTo: "**/*.{ts,tsx,js,mjs,cjs,sql,css,sh,py}"
---

# Engineering Baseline

Use proportional rigor:

1. Inspect the relevant code and evidence before editing.
2. Fix the root cause rather than masking the visible symptom.
3. Search for existing helpers and directly coupled paths before adding logic.
4. Preserve unrelated work and repository conventions.
5. Add or update focused tests when behavior changes.
6. Run the smallest validation that proves the change, expanding when risk or
   failures justify it.
7. Do not claim deployment or runtime success without verifying it.

Do not invoke subagents; work directly with repository and runtime tools.

Use `/pro-fix-playbook` explicitly for high-risk, ambiguous, destructive, or
cross-system work. Ordinary isolated changes do not require incident ceremony,
full-suite validation, deployment, or production inspection unless requested.
