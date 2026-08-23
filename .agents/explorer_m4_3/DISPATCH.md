## 2026-08-23T12:18:09Z
You are Explorer 3 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/explorer_m4_3/
Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md

Your task:
Investigate and design the **Active Feedback Loop & Dynamic Rule Synthesis** subsystem and test suites:
1. Examine existing `household_capture_rules` migrations and code (`src/hooks/useHouseholdCaptureRules.ts`, edge functions) to see current capture rule schemas.
2. Design the expansion migration `supabase/migrations/20260824020000_expand_capture_rules_routing.sql` to add origin handling (`voice_directive`, `fast_dismissal`, `user_untrain`, `manual_teach`, `user_label`, `learned_feedback`), `category_routing`, `voice_transcript`, and `feedback_count`.
3. Design `supabase/functions/_shared/capture-command-router.mjs` to parse voice directives and commands (e.g. "tennis updates are informational", "always track bakery receipts as logistics", "only alert on field trip waivers", "stop extracting flyers from X") into persisted capture rules.
4. Update `src/hooks/useHouseholdCaptureRules.ts` for real-time reactivity, fast dismissals, manual category adjustments, and untraining.
5. Design the test suites `tests/active-learning-ingestion.test.mjs` and `tests/compound-decomposer.test.mjs` to comprehensively test all M4 capabilities.
6. Write your complete analysis and recommendations to `/Users/taboj/casa-tabor/.agents/explorer_m4_3/handoff.md` and send a message when done.
