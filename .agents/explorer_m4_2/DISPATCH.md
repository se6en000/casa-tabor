## 2026-08-23T12:18:09Z
You are Explorer 2 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/explorer_m4_2/
Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md

Your task:
Investigate and design the **Dynamic Few-Shot Exemplar Store** subsystem:
1. Examine existing Supabase migrations in `supabase/migrations/` and edge functions in `supabase/functions/` to understand table structures, RLS policies, indexes, and database access conventions.
2. Design the migration `supabase/migrations/20260824010000_household_few_shot_exemplars.sql` for `public.household_few_shot_exemplars` (id, domain, sender_pattern, email_archetype, sample_subject, sample_snippet, extracted_output, exemplar_weight, active, timestamps).
3. Design the pure ESM retrieval module `supabase/functions/_shared/few-shot-exemplar-store.mjs` that can retrieve, score, and format the top relevant golden exemplars by domain, sender, archetype, and subject similarity at runtime for prompt injection.
4. Include seeding strategy with initial high-quality golden exemplars across the 6 household archetypes.
5. Write your complete analysis and recommendations to `/Users/taboj/casa-tabor/.agents/explorer_m4_2/handoff.md` and send a message when done.
