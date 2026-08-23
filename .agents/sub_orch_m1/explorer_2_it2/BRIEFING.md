# BRIEFING — 2026-08-23T11:58:45Z

## Mission
Investigate and design classification precedence fixes in email-clusterer.mjs to prevent retailer promotional overlap and ensure robust routing for promotional_noise vs logistics_parcels.

## 🔒 My Identity
- Archetype: explorer
- Roles: read-only investigator, analyzer, synthesizer
- Working directory: /Users/taboj/casa-tabor/.agents/sub_orch_m1/explorer_2_it2/
- Original parent: bb0d3442-97e2-4840-9e74-a4079743336d
- Milestone: Milestone 1 Iteration 2 (Historical Corpus Harvester & Semantic Clusterer)

## 🔒 Key Constraints
- Read-only investigation — do NOT implement directly in production files
- Adhere to Teamwork protocol and 5-component handoff format
- Ensure Tier 1 retail domain routing does not short-circuit promotional checks
- Only genuine parcel shipment, delivery confirmation, order placed, tracking updates route to logistics_parcels

## Current Parent
- Conversation ID: bb0d3442-97e2-4840-9e74-a4079743336d
- Updated: 2026-08-23T11:58:45Z

## Investigation State
- **Explored paths**: `supabase/functions/_shared/email-clusterer.mjs`, `scripts/harvest-historical-email-corpus.mjs`, `tests/test-merchant-promo-leakage.mjs`, `tests/test-pii-obfuscation-deep.mjs`, `tests/email-clusterer-stress.test.mjs`, `tests/adversarial-clusterer.test.mjs`, `tests/email-harvester-clusterer.test.mjs`, `challenger_1/report.md`, `challenger_2/report.md`.
- **Key findings**:
  1. Retailer domains in Tier 1 short-circuit before promotional checks, causing 100% false routing on merchant circulars/deals.
  2. FPL bills matching "disruption" keyword in outage rule caused 33/200 executive action misclassifications.
  3. PII regexes missed dot/underscore SSNs, international phone numbers, PO Boxes, and `clusterEmailCorpus` leaked `snippet` and `to`.
  4. Multi-hop forward headers need `lastIndexOf()` unwrapping.
- **Unexplored areas**: None. All mandatory inputs and stress tests evaluated.

## Key Decisions Made
- Designed a 5-layer classification precedence hierarchy disentangling couriers from multi-purpose retailers.
- Designed promotional pre-screening for retail domains that routes marketing circulars to `promotional_noise` while preserving transactional delivery orders.
- Fixed utility precedence (billing & fraud before outages, qualified outage regex).
- Expanded PII sanitization and data object anonymization.
- Formatted complete report in `report.md` and 5-component `handoff.md`.

## Artifact Index
- DISPATCH.md — Initial dispatch record
- BRIEFING.md — Situational awareness
- progress.md — Liveness heartbeat
- report.md — Comprehensive findings & architecture blueprint
- handoff.md — 5-component handoff report
