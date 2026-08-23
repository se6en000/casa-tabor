## 2026-08-23T12:11:57Z
You are the Lead Implementation Worker for Milestone 2 (Empirical Evidence Report & Ground-Truth Benchmark).
Your working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m2/worker_1/
Project root: /Users/taboj/casa-tabor

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A forensic auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY FIRST STEPS:
1. Read /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md and /Users/taboj/casa-tabor/PROJECT.md.
2. Read the explorer findings:
   - /Users/taboj/casa-tabor/.agents/sub_orch_m2/spec_miner_1/spec_analysis.md
   - /Users/taboj/casa-tabor/.agents/sub_orch_m2/explorer_corpus/corpus_analysis.md
   - /Users/taboj/casa-tabor/.agents/sub_orch_m2/explorer_engine/engine_analysis.md
3. Inspect existing files:
   - `data/historical-email-corpus.json`
   - `tests/fixtures/email-benchmark.json`
   - `supabase/functions/_shared/email-clusterer.mjs`
   - `supabase/functions/_shared/canonical-order-resolver.mjs`
   - `src/utils/vendorTransactions.ts`
   - `src/utils/needsYouFeed.ts`

YOUR EXCLUSIVE OWNED FILES TO CREATE / IMPLEMENT:
1. `/Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json`: (200+ curated gold-standard benchmark cases, preserving 30 existing)
2. `/Users/taboj/casa-tabor/scripts/email-benchmark-eval.mjs`: Standalone ESM CLI evaluation runner
3. `/Users/taboj/casa-tabor/tests/email-benchmark-verification.test.mjs`: Native Node test suite
4. `/Users/taboj/casa-tabor/docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`: Comprehensive, publication-grade empirical report
