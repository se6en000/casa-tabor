# Scope: Milestone 4 (Autonomous Active-Learning Ingestion Engine)

## Architecture & Subsystems
Milestone 4 builds the 3-tier active-learning ingestion engine for Casa Tabor:
1. **Compound Decomposer**:
   - Decomposes complex multi-intent emails, multi-date schedules, and attached PDF flyers into discrete action tasks and calendar appointments.
   - Preserves source origin tagging (`attachment` vs `email_body` vs `compound`), sibling action linkage (`siblingActionIds`), and date anchoring to email sent date.
2. **Dynamic Few-Shot Exemplar Store**:
   - Database schema & migration for `public.household_few_shot_exemplars` (id, domain, sender_pattern, email_archetype, sample_subject, sample_snippet, extracted_output, exemplar_weight, active, timestamps, search_vector GIN index).
   - Pure ESM retrieval module (`supabase/functions/_shared/few-shot-exemplar-store.mjs`) with multi-factor scoring (domain, sender, archetype, Jaccard token similarity, keyword overlap), 5-minute TTL caching, and 14 golden seeds.
3. **Active Feedback Loop & Dynamic Rule Synthesis**:
   - Migration `supabase/migrations/20260824020000_expand_capture_rules_routing.sql` expanding `household_capture_rules` with origin handling, `category_routing` JSONB, `voice_transcript` TEXT, `feedback_count` INT, and Realtime sync.
   - Shared router `supabase/functions/_shared/capture-command-router.mjs` parsing voice directives across all 33 archetype aliases with deterministic 4-tier precedence (`sender > domain > subject > phrase`).
   - React hook `src/hooks/useHouseholdCaptureRules.ts` with Realtime subscription, fast dismissals, category routing adjustments, and untraining.
4. **Automated Verification & Integrity Certification**:
   - Test suites: `tests/active-learning-ingestion.test.mjs`, `tests/compound-decomposer.test.mjs`, `tests/capture-command-router.test.mjs`, `tests/challenger-m4-adversarial.test.mjs`.
   - Full regression certification: 2,134/2,134 tests passing across 27 suites (0 failures).

## Milestones Status
| # | Name | Scope | Status |
|---|---|---|---|
| M4 | Autonomous Active-Learning Ingestion Engine | Compound Decomposer, Few-Shot Exemplar Store, Active Feedback Loop & Rule Synthesis, Test Suites | **DONE** (Certified CLEAN, 2,134 tests pass) |

## Implemented Files & Deliverables
- `supabase/migrations/20260824010000_household_few_shot_exemplars.sql`
- `supabase/migrations/20260824020000_expand_capture_rules_routing.sql`
- `supabase/functions/_shared/few-shot-exemplar-store.mjs`
- `supabase/functions/_shared/compound-decomposer.mjs`
- `supabase/functions/_shared/capture-command-router.mjs`
- `src/hooks/useHouseholdCaptureRules.ts`
- `src/utils/actionInspectionSynthesis.ts`
- `tests/active-learning-ingestion.test.mjs`
- `tests/compound-decomposer.test.mjs`
- `tests/challenger-m4-adversarial.test.mjs`
