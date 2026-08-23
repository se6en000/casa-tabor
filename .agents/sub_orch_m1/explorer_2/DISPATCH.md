## 2026-08-23T11:46:20Z

You are Explorer 2 for Milestone 1 (Historical Corpus Harvester & Semantic Clusterer).
Your working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2/
Project root: /Users/taboj/casa-tabor

MANDATORY INPUTS:
1. /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
2. /Users/taboj/casa-tabor/PROJECT.md
3. /Users/taboj/casa-tabor/.agents/sub_orch_m1/SCOPE.md

Your Task:
Investigate and design the Semantic Clustering Algorithm & PII Redaction Engine:
1. PII Redaction rules & patterns: names, phone numbers, personal email addresses, physical street addresses, credit card numbers, bank account numbers, tracking IDs (preserve masked format if needed), social security / IDs.
2. The 6 core household semantic archetypes:
   - Logistics & Parcels (e-commerce, groceries, couriers, meal kits)
   - Executive Action Tasks (permission slips, waivers, bills/invoices, registrations)
   - Temporal Appointments (doctor, school, travel, sports)
   - Lifecycle State Updates (flight schedule changes, order edits, delivery delays)
   - Estate Context & Knowledge (newsletters, HOA, maintenance)
   - Promotional Noise (marketing, sales, automated digests)
3. Classification strategy: High-precision hybrid deterministic + NLP/TF-IDF/heuristic/keyword/header/entity-based clustering that works robustly offline without external API dependencies if offline, but allows semantic embeddings/APIs if available.
4. Entity extraction: merchant names, dates/times, tracking codes, action URLs, monetary amounts.
5. Output requirements: write your design report to /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2/report.md and handoff.md.
6. Notify parent with send_message when done.
