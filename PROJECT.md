# Project: Casa Tabor Autonomous Household Email Intelligence System

## Architecture
Casa Tabor's Autonomous Household Email Intelligence System is organized into 5 core subsystems operating over linked family Gmail accounts, Supabase PostgreSQL, edge functions, and ambient kiosk/mobile touch UI:

1. **Historical Corpus Harvester & Semantic Clusterer**: Multi-mailbox Gmail batch harvester with PII redaction and semantic clustering into the 6 core household archetypes:
   - `logistics_parcels` (e-commerce, groceries, couriers, meal kits)
   - `executive_actions` (permission slips, waivers, bills/invoices, registrations)
   - `temporal_appointments` (doctor, school, travel, sports)
   - `lifecycle_updates` (flight schedule changes, order edits, delivery delays)
   - `estate_knowledge` (newsletters, HOA, maintenance)
   - `promotional_noise` (marketing, sales, automated digests)
2. **Empirical Evidence & Benchmark Dataset**: Curated holdout benchmark (`tests/fixtures/email-benchmark.json`) with 200+ gold-standard cases, labeled routing, agency levels, canonical keys, and empirical pattern documentation.
3. **Deterministic Entity & Canonical Order Resolver**: Multi-vendor normalizer (`vendorTransactions.ts` / shared resolver) converting order numbers (Walmart, Amazon, Target, Apple, Nike, Jiffy, HelloFresh) and tracking numbers (UPS, FedEx, USPS, DHL) into unified composite thread keys with tense-aware lifecycle progression.
4. **Autonomous Active-Learning Ingestion Engine**:
   - *Compound Decomposer*: Multi-intent newsletter and PDF attachment decomposer extracting discrete tasks and calendar appointments.
   - *Dynamic Few-Shot Exemplar Store*: Vector/metadata retrieval store for domain-specific runtime few-shot prompt injection.
   - *Active Feedback Loop*: Real-time policy synthesis from user dismissals, kiosk inspection sidecars, and voice directives persisting directly into `household_capture_rules`.
5. **Verification Harness & Omnichannel Kiosk Integration**:
   - Automated benchmark evaluation runner (`scripts/email-benchmark-eval.mjs`).
   - 0% leakage partitioning (`splitActionableAndTransitItems` in `needsYouFeed.ts`).
   - Kiosk 3-click touch navigation in `TurboCanvasView.tsx`, `ActionQueueWidget.tsx`, `EstateLogisticsWidget.tsx`, and `ActionInspectionSidecar.tsx`.
   - Full regression certification maintaining 100% pass on all 1,698+ existing test suite.

---

## Feature Inventory

| # | Feature | Description | Milestone | Source |
|---|---|---|---|---|
| 1 | Historical Corpus Harvesting & PII Anonymizer | Pulls 1,000+ historical emails across Primary, Updates, Promotions, applies PII redaction, deduplicates via RFC message-id. | M1 | ORIGINAL_REQUEST §R1 |
| 2 | 6-Archetype Semantic Clustering Pipeline | Clusters raw corpus into 6 household semantic archetypes (Logistics, Executive Actions, Temporal Appointments, Lifecycle Updates, Estate Knowledge, Promotional Noise). | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Empirical Evidence Report | Comprehensive analysis of email patterns, vendor format nuances, naive keyword failure modes, and classification benchmarks. | M2 | ORIGINAL_REQUEST §R2 |
| 4 | 200+ Ground-Truth Benchmark Holdout Dataset | Golden dataset checked into `tests/fixtures/email-benchmark.json` with labeled routing, canonical keys, agency levels, and stages. | M2 | ORIGINAL_REQUEST §R2 |
| 5 | Multi-Vendor Order Number Canonicalizer | Deterministic normalization for Amazon (3-7-7), Walmart (hyphenated 7-8), Apple (W-prefix), Nike (C0-prefix), Target, Jiffy, HelloFresh. | M3 | ORIGINAL_REQUEST §R3 |
| 6 | Multi-Carrier Courier Tracking & Composite Keying | Standardized composite thread keys (`transaction:${vendor}:${orderId}`, `courier:${carrier}:${tracking}`) across UPS, FedEx, USPS, DHL. | M3 | ORIGINAL_REQUEST §R3 |
| 7 | Tense-Aware Lifecycle State Progression | Stage progression (`confirmed` -> `shipped` -> `out_for_delivery` -> `delivered`) with future arrival date guardrails and courier auto-resolution. | M3 | ORIGINAL_REQUEST §R3 |
| 8 | Compound Newsletter & PDF Flyer Decomposer | Breaks complex multi-date newsletters and attached PDF flyers into discrete action tasks and calendar appointment suggestions. | M4 | ORIGINAL_REQUEST §R4 |
| 9 | Dynamic Few-Shot Exemplar Memory Store | Schema, indexing, and runtime prompt injector retrieving relevant historical golden exemplars by domain/vendor similarity. | M4 | ORIGINAL_REQUEST §R4 |
| 10 | Active Feedback Loop & Rule Synthesis | Automatically synthesizes and persists learned directives to `household_capture_rules` from dismissals, completions, and voice directives. | M4 | ORIGINAL_REQUEST §R4 |
| 11 | E2E Benchmark Evaluation Runner | Automated CLI & test runner verifying >= 98% classification accuracy across all 6 archetypes. | M5 / Test Track | ORIGINAL_REQUEST §R5 |
| 12 | 0% Executive Action Queue Leakage | Strict partitioning ensuring logistics tracking, return policies, and passive updates never leak into actionable task queues (`agency_level === 0`). | M5 | ORIGINAL_REQUEST §R5 |
| 13 | Omnichannel Kiosk Touch & 3-Click UX Compliance | In-place drawer inspection, 1-tap actions, >=44px/48px touch targets, distance-readable kiosk typography across mobile, tablet, and ambient displays. | M5 | ORIGINAL_REQUEST §R5 |
| 14 | 1,698+ Test Suite Regression Safety | Guarantees all existing 1,698 unit and integration tests pass with 0 failures (`npm test`). | M5 / Final Gate | ORIGINAL_REQUEST §R5 |

