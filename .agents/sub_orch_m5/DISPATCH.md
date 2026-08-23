## 2026-08-23T12:39:21Z

You are the Sub-Orchestrator for Milestone 5 (Final Milestone): Verification Harness, Omnichannel Kiosk Integration & Full Regression Pass.
Working Directory: /Users/taboj/casa-tabor/.agents/sub_orch_m5/
Project Root: /Users/taboj/casa-tabor
Original User Request: /Users/taboj/casa-tabor/.agents/ORIGINAL_REQUEST.md
Project Master Scope: /Users/taboj/casa-tabor/PROJECT.md
Test Infrastructure Index: /Users/taboj/casa-tabor/TEST_INFRA.md
E2E Test Readiness: /Users/taboj/casa-tabor/TEST_READY.md
Benchmark Dataset: /Users/taboj/casa-tabor/tests/fixtures/email-benchmark.json
Historical Corpus: /Users/taboj/casa-tabor/data/historical-email-corpus.json

Scope & Mission (R5):
1. **Phase 1: Verification Harness & E2E Test Pass (Tiers 1-4 & Benchmark)**:
   - Run the E2E benchmark evaluation runner: `node scripts/email-benchmark-eval.mjs`.
   - Verify >=98% accuracy across all 6 archetypes on the 210-case holdout benchmark dataset.
   - Verify strictly 0% false leakage of passive return/claim policy disclaimers or shipping tracking into the Executive Action Queue.
   - Verify multi-email lifecycle progression (Order Placed -> Being Prepared -> Out for Delivery -> Delivered) with zero premature next-day auto-resolutions.
2. **Omnichannel Kiosk UX Verification**:
   - Verify 3-click navigation constraint, non-blocking sidecar inspection, and touch readiness across `TurboCanvasView.tsx`, `ActionQueueWidget.tsx`, `EstateLogisticsWidget.tsx`, and `ActionInspectionSidecar.tsx`.
   - Run experience certification gates (`npm run certify:experience`), style checks (`npm run style:check`, `npm run tokens:check`), and production build (`npm run build`).
3. **Phase 2: Adversarial Coverage Hardening (Tier 5)**:
   - Run adversarial Challengers to probe edge case coverage, concurrent multi-mailbox ingestion, and active learning feedback loop persistence.
4. **Full Regression Certification**:
   - Verify full regression suite (`npm test`) passes with 0 failures across all existing 2,134+ tests.
5. **Gating & Forensic Audit**:
   - Dispatch independent Reviewers, Challengers, and Forensic Auditor.
   - Evaluate Gate in GATE_STATUS.md. Pass criteria: 100% test pass, all reviews approve, all challengers approve, CLEAN forensic audit verdict.
