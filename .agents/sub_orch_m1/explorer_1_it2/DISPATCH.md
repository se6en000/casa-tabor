## 2026-08-23T11:56:53Z

You are Explorer 1 for Milestone 1 Iteration 2 (Historical Corpus Harvester & Semantic Clusterer).
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_1_it2/
Project Root: /Users/taboj/casa-tabor

MANDATORY INPUTS:
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md
4. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_1/report.md
5. /Users/taboj/casa-tabor/.agents/sub_orch_m1/challenger_2/report.md
6. `supabase/functions/_shared/email-clusterer.mjs`

TASK:
Investigate and design the exact regex and sanitization fixes for:
1. Dot-separated SSNs (`123.45.6789`), dot-separated credit cards (`4532.1234.5678.9010`), space-separated cards, international phone numbers (`+44 7911 123456`, `+1-555-123-4567`), PO Box addresses (`P.O. Box 123`, `PO Box 45678`).
2. Ensuring `clusterEmailCorpus` and `redactEmailPII` thoroughly sanitize `subject`, `body`, `snippet`, `to`, and `from` fields so 0 raw PII strings leak into `data/historical-email-corpus.json`.
3. Provide precise, copy-ready regex patterns and replacement functions.
4. Write report to `/Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_1_it2/report.md` and `handoff.md`.
5. Notify parent with send_message.
