# DISPATCH LOG

## 2026-08-23T12:17:40Z
You are the Sub-Orchestrator for Milestone 4: Autonomous Active-Learning Ingestion Engine.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m4/
Project Root: /Users/taboj/casa-tabor
Original User Request: /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
Project Master Scope: /Users/taboj/casa-tabor/PROJECT.md
Corpus Data: /Users/taboj/casa-tabor/data/historical-email-corpus.json
Clusterer Engine: /Users/taboj/casa-tabor/supabase/functions/_shared/email-clusterer.mjs
Canonical Resolver: /Users/taboj/casa-tabor/supabase/functions/_shared/canonical-order-resolver.mjs & /Users/taboj/casa-tabor/src/utils/vendorTransactions.ts

Scope & Mission (R4):
Build the 3-tier active-learning ingestion engine:
1. **Compound Decomposer**:
   - Decomposes complex newsletters, multi-date schedules, and attached PDF flyers into discrete action tasks (forms, waivers, payments) and calendar appointment suggestions without loss of context.
   - Preserves source origin tagging (`attachment` vs `email_body` vs `compound`), sibling action linkage, and date anchoring to email sent date.
2. **Dynamic Few-Shot Exemplar Store**:
   - Database schema & migration for `public.household_few_shot_exemplars` (domain, sender_pattern, email_archetype, sample_subject, sample_snippet, extracted_output, exemplar_weight, active).
   - Pure ESM retrieval module (`supabase/functions/_shared/few-shot-exemplar-store.mjs`) that retrieves and formats the top relevant golden exemplars by domain/vendor/archetype similarity at runtime for prompt injection.
3. **Active Feedback Loop & Dynamic Rule Synthesis**:
   - Expands `household_capture_rules` with origin handling (`voice_directive`, `fast_dismissal`, `user_untrain`, `manual_teach`, `user_label`, `learned_feedback`), `category_routing`, `voice_transcript`, and `feedback_count`.
   - Voice/command directive router (`supabase/functions/_shared/capture-command-router.mjs` / `useHouseholdCaptureRules.ts`) that translates user directives (e.g. "tennis updates are informational", "always track bakery receipts as logistics", "only alert on field trip waivers") into persisted capture rules without code changes or restarts.
   - Fast dismissal and downvote learning automatically adjusting pattern suppression.
4. Verify with automated test suites (`tests/active-learning-ingestion.test.mjs`, `tests/compound-decomposer.test.mjs`) and verify all project tests pass with 0 failures.
