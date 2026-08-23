## 2026-08-23T12:35:38Z
You are Worker 3 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/worker_m4_3/

Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md
- /Users/taboj/casa-tabor/.agents/challenger_m4_3/handoff.md
- /Users/taboj/casa-tabor/tests/challenger-m4-adversarial.test.mjs

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
1. Update `supabase/functions/_shared/capture-command-router.mjs`:
   In `isCaptureRuleDirective`, update line 91 so that the regex for `"track/route/mark/treat ... as/to/into ..."` matches all archetype aliases symmetrically with line 88:
   ```javascript
   if (/\b(?:track|route|mark|treat)\s+.+\s+(?:as|to|into)\s+(?:informational|info|knowledge|estate\s+knowledge|newsletters?|logistics|parcels?|packages?|delivery|receipts?|orders?|executive\s+actions?|actions?|tasks?|waivers?|bills?|invoices?|appointments?|calendar|schedule|updates?|lifecycle|promotional|promo|marketing|spam|noise)\b/i.test(input)) {
     return true
   }
   ```
2. Update `tests/challenger-m4-adversarial.test.mjs` test `CHALLENGE-2.3` to assert that directives like `"route pool maintenance into knowledge"`, `"track clinic visits as info"`, `"mark school bulletins as newsletter"`, `"route community letters as newsletters"`, and `"treat doctor checkup as appointment"` resolve to `{ status: 'execute', tool: 'upsert_capture_rule', ... }`.
3. Verify all tests pass:
   - `node --test tests/challenger-m4-adversarial.test.mjs`
   - `node --test tests/active-learning-ingestion.test.mjs`
   - `node --test tests/compound-decomposer.test.mjs`
   - `node --test tests/capture-command-router.test.mjs`
   - `npm test`
   - `npx tsc -b`
   - `npx eslint src/hooks/useHouseholdCaptureRules.ts supabase/functions/_shared/capture-command-router.mjs tests/challenger-m4-adversarial.test.mjs`

Write your complete handoff report to `/Users/taboj/casa-tabor/.agents/worker_m4_3/handoff.md` and send a message when done.
