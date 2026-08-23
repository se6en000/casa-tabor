# Scope: E2E Testing Track for Autonomous Household Email Intelligence System

## Architecture & Responsibilities
- **Scope**: Requirement-driven opaque-box E2E testing across Tiers 1-4.
- **Key Artifacts**:
  - `TEST_INFRA.md` (Methodology, feature matrix, tier coverage)
  - `tests/e2e-email-intelligence-tiers.test.mjs` (Executable 4-Tier test suite)
  - `TEST_READY.md` (Readiness sign-off once 100% of tests pass)

## Feature Inventory & Test Coverage
| # | Feature Area | Description | Scope Milestone | Status |
|---|--------------|-------------|-----------------|--------|
| 1 | 6 Semantic Archetypes | Classification across 6 archetypes with 0% noise leakage | M1 | PLANNED |
| 2 | Multi-Vendor Canonicalization | Normalizing Walmart, Amazon, Apple, Nike, Jiffy, HelloFresh | M1 | PLANNED |
| 3 | Courier Tracking Normalization | Carrier detection for UPS, FedEx, USPS, DHL | M1 | PLANNED |
| 4 | Tense-Aware Stage Progression | Future arrival guardrails & past auto-resolution | M1 | PLANNED |
| 5 | Compound Email Decomposition | Sibling action extraction & multimodal attachment parsing | M1 | PLANNED |
| 6 | Active Learning Rules | Capture rules, exemplar prompt injection, downvote suppressions | M1 | PLANNED |
| 7 | Tier 2 Boundaries | Malformed MIME, long IDs, date boundaries, ambiguous agency | M1 | PLANNED |
| 8 | Tier 3 Combinations | Pairwise feature interaction tests | M1 | PLANNED |
| 9 | Tier 4 Scenarios | 5 real-world household narrative scenarios | M1 | PLANNED |
| 10| Test Suite Verification | Execution of full suite via `node --test` & `npm test` | M2 | PLANNED |
| 11| Review & Challenge | 2 Reviewers + 2 Challengers | M3 | PLANNED |
| 12| Audit & Sign-off | Forensic Integrity Audit + `TEST_READY.md` | M4 | PLANNED |

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Test Suite Authoring | Author `tests/e2e-email-intelligence-tiers.test.mjs` covering Tiers 1-4 | none | DONE |
| M2 | Test Execution & Fixes | Run `node --test` and verify 100% pass rate | M1 | DONE |
| M3 | Peer Review & Challenge | Dispatch 2 Reviewers and 2 Challengers | M2 | DONE |
| M4 | Forensic Audit & Publication | Dispatch Forensic Auditor, publish `TEST_READY.md`, notify parent | M3 | DONE |
