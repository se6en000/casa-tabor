## 2026-08-23T12:29:29Z

You are Worker 2 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/worker_m4_2/

Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md
- /Users/taboj/casa-tabor/.agents/challenger_m4_1/handoff.md
- /Users/taboj/casa-tabor/.agents/challenger_m4_1/test_stress.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
Apply the 6 hardening improvements specified in Challenger 1's handoff report (`/Users/taboj/casa-tabor/.agents/challenger_m4_1/handoff.md`):

1. **`supabase/functions/_shared/capture-command-router.mjs`**:
   - In `cleanPatternValue`, strip Unicode/curly double and single quotes (`“ ” ‘ ’ « » " '`).
   - In `isCaptureRuleDirective`, expand the regexes to cover all aliases defined in `ARCHETYPE_MAP` (knowledge, newsletters, orders, schedule, spam, promo, tasks, packages, delivery, receipts, etc.).
   - In `parseVoiceDirective` (Suppression parser), support optional adjectives/articles before nouns (e.g. "weekly newsletters from target.com" -> pattern_value "target.com").
   - In `parseVoiceDirective` (Untrain parser), cleanly strip prefixes (e.g. "untrain rule for tennis updates" -> pattern_value "tennis updates").

2. **`supabase/functions/_shared/compound-decomposer.mjs`**:
   - In `anchorRelativeDate`, expand daypart regexes to support "tomorrow morning", "tomorrow afternoon", "tomorrow evening", "friday morning", etc. setting hour and minute correctly and setting `isAllDay = false`.

3. **`src/hooks/useHouseholdCaptureRules.ts`**:
   - In `matchRule`, check phrases in subject or body and sort returned rules by deterministic precedence (`sender (4) > domain (3) > subject (2) > phrase (1)`).

4. **Verify All Tests**:
   - Run `node --test .agents/challenger_m4_1/test_stress.mjs`
   - Run `node --test .agents/challenger_m4_2/test_stress.mjs`
   - Run `node --test tests/active-learning-ingestion.test.mjs`
   - Run `node --test tests/compound-decomposer.test.mjs`
   - Run `node --test tests/capture-command-router.test.mjs`
   - Run `node --test tests/e2e-email-intelligence-tiers.test.mjs`
   - Run `npm test`
   - Run `npx tsc -b`
   - Run `npx eslint src/hooks/useHouseholdCaptureRules.ts supabase/functions/_shared/capture-command-router.mjs supabase/functions/_shared/few-shot-exemplar-store.mjs supabase/functions/_shared/compound-decomposer.mjs tests/active-learning-ingestion.test.mjs tests/compound-decomposer.test.mjs`

Document all modified files, commands run, and test outputs in `/Users/taboj/casa-tabor/.agents/worker_m4_2/handoff.md` and send a message when complete.
