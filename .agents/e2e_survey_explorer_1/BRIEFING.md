# BRIEFING — 2026-08-23T11:48:25Z

## Mission
Investigate the project structure, dependencies, test runner setup, existing email intelligence modules/schemas/parsers, and existing test patterns to determine how an opaque-box E2E test in `tests/e2e-email-intelligence-tiers.test.mjs` can invoke the email intelligence pipeline.

## 🔒 My Identity
- Archetype: explorer
- Roles: codebase investigation, synthesis, report authoring
- Working directory: /Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1
- Original parent: d95f471d-08a8-4957-8033-7923a3024162
- Milestone: E2E Email Intelligence Testing Survey

## 🔒 Key Constraints
- Read-only investigation — do NOT implement or modify project source code
- Write analysis artifacts only in `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/`

## Current Parent
- Conversation ID: d95f471d-08a8-4957-8033-7923a3024162
- Updated: 2026-08-23T11:48:25Z

## Investigation State
- **Explored paths**:
  - `package.json`, `tsconfig.json`
  - `supabase/functions/scan-gmail-inbox/index.ts`, `supabase/functions/scan-travel-emails/index.ts`
  - `supabase/functions/_shared/*` (`gmail-canonical-email.mjs`, `gmail-message-content.mjs`, `family-email-evidence.mjs`, `assistant-email-knowledge-read.mjs`, `immediate-family-scope.mjs`)
  - `src/utils/*` (`actionInspectionSynthesis.ts`, `vendorTransactions.ts`, `needsYouFeed.ts`, `prepCategories.ts`, `gmailHealth.ts`)
  - `src/types/index.ts`
  - `supabase/migrations/*` (canonical inbox, knowledge claims, household capture rules, attachments, vendor transactions)
  - `tests/*.test.mjs` (surveyed existing 271 test suites, verified 39 Gmail tests)
- **Key findings**:
  - Test runner is Node.js built-in `node --test` with ESM (`"type": "module"`) running on Node v24.13.0 (with direct TypeScript module loading).
  - Email intelligence pipeline operates in 4 tiers:
    - Tier 1: Canonical Inbox Deduplication & MIME Parsing
    - Tier 2: Keyword Gating, Intent Classification, Multimodal Directives, & Family Evidence
    - Tier 3: Suggestion & State Persistence Pipeline (non-destructive event suggestions to `prep_items`, knowledge claims, evidence queue)
    - Tier 4: Client-Side Synthesis, Logistics Radar, & Sidecar Inspection
- **Unexplored areas**: None for survey scope.

## Key Decisions Made
- Formulated complete blueprint and verification strategy for `tests/e2e-email-intelligence-tiers.test.mjs`.

## Artifact Index
- `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/DISPATCH.md` — Dispatch log
- `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/BRIEFING.md` — Working memory and identity
- `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/progress.md` — Liveness and progress heartbeat
- `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/codebase_report.md` — Detailed codebase survey and test blueprint
- `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_1/handoff.md` — 5-component handoff report
