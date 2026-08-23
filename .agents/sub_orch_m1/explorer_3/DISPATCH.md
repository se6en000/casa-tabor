## 2026-08-23T11:46:20Z

You are Explorer 3 for Milestone 1 (Historical Corpus Harvester & Semantic Clusterer).
Your working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/
Project root: /Users/taboj/casa-tabor

MANDATORY INPUTS:
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md

Your Task:
Investigate and design the 1,000+ Email Corpus Generation & Test Suite Methodology:
1. Structure of realistic 1,000+ email dataset across Gmail categories (Primary, Updates, Promotions) with diverse realistic senders (Amazon, Delta, UPS, School district, Pediatrician, HOA, Chase, Blue Apron, Target, etc.).
2. Edge cases to cover in test suite: unicode characters, empty snippet/body, malformed headers, nested forwarded threads, multi-category ambiguity, extreme PII density, zero PII, very long emails.
3. Test suite design for `tests/email-harvester-clusterer.test.mjs` verifying:
   - >= 1000 emails generated/harvested
   - 100% PII redaction on sensitive synthetic seeds
   - Accurate distribution across all 6 archetypes (0 unclassified or fallback failure)
   - High classification accuracy/precision (>95% on labeled test cases)
   - Deduplication handling (identical message IDs, duplicate bodies, updated threads)
4. Write your design report to /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_3/report.md and handoff.md.
5. Notify parent with send_message when done.
