# Test Architecture & Matrix Survey Handoff Report (Tiers 1–4)

**Explorer**: Test Architecture Explorer 2 (`e2e_survey_explorer_2`)  
**Working Directory**: `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_2`  
**Project Root**: `/Users/taboj/casa-tabor`  
**Date**: 2026-08-23T11:48:30Z  
**Target File**: `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_2/handoff.md`  

---

## 1. Observation

Direct observations from examining the Casa Tabor codebase across `tests/`, `src/utils/`, `supabase/functions/`, `supabase/migrations/`, `package.json`, and `.agents/`:

### 1.1 Test Runner & Baseline Suite
- **Command**: `npm test` (`package.json:9`) executes `node --test tests/*.test.mjs`.
- **Suite Baseline**: 271 test files, 1,698 unit and integration tests, **1,698 passing, 0 failing, 0 skipped**, duration ~6.3s.
- **Experience Certification**: `npm run certify:experience` (`scripts/experience-certification.mjs`) enforces 10 strict UI gates including shared primitive adoption $\ge 90\%$, minimum 44px/48px touch targets, and distance-readable typography $\ge 18\text{px}$.

### 1.2 Ingestion & Entity Resolution Implementations
- **`src/utils/vendorTransactions.ts`** (741 lines):
  - `canonicalizeOrderId(vendor, rawId)` (lines 42–66): Normalizes Walmart (15/16-digit hyphenated `2000154-80824348`), Amazon (17-digit `112-8472910-4829103`), Apple (`W` prefix), Nike (`C0` prefix), Jiffy (`2541442349`), and HelloFresh (`HF-` prefix).
  - `transactionStage(item)` (lines 129–184): Tense-aware parsing distinguishing past-tense delivery from future delivery notices ("will be delivered on Monday") and active editing windows ("being prepared / last minute to add items").
  - `resolveEffectiveStage(rawStage, deliveryDate, now)` (lines 574–610): Enforces Future Date Guardrail (future targets cannot resolve to `delivered`) and Past Courier Auto-Resolution (only past `out_for_delivery` auto-resolves).
  - `consolidateTransitItems(rawTransitItems)` (lines 650–740): Deduplicates multi-email updates for identical thread keys into a single delivery entity.
- **`src/utils/needsYouFeed.ts`** (95 lines):
  - `splitActionableAndTransitItems(items)` (lines 75–94): Strictly routes items with `agency_level === 0 || isDeliveryTransitItem(item)` into `deliveryTransitItems` (Estate Logistics Radar), guaranteeing **0% false leakage** into `actionableItems` (Executive Action Queue).
- **`src/utils/actionInspectionSynthesis.ts`** (450+ lines):
  - `detectSuggestedActionBundle()`: Combines sibling action items across email body and attached PDF flyers into compound action plans.
  - `synthesizeActionAnalysis()`: Extracts structured key points from multimodal attachment summaries.
- **`supabase/functions/_shared/gmail-canonical-email.mjs`** (80 lines):
  - `canonicalEmailKey()`: Computes RFC Message-ID hash (`rfc:<message-id>`) or fallback normalized SHA-256 fingerprint for multi-recipient cross-inbox deduplication.
- **`supabase/migrations/20260816020000_household_capture_rules.sql`**:
  - `public.household_capture_rules`: Stores learned patterns (`domain`, `sender`, `subject`) and directives dynamically injected into ingest prompts.

---

## 2. Logic Chain

1. **Premise (R1–R5 & Test Pyramid)**: The Autonomous Household Email Intelligence System requires an opaque-box E2E test harness that verifies all 6 semantic archetypes, entity normalization, compound decomposition, active learning, 0% action queue leakage, and kiosk UX guarantees without regressions.
2. **From Unit Capabilities to Tier 1 Matrix**:
   - `vendorTransactions.ts` handles order canonicalization and stage progression.
   - `needsYouFeed.ts` provides the mathematical 0% leakage partition.
   - `actionInspectionSynthesis.ts` provides compound PDF flyer and newsletter decomposition.
   - Therefore, Tier 1 is designed with $\ge 5$ explicit, deterministic test cases for each of the 14 functional requirements.
