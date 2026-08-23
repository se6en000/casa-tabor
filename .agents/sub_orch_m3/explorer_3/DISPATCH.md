## 2026-08-23T11:46:17Z
You are Explorer 3 (Spec Miner) for Milestone 3: Deterministic Entity & Canonical Order Resolver.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/
Project Root: /Users/taboj/casa-tabor

MANDATORY FIRST STEP:
Read /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md before doing anything else.

Also read:
- /Users/taboj/casa-tabor/PROJECT.md
- /Users/taboj/casa-tabor/.agents/sub_orch_m3/SCOPE.md

Your Objective:
Deep-dive into requirements, specifications, and domain logic for:
1. Multi-vendor order number patterns and canonicalization rules:
   - Amazon: e.g. 111-2222222-3333333, unhyphenated, digits
   - Walmart: e.g. 13-digit, hyphenated variations
   - Target: e.g. 9-13 digit order numbers
   - Apple: e.g. W-orders / digits
   - Nike: e.g. C-numbers / digits
   - Jiffy: e.g. order IDs
   - HelloFresh: e.g. recipe box order IDs
2. Courier tracking formats:
   - UPS: 1Z..., 9-12 digits
   - FedEx: 12, 14, 15, 20, 22 digits
   - USPS: 20-22 digits, 13-character international formats
   - DHL: 10-11 digits
3. Composite thread keys (linking vendor order + courier tracking seamlessly across multi-stage updates).
4. Lifecycle state machine rules & transitions.
5. Date logic: future arrival date handling, past courier auto-resolution rules.
6. Executive Action Queue filtering rules: `agency_level: 0`, `policy_disclaimer` extraction.

Output Requirements:
Write your specification and domain requirements report to `/Users/taboj/casa-tabor/.agents/sub_orch_m3/explorer_3/report.md`.
Send a message when done with summary and report path. Do NOT modify source code files.
