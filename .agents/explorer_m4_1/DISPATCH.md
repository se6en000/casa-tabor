## 2026-08-23T12:18:09Z
You are Explorer 1 for Milestone 4 (Autonomous Active-Learning Ingestion Engine).
Your working directory is /Users/taboj/casa-tabor/.agents/explorer_m4_1/
Read the following files before starting:
- /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m4/SCOPE.md

Your task:
Investigate and design the **Compound Decomposer** subsystem:
1. Examine existing email ingestion files in `supabase/functions/scan-gmail-inbox/`, `supabase/functions/_shared/`, and client utilities in `src/utils/` to see how emails, attachments, and action items are structured.
2. Investigate how complex newsletters, multi-date schedules (school calendars, sports practices, camp itineraries), and attached PDF flyers should be decomposed into discrete action tasks (waivers, forms, payments) and temporal appointment suggestions without losing context.
3. Determine how source origin tagging (`attachment` vs `email_body` vs `compound`), sibling action linkage (`parent_email_id`, `sibling_action_ids`), and date anchoring to email sent date should be implemented.
4. Detail the design for `supabase/functions/_shared/compound-decomposer.mjs` and client utilities in `src/utils/actionInspectionSynthesis.ts`.
5. Write your complete analysis and recommendations to `/Users/taboj/casa-tabor/.agents/explorer_m4_1/handoff.md` and send a message when done.
