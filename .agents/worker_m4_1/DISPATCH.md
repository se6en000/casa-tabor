## 2026-08-23T12:21:05Z

You are Worker 1 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/worker_m4_1/

Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md
- /Users/taboj/casa-tabor/.agents/explorer_m4_1/handoff.md
- /Users/taboj/casa-tabor/.agents/explorer_m4_2/handoff.md
- /Users/taboj/casa-tabor/.agents/explorer_m4_3/handoff.md

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_preview_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your Tasks:
Implement the Milestone 4 Active-Learning Ingestion Engine across the following files:

1. **Database Migrations**:
   - `supabase/migrations/20260824010000_household_few_shot_exemplars.sql`:
     - Create `public.household_few_shot_exemplars` table, search_vector GIN index, domain/sender/archetype indexes, RLS policies, updated_at trigger, and 14 golden seed exemplars across all 6 archetypes.
   - `supabase/migrations/20260824020000_expand_capture_rules_routing.sql`:
     - Expand `public.household_capture_rules` with new columns (`default_archetype`, `category_routing`, `voice_transcript`, `feedback_count`), updated check constraints (`pattern_type` including 'phrase', `origin` including 'voice_directive', 'fast_dismissal', 'user_untrain'), indexes, and Realtime publication.

2. **Shared Modules (Pure ESM, zero external runtime dependencies)**:
   - `supabase/functions/_shared/few-shot-exemplar-store.mjs`:
     - Implement exemplar domain extraction, tokenization, Jaccard similarity, multi-factor scoring (`scoreExemplar`), ranking (`scoreAndRankExemplars`), prompt block formatting (`formatFewShotPromptBlock`), in-memory caching, and fallback golden seeds (`getDefaultGoldenExemplars`).
   - `supabase/functions/_shared/compound-decomposer.mjs`:
     - Implement compound detection (`isCompoundEmail`), deterministic date anchoring (`anchorRelativeDate`), compound email decomposition (`decomposeCompoundEmail`), prompt formatting (`formatCompoundDecomposerPrompt`), and LLM response parsing (`parseCompoundDecomposerResponse`). Support source origin tagging (`attachment`, `email_body`, `compound`), sibling action linkage (`siblingActionIds`), and 0% false leakage (`agency_level === 0` for passive disclaimers).
   - `supabase/functions/_shared/capture-command-router.mjs`:
     - Implement voice directive parsing (`isCaptureRuleDirective`, `parseVoiceDirective`, `synthesizeFeedbackRule`, `matchCaptureRules`, `applyCaptureRules`), rule precedence (sender > domain > subject > phrase), and preserve 100% backward compatibility for all assistant quick actions (groceries, reminders, events).

3. **Client Utilities & Hooks**:
   - `src/utils/actionInspectionSynthesis.ts`:
     - Ensure client-side inspection synthesis supports sibling action bundles, source origin badges, timezone-safe date parsing, and agency level retention.
   - `src/hooks/useHouseholdCaptureRules.ts`:
     - Modernize hook with Realtime subscription to `household_capture_rules`, methods for `fastDismissRule`, `untrainRule`, `adjustCategoryRouting`, `recordVoiceDirective`, and offline/settings fallback.

4. **Integration Test Suites**:
   - `tests/active-learning-ingestion.test.mjs`:
     - Test few-shot exemplar store (scoring, ranking, formatting, golden seeds).
     - Test voice directive parser & rule synthesis across all intent types (informational, logistics, waivers, suppression, untrain).
     - Test rule matching precedence and application (`applyCaptureRules`).
     - Test assistant quick action regression safety (18+ tests).
   - `tests/compound-decomposer.test.mjs`:
     - Test compound email detection.
     - Test multi-event newsletter decomposition (Bak MSOA Curriculum Night, etc.).
     - Test PDF attachment decomposition and waiver extraction with sibling links.
     - Test date anchoring to email sent date.
     - Test 0% false action leakage (`agency_level === 0`).

5. **Verification**:
   - Run `node --test tests/active-learning-ingestion.test.mjs`
   - Run `node --test tests/compound-decomposer.test.mjs`
   - Run `node --test tests/capture-command-router.test.mjs`
   - Run `node --test tests/e2e-email-intelligence-tiers.test.mjs`
   - Run `npm test`
   - Verify that all test suites pass with 0 failures.

Document all created/modified files, commands executed, and exact test results in `/Users/taboj/casa-tabor/.agents/worker_m4_1/handoff.md` and send a message when complete.