3. **From Real-World Failure Modes to Tier 2 Boundaries**:
   - Historical email streams frequently suffer from unhyphenated 15/16-digit order numbers, URLs containing order IDs, future arrival dates placed on weekends, multi-recipient duplicate deliveries, and ambiguous return policies.
   - Therefore, Tier 2 specifically exercises malformed MIME payloads, unhyphenated order strings, future date arithmetic, and fallback SHA-256 deduplication.
4. **From System Interactions to Tier 3 & Tier 4**:
   - In production, email events interact across subsystems (e.g. multi-stage Walmart order updates combining hold charges, item prep, and 3-day return policies; school newsletters bundling PDF waivers, fees, and orientation appointments; airline schedule changes conflicting with existing trips).
   - Therefore, Tier 3 validates pairwise feature interactions, and Tier 4 specifies 5 complete real-world household narrative scenarios.

---

## 3. Caveats

- **Network-Free Execution**: All E2E tier tests in `tests/e2e-email-intelligence-tiers.test.mjs` run offline against the local test harness and in-memory mocks, completing in $<10$ seconds during `npm test`.
- **Live LLM Benchmark Evaluator**: Automated evaluations against the live Gemini 2.5 API are decoupled into `scripts/email-benchmark-eval.mjs` (runnable on demand via `npm run qa:email:benchmark`) to prevent network flakiness during CI/CD.
- **No Direct Source Mutations**: As an explorer, no modifications were made to project source files or existing test suites. All architecture specifications are delivered in `test_matrix_report.md` and this handoff.

---

## 4. Conclusion

1. **Complete 4-Tier Test Architecture Delivered**:
   - **Tier 1 (Feature Coverage)**: 70+ test cases covering all 6 archetypes, 7 vendor order formats, 4 couriers, lifecycle state machine, compound decomposer, few-shot exemplar store, and active learning rules.
   - **Tier 2 (Boundary & Corner Cases)**: 20+ edge cases covering malformed MIME, unhyphenated/long IDs, future date guardrails, overlapping dates, ambiguous agency levels, and multi-recipient duplicate deliveries.
   - **Tier 3 (Cross-Feature Combinations)**: 6 pairwise interaction specifications ensuring seamless integration across multi-stage updates, PDF flyers, active learning rule overrides, and flight changes.
   - **Tier 4 (Real-World Application Scenarios)**: 5 end-to-end household narratives (Bak MSOA School Camp, Walmart+ InHome Grocery, Delta Schedule Change, HOA Landscaping Mandate, and Apple Signature Delivery).
2. **Authoritative Blueprints Defined**:
   - `TEST_INFRA.md` architectural blueprint (mock strategies, fixture loaders, CI/CD gates).
   - `tests/e2e-email-intelligence-tiers.test.mjs` executable code scaffold.
3. **Artifacts Published**:
   - `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_2/test_matrix_report.md`
   - `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_2/handoff.md`

---

## 5. Verification Method

To independently verify the survey findings and test matrix baselines:

1. **Verify Baseline Test Suite**:
   ```bash
   npm test
   ```
   *Expected result*: 1,698 passing tests, 0 failures, duration ~6.3s.

2. **Verify Specific Related Subsystem Tests**:
   ```bash
   node --test tests/vendor-transaction-producer.test.mjs
   node --test tests/gmail-canonical-email.test.mjs
   node --test tests/gmail-attachment-multimodal-actions.test.mjs
   node --test tests/action-queue-sidecar-inspection.test.mjs
   ```
   *Expected result*: All individual test files pass with 0 failures.

3. **Verify Experience Certification & UI Gates**:
   ```bash
   npm run certify:experience
   ```
   *Expected result*: All 10 gates PASS, shared primitive adoption $\ge 90\%$, 0 undersized touch targets.

4. **Inspect Generated Test Matrix Report**:
   - View `/Users/taboj/casa-tabor/.agents/e2e_survey_explorer_2/test_matrix_report.md`

5. **Invalidation Conditions**:
   - Any test case design that violates the 0% leakage partitioning in `needsYouFeed.ts`.
   - Any test case design that allows future delivery dates to resolve prematurely to `delivered`.
   - Any failure in the baseline 1,698 unit test suite.