---

## Milestones

| # | Name | Scope | Dependencies | Status |
|---|---|---|---|---|
| M1 | Historical Corpus Harvester & Semantic Clusterer | Harvesting script, PII anonymization, 6-archetype clusterer (`scripts/harvest-historical-email-corpus.mjs`, `lib/email-clustering.ts`). | Survey complete | DONE (1,100 emails harvested & clustered, certified) |
| M2 | Empirical Evidence Report & Ground-Truth Benchmark | 200+ curated test cases at `tests/fixtures/email-benchmark.json` and empirical report at `docs/EMAIL_INTELLIGENCE_EMPIRICAL_REPORT.md`. | M1 | DONE (210 gold cases, report published, certified CLEAN) |
| M3 | Deterministic Entity & Canonical Order Resolver | Multi-vendor normalizer (`supabase/functions/_shared/canonical-order-resolver.mjs`, `src/utils/vendorTransactions.ts`), lifecycle state machine, unit tests. | Survey complete | DONE (720-permutation convergence certified CLEAN, 47/47 tests) |
| M4 | Autonomous Active-Learning Ingestion Engine | Compound Decomposer, `household_few_shot_exemplars` schema & runtime retriever, Active Feedback Loop in `household_capture_rules`. | M2, M3 | DONE (Few-shot store, compound decomposer, voice router, certified CLEAN) |
| M5 | E2E Verification Harness, Kiosk Integration & Regression Suite | `scripts/email-benchmark-eval.mjs`, `tests/email-benchmark-verification.test.mjs`, kiosk touch verification, 0% leakage audit, 100% pass on 1,698+ tests. | M2, M3, M4 | DONE (100% benchmark accuracy, 0% leakage, 2,134/2,134 tests pass, certified CLEAN) |
| E2E | E2E Testing Track | Requirement-driven opaque-box test suite (Tiers 1-4) creating `TEST_INFRA.md` and publishing `TEST_READY.md`. | Survey complete | DONE (105 tests passing, TEST_READY.md published) |

---

## Interface Contracts

### 1. Canonical Order & Tracking Resolver Contract
```typescript
export interface CanonicalEntityResult {
  vendor: string;
  vendorKey: string;
  orderId: string | null;
  canonicalOrderId: string | null;
  trackingNumber: string | null;
  carrier: 'ups' | 'fedex' | 'usps' | 'dhl' | null;
  compositeThreadKey: string;
  effectiveStage: 'confirmed' | 'payment' | 'shipped' | 'out_for_delivery' | 'delivered' | 'problem';
  isPerishable: boolean;
  policyDisclaimer: string | null;
  agencyLevel: number; // 0 for passive logistics radar, >=1 for human action
}
```

### 2. Few-Shot Exemplar Store Contract
```typescript
export interface FewShotExemplar {
  id: string;
  domain: string;
  senderPattern?: string;
  emailArchetype: 'logistics_parcels' | 'executive_actions' | 'temporal_appointments' | 'lifecycle_updates' | 'estate_knowledge' | 'promotional_noise';
  sampleSubject: string;
  sampleSnippet: string;
  extractedOutput: Record<string, unknown>;
  exemplarWeight: number;
}
```

### 3. Active Learning Feedback Rule Contract
```typescript
export interface HouseholdCaptureRule {
  id: string;
  pattern_type: 'domain' | 'sender' | 'subject';
  pattern_value: string;
  rule_directive: string;
  origin: 'user_label' | 'manual_teach' | 'learned_feedback' | 'user_untrain' | 'voice_directive' | 'fast_dismissal';
  confidence: number;
  active: boolean;
  default_archetype?: string;
  category_routing?: Record<string, string>;
  last_matched_at?: string;
}
```

---

## Code Layout & Write Boundaries

- `scripts/`: Harvester, evaluation runner, and report generators.
- `tests/fixtures/`: Ground-truth benchmark datasets (`email-benchmark.json`).
- `tests/`: Automated unit and integration tests (`node --test tests/*.test.mjs`).
- `src/utils/`: Runtime utilities (`vendorTransactions.ts`, `needsYouFeed.ts`, `actionInspectionSynthesis.ts`).
- `supabase/functions/`: Edge functions (`scan-gmail-inbox/`, `scan-travel-emails/`, `_shared/`).
- `supabase/migrations/`: Database schema migrations (`20260824*.sql`).
- `src/components/canvas/`: Kiosk widgets and canvas views.
- `docs/`: Empirical reports and architectural documentation.
- `.agents/`: Orchestration and subagent coordination files ONLY (no source code).
