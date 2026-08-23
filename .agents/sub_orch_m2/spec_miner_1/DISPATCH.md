## 2026-08-23T12:09:38Z
You are the Spec Miner for Milestone 2 (Empirical Evidence Report & Ground-Truth Benchmark).
Your working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/
Project root: /Users/taboj/casa-tabor

MANDATORY FIRST STEP:
Read /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md and /Users/taboj/casa-tabor/PROJECT.md completely.
Also inspect /Users/taboj/casa-tabor/supabase/functions/_shared/email-clusterer.mjs.

Your Objective:
1. Extract and document the exact requirements, schemas, and specifications for:
   - The 200+ case benchmark dataset at `/Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json`.
   - The 6 archetypes: `estate_logistics_and_ecom`, `executive_action_and_financial`, `calendar_and_commitments`, `estate_knowledge_and_governance`, `communications_and_social`, `noise_and_promotions`.
   - Expected routing targets (e.g. `estate_logistics`, `executive_action_queue`, `calendar_suggestions`, `estate_knowledge_feed`, `skip_noise` or similar mappings).
   - Expected agency levels (0 for passive tracking, 1-3 for active human action), canonical keys (e.g. `ORDER:AMAZON:112-1234567-1234567`, `TRACKING:UPS:1Z...`, `FINANCIAL:...`, `FLIGHT:...`, etc.), stage definitions (`confirmed`, `shipped`, `out_for_delivery`, `delivered`, `problem`, `n/a`), and policy disclaimer boolean (`expected_policy_disclaimer`).
   - The empirical report structure at `/Users/taboj/casa-tabor/docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md` (sections, tables, confusion matrix requirements, failure mode analysis, vendor nuances).
   - Verification test requirements at `/Users/taboj/casa-tabor/tests/email-benchmark-verification.test.mjs` and evaluation script at `/Users/taboj/casa-tabor/scripts/email-benchmark-eval.mjs`.
2. Write a detailed `spec_analysis.md` and `handoff.md` in your working directory `/Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/`.
3. Send a concise message to parent with the summary and path to your handoff file.
